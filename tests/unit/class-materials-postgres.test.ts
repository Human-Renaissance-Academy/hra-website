// @vitest-environment node
/** 강의자료 저장소 SQL과 기존 회원 상세를 소유 PostgreSQL에서 검증합니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined, requireMember: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
vi.mock("@/lib/member", () => ({ requireMember: mocks.requireMember }));
import { listAdminMaterials, getAdminMaterial, getAdminMutationTarget, updateAdminMaterial, deleteAdminMaterial } from "@/features/class-materials/admin/service";
import { createUploadedMaterial } from "@/features/class-materials/upload/service";
import { generateMetadata } from "@/app/(member)/resources/class-materials/[id]/page";

const bin = process.env.HRA_TEST_PG_BIN;
const id = "81000000-0000-4000-8000-000000000001";
const facultyId = "81000000-0000-4000-8000-000000000002";
const actor = { userId: "82000000-0000-4000-8000-000000000001", role: "ADMIN" };
const textFields = { title: "변경 제목", weekNumber: 3, lectureTitle: null, audience: "STUDENT" as const, classDate: null };

describe.skipIf(!bin)("강의자료 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE users(id uuid PRIMARY KEY,name varchar(100));
      CREATE TABLE class_materials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(300) NOT NULL,
        file_url text NOT NULL,file_name varchar(500) NOT NULL,week_number integer,lecture_title varchar(200),
        audience varchar(20) NOT NULL DEFAULT 'STUDENT',uploaded_by_id uuid REFERENCES users ON DELETE SET NULL,
        "order" integer NOT NULL DEFAULT 0,class_date timestamp,created_at timestamp NOT NULL DEFAULT now());
      INSERT INTO users VALUES('${actor.userId}','합성 교수');
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) throw new Error("격리 SQL 범위 이외 요청 차단");
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  });
  beforeEach(() => {
    cluster?.sql(`TRUNCATE class_materials;
      INSERT INTO class_materials(id,title,file_url,file_name,audience,class_date,created_at,uploaded_by_id) VALUES
        ('${id}','학생 강의','https://fixture.invalid/old.pdf','학생.pdf','STUDENT','2026-10-13','2026-10-10','${actor.userId}'),
        ('${facultyId}','교수 강의','https://fixture.invalid/faculty.pdf','교수.pdf','FACULTY',NULL,'2026-10-11',NULL);
    `);
    mocks.requireMember.mockResolvedValue({ user: { id: actor.userId, role: "MEMBER" } });
  });
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });
  it("관리자 목록은 생성 시각 내림차순과 업로드자 LEFT JOIN을 유지한다", async () => {
    // 준비·실행: 서로 다른 생성 시각과 업로드자 누락 행입니다.
    const rows = await listAdminMaterials(actor);
    // 검증: 날짜·업로드자 표시와 정확한 열을 확인합니다.
    expect(rows.map((row) => [row.title, row.uploaderName])).toEqual([["교수 강의", null], ["학생 강의", "합성 교수"]]);
    expect(Object.keys(rows[0])).toEqual(["id", "title", "weekNumber", "lectureTitle", "audience", "createdAt", "uploaderName"]);
  });
  it.each(["MEMBER", "FACULTY", "ADMIN"])("%s 상세는 실제 SQL에서 대상별 자료를 제한한다", async (role) => {
    // 준비: 검증된 역할만 상세 조회에 전달합니다.
    mocks.requireMember.mockResolvedValue({ user: { id: actor.userId, role } });
    // 실행·검증: 교수용 제목은 일반 회원에게 노출되지 않습니다.
    expect(await generateMetadata({ params: Promise.resolve({ id: facultyId }) })).toEqual({
      title: role === "MEMBER" ? "강의 자료" : "교수 강의 — 강의 자료",
    });
  });
  it("공용 생성은 작성자·파일과 선택 텍스트를 저장한다", async () => {
    // 준비: 검증 완료된 합성 파일 참조입니다.
    const input = { ...textFields, fileUrl: "https://fixture.invalid/new.pdf", fileName: "새.pdf" };
    // 실행: 교수진 공용 서비스도 관리자 서비스와 분리되어 저장합니다.
    await createUploadedMaterial({ ...actor, role: "FACULTY" }, input);
    // 검증: 작성자와 파일 참조는 전달된 세션 주체·검증 입력입니다.
    expect(cluster?.sql(`SELECT uploaded_by_id,file_url,file_name,week_number FROM class_materials WHERE title='변경 제목'`))
      .toBe(`${actor.userId}|https://fixture.invalid/new.pdf|새.pdf|3`);
  });
  it("편집 조회는 표시 필드만 제공하고 날짜 보존용 조회는 현재 날짜를 읽는다", async () => {
    // 준비·실행: 기존 날짜가 있는 행을 읽습니다.
    const row = await getAdminMaterial(actor, id);
    const target = await getAdminMutationTarget(actor, id);
    // 검증: 원본 URL은 편집 DTO에 없고 변경 대상에는 날짜가 있습니다.
    expect(Object.keys(row ?? {})).toEqual(["title", "weekNumber", "lectureTitle", "audience", "fileName"]);
    expect(target?.classDate?.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });
  it("낡은 파일 URL의 교체는 0행이고 현재 URL 교체는 성공한다", async () => {
    // 준비: 앞선 조회 이후 다른 작업이 파일 URL을 변경했습니다.
    cluster?.sql(`UPDATE class_materials SET file_url='https://fixture.invalid/concurrent.pdf' WHERE id='${id}'`);
    const file = { url: "https://fixture.invalid/new.pdf", fileName: "새.pdf", previousUrl: "https://fixture.invalid/old.pdf" };
    // 실행·검증: 낡은 URL로 덮어쓰지 않습니다.
    expect(await updateAdminMaterial(actor, { id, textFields, file })).toBe(false);
    expect(cluster?.sql(`SELECT title,file_url FROM class_materials WHERE id='${id}'`)).toBe("학생 강의|https://fixture.invalid/concurrent.pdf");
    expect(await updateAdminMaterial(actor, { id, textFields, file: { ...file, previousUrl: "https://fixture.invalid/concurrent.pdf" } })).toBe(true);
    expect(cluster?.sql(`SELECT title,file_url FROM class_materials WHERE id='${id}'`)).toBe("변경 제목|https://fixture.invalid/new.pdf");
  });
  it("파일 없는 수정과 삭제는 실제 행 존재 결과를 유지한다", async () => {
    // 준비·실행: 파일 참조는 바꾸지 않는 텍스트 수정입니다.
    expect(await updateAdminMaterial(actor, { id, textFields })).toBe(true);
    // 검증: 원래 파일을 보존하고 삭제 이후 누락 쓰기는 실패합니다.
    expect(cluster?.sql(`SELECT file_url FROM class_materials WHERE id='${id}'`)).toBe("https://fixture.invalid/old.pdf");
    expect(await deleteAdminMaterial(actor, id)).toBe(true);
    expect(await deleteAdminMaterial(actor, id)).toBe(false);
    expect(await updateAdminMaterial(actor, { id, textFields })).toBe(false);
  });
});
