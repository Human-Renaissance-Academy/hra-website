// @vitest-environment node
/**
 * 관리자 가이드북의 실제 SQL 정렬·저장·낙관적 파일 교체·누락 결과를 검증합니다.
 * 소유 임시 PostgreSQL과 합성 파일만 사용하며 외부 전송을 차단합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => {
  const state: { database: NeonHttpDatabase<typeof schema> | undefined } = { database: undefined };
  return state;
});
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import * as service from "@/features/guidebooks/admin/service";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };
const id = "11111111-1111-4111-8111-111111111111";
const newerId = "22222222-2222-4222-8222-222222222222";
const missingId = "33333333-3333-4333-8333-333333333333";
const oldUrl = "https://fixture.invalid/old.pdf";
const input = { title: "새 안내", fileUrl: "https://fixture.invalid/new.pdf", fileName: "새.pdf" };

describe.skipIf(!bin)("관리자 가이드북 실제 PostgreSQL", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE guidebooks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(300) NOT NULL,
      file_url text NOT NULL, file_name varchar(500) NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (request: unknown, options: RequestInit) => {
      if (String(request) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  });

  beforeEach(() => {
    cluster?.sql(`TRUNCATE guidebooks;
      INSERT INTO guidebooks(id,title,file_url,file_name,created_at) VALUES
      ('${id}','기존 안내','${oldUrl}','기존.pdf','2026-10-01'),
      ('${newerId}','최신 안내','https://fixture.invalid/latest.pdf','최신.pdf','2026-10-02');`);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("목록은 생성일 내림차순이다", async () => {
    // 준비: 생성일이 다른 두 합성 행입니다.
    // 실행: 실제 목록 SQL입니다.
    const rows = await service.listAdminGuidebooks(actor);
    // 검증: 최신 행이 먼저 표시됩니다.
    expect(rows.map(row => row.id)).toEqual([newerId, id]);
  });

  it("생성은 제목과 검증 완료 파일 참조를 저장한다", async () => {
    // 준비: 별개의 새 제목과 파일 참조입니다.
    // 실행: 실제 INSERT입니다.
    await service.createAdminGuidebook(actor, input);
    // 검증: 실제 DB에 저장된 값을 독립 SQL로 확인합니다.
    expect(cluster?.sql("SELECT title,file_url,file_name FROM guidebooks WHERE title='새 안내';")).toBe("새 안내|" + input.fileUrl + "|새.pdf");
  });

  it("이전 URL이 일치하면 파일 교체가 성공한다", async () => {
    // 준비: 조회 당시 URL이 아직 유지됩니다.
    // 실행: 낙관적 UPDATE입니다.
    const result = await service.replaceAdminGuidebookFile(actor, id, { ...input, previousFileUrl: oldUrl });
    // 검증: 성공 결과와 실제 참조 교체입니다.
    expect(result).toEqual({ success: true });
    expect(cluster?.sql(`SELECT title,file_url,file_name FROM guidebooks WHERE id='${id}';`)).toBe("새 안내|" + input.fileUrl + "|새.pdf");
  });

  it("이전 URL이 다르면 경합 결과이며 파일을 덮어쓰지 않는다", async () => {
    // 준비: 다른 요청이 이미 파일을 교체했습니다.
    cluster?.sql(`UPDATE guidebooks SET file_url='https://fixture.invalid/winner.pdf' WHERE id='${id}';`);
    // 실행: 오래된 참조로 교체를 시도합니다.
    const result = await service.replaceAdminGuidebookFile(actor, id, { ...input, previousFileUrl: oldUrl });
    // 검증: 경합 메시지와 승자 파일 보존입니다.
    expect(result).toEqual({ success: false, error: "가이드북 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." });
    expect(cluster?.sql(`SELECT title,file_url,file_name FROM guidebooks WHERE id='${id}';`)).toBe("기존 안내|https://fixture.invalid/winner.pdf|기존.pdf");
  });

  it("제목만 수정하면 두 파일 필드를 보존한다", async () => {
    // 준비: 기존 참조가 있는 행입니다.
    // 실행: 제목만 갱신합니다.
    const result = await service.updateAdminGuidebookTitle(actor, id, input.title);
    // 검증: 제목만 변경됩니다.
    expect(result).toEqual({ success: true });
    expect(cluster?.sql(`SELECT title,file_url,file_name FROM guidebooks WHERE id='${id}';`)).toBe("새 안내|" + oldUrl + "|기존.pdf");
  });

  it("삭제는 지정한 행만 제거한다", async () => {
    // 준비: 서로 다른 두 대상입니다.
    // 실행: 실제 DELETE입니다.
    const result = await service.deleteAdminGuidebook(actor, id);
    // 검증: 다른 대상만 남습니다.
    expect(result).toEqual({ success: true });
    expect((await service.listAdminGuidebooks(actor)).map(row => row.id)).toEqual([newerId]);
  });

  it.each([
    { name: "편집", run: () => service.getAdminGuidebook(actor, missingId), result: null },
    { name: "수정 대상", run: () => service.getGuidebookUpdateTarget(actor, missingId), result: null },
    { name: "제목 수정", run: () => service.updateAdminGuidebookTitle(actor, missingId, input.title), result: { success: false, error: "가이드북을 찾을 수 없습니다." } },
    { name: "삭제", run: () => service.deleteAdminGuidebook(actor, missingId), result: { success: false, error: "가이드북을 찾을 수 없습니다." } },
    { name: "파일 교체", run: () => service.replaceAdminGuidebookFile(actor, missingId, { ...input, previousFileUrl: oldUrl }), result: { success: false, error: "가이드북 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." } },
  ])("$name 대상이 없으면 원래 누락 결과다", async ({ run, result }) => {
    // 준비: 저장되지 않은 유효 UUID입니다.
    // 실행: 해당 서비스의 실제 SQL 경로입니다.
    const actual = await run();
    // 검증: 변경 성공으로 오인하지 않습니다.
    expect(actual).toEqual(result);
  });
});
