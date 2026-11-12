// @vitest-environment node
/**
 * 관리자 언론보도 저장소의 정렬·생성·조건부 수정·멱등 삭제·원자 순서를 실제 PostgreSQL로 검증합니다.
 * 소유 클러스터의 합성 행만 사용하고 외부 DB 요청을 차단합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => {
  let database: NeonHttpDatabase<typeof schema> | undefined;
  return { get database() { return database; }, set database(value: NeonHttpDatabase<typeof schema> | undefined) { database = value; } };
});
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));

import { listAdminItems, getAdminItem, createItem, updateItem, deleteItem, reorderItems } from "@/features/press/admin/service";
import { recordPressView } from "@/features/press/view-service";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };
const first = "81000000-0000-4000-8000-000000000001";
const second = "81000000-0000-4000-8000-000000000002";
const third = "81000000-0000-4000-8000-000000000003";
const missing = "81000000-0000-4000-8000-000000000099";
const input = { title: "합성 수정", source: "합성 출처", url: "https://press.invalid/updated", publishedAt: "2026-10-24" };

describe.skipIf(!bin)("관리자 언론보도 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let beforeUpdate: (() => void) | undefined;
  const statements: { query: string; rowCount: number }[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE press_articles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(300) NOT NULL,
      source varchar(200) NOT NULL, url text NOT NULL, published_at timestamp NOT NULL,
      description text, image_url text, "order" integer NOT NULL DEFAULT 0,
      view_count integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (address: unknown, options: RequestInit) => {
      if (String(address) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const payload = JSON.parse(String(options.body));
      if (/^update /i.test(payload.query) && beforeUpdate) {
        const execute = beforeUpdate; beforeUpdate = undefined; execute();
      }
      try {
        const result = await transport(payload);
        statements.push({ query: payload.query, rowCount: result.rowCount });
        return Response.json(result);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    statements.length = 0; beforeUpdate = undefined;
    cluster.sql(`TRUNCATE press_articles;
      INSERT INTO press_articles(id,title,source,url,published_at,"order",created_at) VALUES
        ('${first}','기사 가','합성','https://press.invalid/a','2026-10-24',2,'2026-10-01'),
        ('${second}','기사 나','합성','https://press.invalid/b','2026-10-01',2,'2026-09-01'),
        ('${third}','기사 다','합성','https://press.invalid/c','2026-10-24',1,'2026-10-10');`);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch; neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined; cluster?.close();
  });

  it("순서 동점은 게시일이 아니라 생성일 오름차순으로 정렬한다", async () => {
    // 준비: 순서와 게시일이 생성일 정렬과 충돌합니다.
    // 실행: 관리자 목록 조회입니다.
    const rows = await listAdminItems(actor);
    // 검증: 기존 두 조건과 네 필드의 결과입니다.
    expect(rows.map(row => row.id)).toEqual([third, second, first]);
    expect(Object.keys(rows[0])).toEqual(["id", "title", "source", "publishedAt"]);
    expect(statements).toHaveLength(1);
  });

  it.each([false, true])("빈 목록 여부 %s에서 최댓값 다음 순서로 생성한다", async empty => {
    // 준비: 빈 목록과 기존 목록을 구분합니다.
    if (empty) cluster.sql("TRUNCATE press_articles");
    // 실행: 기존 별도 조회 다음 삽입입니다.
    await createItem(actor, input);
    // 검증: 실제 저장값과 두 SQL 실행을 확인합니다.
    expect(cluster.sql(`SELECT title,source,url,published_at::date,description IS NULL,image_url IS NULL,"order" FROM press_articles WHERE title='합성 수정'`))
      .toBe(`합성 수정|합성 출처|https://press.invalid/updated|2026-10-24|t|t|${empty ? 1 : 3}`);
    expect(statements.map(item => item.rowCount)).toEqual([1, 1]);
  });

  it("편집 조회는 실제 날짜와 nullable 필드를 반환한다", async () => {
    // 준비 및 실행: 기존 합성 기사를 조회합니다.
    const row = await getAdminItem(actor, first);
    // 검증: 여섯 필드의 DTO입니다.
    expect(row).toEqual({ title: "기사 가", source: "합성", url: "https://press.invalid/a", publishedAt: new Date("2026-10-24"), description: null, imageUrl: null });
  });

  it("수정은 한 행만 저장하고 기존 순서를 변경하지 않는다", async () => {
    // 준비 및 실행: ID 조건의 UPDATE입니다.
    expect(await updateItem(actor, first, input)).toBe(true);
    // 검증: 반환 행수와 저장 필드·정렬 보존입니다.
    expect(statements.map(item => item.rowCount)).toEqual([1]);
    expect(cluster.sql(`SELECT title,"order" FROM press_articles ORDER BY id`)).toBe("합성 수정|2\n기사 나|2\n기사 다|1");
  });

  it("없는 수정 ID는 0행 결과를 실패로 반환한다", async () => {
    // 준비 및 실행: 존재하지 않는 ID입니다.
    expect(await updateItem(actor, missing, input)).toBe(false);
    // 검증: 존재 조회를 추가하지 않고 실제 UPDATE 결과를 사용합니다.
    expect(statements.map(item => item.rowCount)).toEqual([0]);
    expect(cluster.sql("SELECT count(*) FROM press_articles WHERE title='합성 수정'")).toBe("0");
  });

  it("저장 직전 다른 연결에서 삭제되어도 0행을 실패로 반환한다", async () => {
    // 준비: 실제 UPDATE 전송과 실행 사이에 삭제를 커밋합니다.
    beforeUpdate = () => { cluster.sql(`DELETE FROM press_articles WHERE id='${first}'`); };
    // 실행: 조건부 저장입니다.
    expect(await updateItem(actor, first, input)).toBe(false);
    // 검증: 대상 재생성이나 성공 위장이 없습니다.
    expect(statements.map(item => item.rowCount)).toEqual([0]);
    expect(cluster.sql("SELECT count(*) FROM press_articles")).toBe("2");
  });

  it("같은 ID를 반복 삭제해도 두 번째 0행을 오류로 처리하지 않는다", async () => {
    // 준비: 이미 삭제된 대상입니다.
    cluster.sql(`DELETE FROM press_articles WHERE id='${first}'`);
    // 실행: 멱등 삭제입니다.
    await expect(deleteItem(actor, first)).resolves.toBeUndefined();
    // 검증: 나머지 행은 그대로입니다.
    expect(statements.map(item => item.rowCount)).toEqual([0]);
    expect(cluster.sql("SELECT count(*) FROM press_articles")).toBe("2");
  });

  it("존재하는 기사 삭제는 대상 한 행만 삭제한다", async () => {
    // 준비 및 실행: 기존 대상이 있는 멱등 명령입니다.
    await deleteItem(actor, first);
    // 검증: 한 행 삭제와 다른 행 보존입니다.
    expect(statements.map(item => item.rowCount)).toEqual([1]);
    expect(cluster.sql("SELECT id FROM press_articles ORDER BY id")).toBe(`${second}\n${third}`);
  });

  it.each([{ ids: [first, second, third] }, { ids: [missing, second, first] }, { ids: [first, first, third] }])("순서 $ids는 단일 CASE로 전체 요청이 맞을 때만 저장한다", async ({ ids }) => {
    // 준비: 정상·누락·중복 요청은 서로 다른 결과를 만들어야 합니다.
    const matched = ids[0] === first && ids[1] === second;
    // 실행: 원자 순서 변경입니다.
    expect(await reorderItems(actor, ids)).toEqual({ matched, affected: matched ? 3 : 0 });
    // 검증: SQL 한 문장과 실패 시 원래 순서 보존입니다.
    expect(statements).toHaveLength(1);
    expect(statements[0]?.query).toMatch(/WITH reorder_targets AS MATERIALIZED/);
    expect(statements[0]?.query).toMatch(/SET "order" = CASE/);
    expect(cluster.sql('SELECT "order" FROM press_articles ORDER BY id')).toBe(matched ? "1\n2\n3" : "2\n2\n1");
  });

  it("공개 조회수 SQL은 한 기사만 증가시킨다", async () => {
    // 준비 및 실행: 관리자 주체 없는 공개 클릭입니다.
    await recordPressView(first);
    // 검증: 기존 단일 증가와 다른 행 보존입니다.
    expect(cluster.sql("SELECT view_count FROM press_articles ORDER BY id")).toBe("1\n0\n0");
    expect(statements).toHaveLength(1);
  });
});
