// @vitest-environment node
/**
 * 실제 Drizzle·Neon 전송과 소유 PostgreSQL로 관리자 양식 저장소를 검증합니다.
 * 목록 정렬·대소문자 구분 unique·ID 갱신·비공개·누락 및 조회 후 삭제 경합을 확인합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import * as repository from "@/features/report-templates/admin/repository";
import { prepareTemplateUpdate, unpublishAdminTemplate } from "@/features/report-templates/admin/service";

const bin = process.env.HRA_TEST_PG_BIN;
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const missing = "33333333-3333-4333-8333-333333333333";
const actor = { userId: "admin-1", role: "ADMIN" };
const input: repository.TemplateInput = { slug: "sample", title: "합성 양식", category: "template",
  reportCategory: "classic-book", description: null, version: "2.0", body: "인용 '본문'\n다음 행",
  published: true, order: 2 };

describe.skipIf(!bin)("양식 관리자 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const oldFetch = neonConfig.fetchFunction;
  const oldEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TYPE report_template_category AS ENUM ('template','guide');
      CREATE TABLE report_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug varchar(200) NOT NULL UNIQUE,
        title varchar(300) NOT NULL,category report_template_category NOT NULL,report_category varchar(50),
        description text,version varchar(20) NOT NULL DEFAULT '1.0.0',body text NOT NULL,
        published boolean NOT NULL DEFAULT true,"order" integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (value: unknown, options: RequestInit) => {
      if (String(value) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) throw new Error("격리 SQL 범위 이외 요청 차단");
      try {
        return Response.json(await transport(JSON.parse(String(options.body))));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        const code = "code" in error && typeof error.code === "string" ? error.code : "QA_TRANSPORT_ERROR";
        return Response.json({ message: "격리 SQL 실행 거부", code }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  });
  beforeEach(() => {
    cluster.sql(`TRUNCATE report_templates;
      INSERT INTO report_templates(id,slug,title,category,body,published,"order",updated_at) VALUES
      ('${id}','sample','기존 양식','template','기존 본문',true,2,'2026-10-01'),
      ('${other}','other','다른 양식','guide','다른 본문',false,2,'2026-10-02');`);
  });
  afterAll(() => {
    neonConfig.fetchFunction = oldFetch; neonConfig.fetchEndpoint = oldEndpoint;
    mocks.database = undefined; cluster?.close();
  });

  it("목록은 비공개 포함 순서 오름차순·수정일 내림차순으로 정렬한다", async () => {
    // 준비: 더 작은 순서의 공개 행입니다.
    cluster.sql(`INSERT INTO report_templates(id,slug,title,category,body,"order",updated_at)
      VALUES('${missing}','first','첫 양식','template','본문',1,'2026-09-01');`);
    // 실행: 저장소의 실제 목록입니다.
    const rows = await repository.listTemplates();
    // 검증: 같은 순서는 수정일 역순이며 정확한 투영입니다.
    expect(rows.map(row => [row.id, row.published])).toEqual([[missing, true], [other, false], [id, true]]);
    expect(Object.keys(rows[0])).toEqual(["id", "slug", "title", "category", "reportCategory", "version", "published", "order", "updatedAt"]);
  });

  it("slug 중복은 실제 unique 제약에서 거부한다", async () => {
    // 준비: 같은 slug의 행이 이미 있습니다.
    // 실행·검증: 사전 검사 경합도 DB 제약이 거부합니다.
    await expect(repository.insertTemplate(input)).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("slug 대소문자는 HEAD처럼 서로 다른 값으로 저장된다", async () => {
    // 준비: sample은 이미 있지만 Sample은 없습니다.
    // 실행: 대문자가 포함된 slug로 생성합니다.
    await repository.insertTemplate({ ...input, slug: "Sample" });
    // 검증: 실제 조회의 동등 비교가 대소문자를 구분합니다.
    expect(await repository.findBySlug("Sample")).toMatchObject({ slug: "Sample", body: input.body });
    expect(await repository.findBySlug("SAMPLE")).toBeUndefined();
  });

  it("자기 slug 수정은 허용하고 다른 대상 slug는 중복으로 분류한다", async () => {
    // 준비: sample 대상과 other 대상이 존재합니다.
    // 실행·검증: 사전 검사 결과를 실제 행으로 확인합니다.
    expect(await prepareTemplateUpdate(actor, id, "sample")).toEqual({ kind: "ready", oldSlug: "sample" });
    expect(await prepareTemplateUpdate(actor, id, "other")).toEqual({ kind: "duplicate" });
  });

  it("수정은 ID만으로 대상 필드 전체를 갱신하고 다른 행은 유지한다", async () => {
    // 준비: 공개 여부와 slug를 모두 바꾸는 입력입니다.
    // 실행: 실제 returning 결과를 확인합니다.
    expect(await repository.updateTemplate(id, { ...input, slug: "changed", published: false })).toBe(true);
    // 검증: 저장 값과 다른 대상의 보존입니다.
    expect(await repository.findById(id)).toMatchObject({ ...input, id, slug: "changed", published: false });
    expect(await repository.findById(other)).toMatchObject({ slug: "other", title: "다른 양식" });
  });

  it("조회 후 삭제된 수정은 실제 returning 0행으로 끝난다", async () => {
    // 준비: 사전 조회 후 다른 연결에서 대상이 사라집니다.
    await prepareTemplateUpdate(actor, id, "sample");
    cluster.sql(`DELETE FROM report_templates WHERE id='${id}';`);
    // 실행·검증: 존재 검사 결과가 아닌 실제 UPDATE 결과입니다.
    expect(await repository.updateTemplate(id, input)).toBe(false);
  });

  it("비공개는 행과 본문을 남겨 내장 기본본 차단을 유지한다", async () => {
    // 준비: 공개 양식의 DB 행입니다.
    // 실행: 삭제 명령의 실제 서비스입니다.
    expect(await unpublishAdminTemplate(actor, id)).toEqual({ slug: "sample" });
    // 검증: 삭제가 아니라 공개 여부만 바뀝니다.
    expect(await repository.findById(id)).toMatchObject({ id, slug: "sample", body: "기존 본문", published: false });
  });

  it("누락 조회·수정·비공개는 각각 기존 누락 결과를 반환한다", async () => {
    // 준비: missing UUID의 행이 없습니다.
    // 실행·검증: 모든 실제 SQL 누락 경로를 고정합니다.
    expect(await repository.findById(missing)).toBeUndefined();
    expect(await repository.updateTemplate(missing, input)).toBe(false);
    expect(await prepareTemplateUpdate(actor, missing, "new")).toEqual({ kind: "missing" });
    expect(await unpublishAdminTemplate(actor, missing)).toBeNull();
  });
});
