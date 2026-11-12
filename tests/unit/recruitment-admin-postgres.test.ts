// @vitest-environment node
/** 기수 저장소의 실제 정렬·쓰기·조건부 순서 보존·제출 참조 보호를 소유 PostgreSQL에서 검증합니다. */
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
import * as service from "@/features/recruitment/admin/service";
import * as repository from "@/features/recruitment/admin/repository";
const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };
const id = "11111111-1111-4111-8111-111111111111";
const missing = "99999999-9999-4999-8999-999999999999";
const input = { name: "새 21기", description: "합성 설명", startDate: new Date("2026-10-16T00:00:00Z"), endDate: null, isActive: true, imageUrl: "https://fixture.invalid/cohort.png", order: 7 };
describe.skipIf(!bin)("기수 관리자 실제 PostgreSQL", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE cohorts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(100) NOT NULL,
        description text,start_date timestamp,end_date timestamp,is_active boolean NOT NULL DEFAULT false,
        image_url text,"order" integer NOT NULL DEFAULT 0,
        recruitment_status text NOT NULL DEFAULT 'UPCOMING',recruitment_start_date timestamp,
        recruitment_end_date timestamp,google_form_url text,google_sheet_id text,
        created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE application_forms(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id) ON DELETE CASCADE);
      CREATE TABLE application_submissions(id uuid PRIMARY KEY,form_id uuid NOT NULL,
        CONSTRAINT application_submissions_form_id_application_forms_id_fk FOREIGN KEY(form_id) REFERENCES application_forms(id) ON DELETE RESTRICT);
      CREATE TABLE applications(id uuid PRIMARY KEY,cohort_id uuid NOT NULL,
        CONSTRAINT applications_cohort_id_cohorts_id_fk FOREIGN KEY(cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT);
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (target: unknown, options: RequestInit) => {
      if (String(target) !== qaNeonEndpoint || options.method !== "POST" || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) throw new Error("격리 SQL 범위 이외 요청 차단");
      try { return Response.json(await transport(JSON.parse(String(options.body)))); }
      catch (error) {
        const code = error instanceof Error && "code" in error ? error.code : "QA_TRANSPORT_ERROR";
        const constraint = error instanceof Error && "constraint" in error ? error.constraint : undefined;
        return Response.json({ message: "격리 SQL 실행 거부", code, constraint }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  });
  beforeEach(() => {
    cluster.sql(`TRUNCATE applications,application_submissions,application_forms,cohorts;
      INSERT INTO cohorts(id,name,image_url,"order") VALUES('${id}','20기','https://fixture.invalid/old.png',19);`);
  });
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });
  it("숫자 없는 이름과 정수 범위를 넘는 숫자를 기존 헬퍼 순서로 조회한다", async () => {
    cluster.sql(`INSERT INTO cohorts(name,"order") VALUES('특별반',99),('3기',88),('999999999999999999999999999999기',0);`);
    expect((await service.listAdminCohorts(actor)).map(row => row.name)).toEqual(["999999999999999999999999999999기", "20기", "3기", "특별반"]);
  });
  it("생성한 기수의 편집 표시 필드와 날짜를 실제 저장한다", async () => {
    await service.createAdminCohort(actor, input);
    const createdId = cluster.sql("SELECT id FROM cohorts WHERE name='새 21기'");
    expect(await service.getAdminCohort(actor, createdId)).toEqual({ name: input.name, description: input.description, startDate: input.startDate, endDate: null, isActive: true, imageUrl: input.imageUrl });
    expect(cluster.sql(`SELECT "order" FROM cohorts WHERE id='${createdId}'`)).toBe("7");
  });
  it.each([false, true])("수정 order 명시 %s는 기존 순서를 보존하거나 갱신한다", async hasOrder => {
    await service.updateAdminCohort(actor, id, { name: "수정 22기", description: null, startDate: null, endDate: null, isActive: true, ...(hasOrder ? { order: 7 } : {}), shouldRemoveImage: false, uploadImage: async () => ({ imageUrl: null, error: null }) });
    expect(cluster.sql(`SELECT name,"order",image_url FROM cohorts WHERE id='${id}'`)).toBe(`수정 22기|${hasOrder ? 7 : 19}|https://fixture.invalid/old.png`);
  });
  it("없는 수정 대상은 업로드를 실행하지 않는다", async () => {
    const uploadImage = vi.fn();
    expect(await service.updateAdminCohort(actor, missing, { ...input, shouldRemoveImage: true, uploadImage })).toEqual({ success: false, message: "기수를 찾을 수 없습니다." });
    expect(uploadImage).not.toHaveBeenCalled();
  });
  it("대상 확인 뒤 삭제된 기수의 기존 조건 없는 수정은 오류 없이 0행을 변경한다", async () => {
    const result = await service.updateAdminCohort(actor, id, { ...input, shouldRemoveImage: false, uploadImage: async () => {
      cluster.sql(`DELETE FROM cohorts WHERE id='${id}'`);
      return { imageUrl: null, error: null };
    } });
    expect(result).toEqual({ success: true, message: "" });
    expect(cluster.sql("SELECT count(*) FROM cohorts")).toBe("0");
  });
  it("빈 지원 양식이 연결된 기수는 기존 CASCADE로 삭제한다", async () => {
    cluster.sql(`INSERT INTO application_forms VALUES('${id}','${id}')`);
    expect(await service.deleteAdminCohort(actor, id)).toEqual({ success: true, message: "기수가 삭제되었습니다." });
    expect(cluster.sql("SELECT (SELECT count(*) FROM cohorts),(SELECT count(*) FROM application_forms)")).toBe("0|0");
  });
  it.each(["legacy", "submission"])("%s 지원서 참조가 있는 기수는 안내와 함께 보존한다", async kind => {
    cluster.sql(kind === "legacy" ? `INSERT INTO applications VALUES('${id}','${id}')` : `INSERT INTO application_forms VALUES('${id}','${id}'); INSERT INTO application_submissions VALUES('${id}','${id}')`);
    expect(await service.deleteAdminCohort(actor, id)).toEqual({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
    expect(cluster.sql("SELECT count(*) FROM cohorts")).toBe("1");
  });
  it("사전 검사 이후 연결된 레거시 지원서의 실제 FK 오류를 분류한다", async () => {
    expect(await repository.getDeletionReferences(id)).toBe(false);
    cluster.sql(`INSERT INTO applications VALUES('${id}','${id}')`);
    let failure: unknown;
    try { await repository.deleteCohort(id); } catch (error) { failure = error; }
    expect(repository.isSubmissionReferenceError(failure)).toBe(true);
    expect(cluster.sql("SELECT count(*) FROM cohorts")).toBe("1");
  });
  it("보호 제약 미설치 시 실제 카탈로그 검사가 삭제를 거절한다", async () => {
    cluster.sql("ALTER TABLE applications DROP CONSTRAINT applications_cohort_id_cohorts_id_fk");
    try {
      expect(await service.deleteAdminCohort(actor, id)).toEqual({ success: false, message: "제출 보존 설정을 확인할 수 없어 기수를 삭제할 수 없습니다." });
      expect(cluster.sql("SELECT count(*) FROM cohorts")).toBe("1");
    } finally {
      cluster.sql("ALTER TABLE applications ADD CONSTRAINT applications_cohort_id_cohorts_id_fk FOREIGN KEY(cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT");
    }
  });
});
