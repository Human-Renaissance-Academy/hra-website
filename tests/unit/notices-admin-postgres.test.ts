// @vitest-environment node
/**
 * 관리자 공지의 실제 저장·누락 결과와 단일 반전 SQL을 격리 PostgreSQL에서 검증합니다.
 * Neon 전송만 소유 Unix 소켓에 연결하고 실제 Drizzle 체인과 서비스를 실행합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted((): { database: NeonHttpDatabase<typeof schema> | undefined } => ({ database: undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import * as service from "@/features/notices/admin/service";
import * as repository from "@/features/notices/admin/repository";

const bin = process.env.HRA_TEST_PG_BIN;
const id = "10000000-0000-4000-8000-000000000001";
const missing = "10000000-0000-4000-8000-000000000099";
const actor = { userId: "20000000-0000-4000-8000-000000000001", role: "ADMIN" };
const input = { title: "신규 공지", content: "신규 본문", status: "PUBLISHED", pinned: true } as const;

describe.skipIf(!bin)("관리자 공지의 격리 PostgreSQL 저장 계약", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const statements: string[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TYPE notice_status AS ENUM ('DRAFT','PUBLISHED');
      CREATE TABLE notices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(300) NOT NULL,
        content text NOT NULL, status notice_status NOT NULL DEFAULT 'DRAFT', pinned boolean NOT NULL DEFAULT false,
        author_id uuid, view_count integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now());`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (destination: unknown, options: RequestInit) => {
      if (String(destination) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const payload = JSON.parse(String(options.body));
      statements.push(payload.query);
      return Response.json(await transport(payload));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    cluster.sql(`TRUNCATE notices; INSERT INTO notices(id,title,content,author_id,created_at)
      VALUES('${id}','기존 공지','기존 본문','${actor.userId}','2026-10-01');`);
    statements.length = 0;
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("생성은 네 입력 필드와 관리자 작성자를 실제 저장한다", async () => {
    // 준비: 생성 입력은 기존 행과 구별됩니다.
    // 실행: 서비스의 생성 명령입니다.
    await service.createNotice(actor, input);
    // 확인: 실제 저장값과 한 번의 INSERT입니다.
    expect(cluster.sql("SELECT title,content,status,pinned,author_id FROM notices WHERE title='신규 공지'"))
      .toBe(`신규 공지|신규 본문|PUBLISHED|t|${actor.userId}`);
    expect(statements).toHaveLength(1); expect(statements[0]).toMatch(/^insert /i);
  });

  it("수정은 존재 조회 뒤 네 필드만 변경하고 작성자와 조회수를 유지한다", async () => {
    // 준비: 기존 합성 행입니다.
    // 실행: 수정 서비스입니다.
    const result = await service.updateNotice(actor, id, input);
    // 확인: 실제 DB의 변경과 기존 두 문장 순서입니다.
    expect(result).toBe(true);
    expect(cluster.sql(`SELECT title,content,status,pinned,author_id,view_count FROM notices WHERE id='${id}'`))
      .toBe(`신규 공지|신규 본문|PUBLISHED|t|${actor.userId}|0`);
    expect(statements).toHaveLength(2); expect(statements[0]).toMatch(/^select /i); expect(statements[1]).toMatch(/^update /i);
  });

  it("삭제는 존재 조회 뒤 실제 대상만 지운다", async () => {
    // 준비: 합성 대상 행입니다.
    // 실행: 삭제 서비스입니다.
    const result = await service.deleteNotice(actor, id);
    // 확인: 실제 삭제와 기존 두 문장 순서입니다.
    expect(result).toBe(true);
    expect(cluster.sql("SELECT count(*) FROM notices")).toBe("0");
    expect(statements).toHaveLength(2); expect(statements[1]).toMatch(/^delete /i);
  });

  it.each(["updateNotice", "deleteNotice"] as const)("%s의 누락 대상은 존재 조회만 실행한다", async name => {
    // 준비: 유효하지만 없는 ID입니다.
    // 실행: 수정 또는 삭제 명령입니다.
    const result = name === "updateNotice" ? await service.updateNotice(actor, missing, input) : await service.deleteNotice(actor, missing);
    // 확인: 실제 쓰기 없이 실패합니다.
    expect(result).toBe(false); expect(statements).toHaveLength(1); expect(statements[0]).toMatch(/^select /i);
  });

  it("실제 UPDATE에서 사라진 대상은 빈 RETURNING으로 실패한다", async () => {
    // 준비: 존재 조회 이후 대상이 사라진 상황의 저장소 경계입니다.
    // 실행: 없는 행에 기존 UPDATE를 실행합니다.
    const result = await repository.updateNotice(missing, input);
    // 확인: 실제 빈 RETURNING을 성공으로 바꾸지 않습니다.
    expect(result).toBe(false); expect(statements).toHaveLength(1); expect(statements[0]).toMatch(/^update /i);
  });

  it.each([
    { name: "고정", run: () => service.togglePin(actor, id), expected: { pinned: true }, expression: /NOT "notices"\."pinned"/ },
    { name: "게시", run: () => service.toggleStatus(actor, id), expected: { status: "PUBLISHED" }, expression: /CASE WHEN "notices"\."status" = 'DRAFT'[\s\S]*'PUBLISHED'::notice_status[\s\S]*'DRAFT'::notice_status END/ },
  ])("$name 반전은 저장값을 단일 UPDATE RETURNING으로 반환한다", async ({ run, expected, expression }) => {
    // 준비: 고정 해제·초안의 기존 행입니다.
    // 실행: 한 번의 서비스 반전 명령입니다.
    const result = await run();
    // 확인: SELECT 없이 기존 SQL 식과 RETURNING을 실행합니다.
    expect(result).toEqual(expected); expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^update /i); expect(statements[0]).toMatch(expression);
    expect(statements[0]).toMatch(/where "notices"\."id" = \$\d+ returning /);
  });

  it.each(["togglePin", "toggleStatus"] as const)("%s의 누락 대상도 단일 UPDATE에서 판단한다", async name => {
    // 준비: 없는 ID입니다.
    // 실행: 반전 명령입니다.
    const result = await service[name](actor, missing);
    // 확인: 읽기 없이 null을 반환합니다.
    expect(result).toBeNull(); expect(statements).toHaveLength(1); expect(statements[0]).toMatch(/^update /i);
  });

  it("관리자 목록은 초안도 포함하고 고정보다 작성일 내림차순을 우선한다", async () => {
    // 준비: 오래된 고정 게시 행과 새로운 초안입니다.
    cluster.sql(`UPDATE notices SET pinned=true,status='PUBLISHED';
      INSERT INTO notices(id,title,content,created_at) VALUES('${missing}','새 초안','초안 본문','2026-10-02');`);
    // 실행: 실제 목록 조회입니다.
    const result = await service.listAdminNotices(actor);
    // 확인: 필터·limit·고정 우선 정렬을 새로 넣지 않았습니다.
    expect(result.map(row => row.id)).toEqual([missing, id]);
    expect(Object.keys(result[0])).toEqual(["id", "title", "content", "status", "pinned", "createdAt"]);
  });
});
