// @vitest-environment node
/**
 * 강의자료·주차별 텍스트 API v1 Application Service의 실제 SQL 경계를 소유 PostgreSQL에서 검증합니다.
 * - 강의자료 대상(학생용/교수용) 필터가 목록·상세·파일 조회 SQL에서 강제되는지
 * - 주차별 텍스트가 기수와 무관한 공동 자료로 조회되는지, 목록 SQL이 본문·파일 열을 반환하지 않는지
 * - 수업일 역순(NULL 마지막)·작성 시각·ID 역순 정렬과 PENDING·역할 변경 차단
 * 합성 사용자·자료만 사용하고 Neon 요청은 임시 Unix 소켓으로 한정합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
    return mocks.database;
  },
}));

import { findClassMaterialFileForReader } from "@/features/class-materials/member/repository";
import { getClassMaterialForMember, listClassMaterialsForMember } from "@/features/class-materials/member/service";
import { findWeeklyTextFile } from "@/features/weekly-texts/member/repository";
import { getWeeklyTextForMember, listWeeklyTextsForMember } from "@/features/weekly-texts/member/service";

const bin = process.env.HRA_TEST_PG_BIN;
const cohorts = { a: "74000000-0000-4000-8000-00000000000a", b: "74000000-0000-4000-8000-00000000000b" };
const users = {
  member: "74000000-0000-4000-8000-000000000001",
  faculty: "74000000-0000-4000-8000-000000000002",
  admin: "74000000-0000-4000-8000-000000000003",
  pending: "74000000-0000-4000-8000-000000000004",
  revoked: "74000000-0000-4000-8000-000000000005",
};
const materials = {
  student: "75000000-0000-4000-8000-000000000001",
  faculty: "75000000-0000-4000-8000-000000000002",
  undated: "75000000-0000-4000-8000-000000000003",
};
const texts = {
  otherCohort: "76000000-0000-4000-8000-000000000001",
  ownCohort: "76000000-0000-4000-8000-000000000002",
  bodyOnly: "76000000-0000-4000-8000-000000000003",
};

describe.skipIf(!bin)("자료 API v1 실제 PostgreSQL 인가·투영 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const statements: string[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TABLE cohorts (id uuid PRIMARY KEY, name varchar(100) NOT NULL);
      CREATE TABLE users (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, email varchar(255) NOT NULL,
        role user_role NOT NULL, cohort_id uuid REFERENCES cohorts(id), image text
      );
      CREATE TABLE class_materials (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, file_url text NOT NULL, file_name varchar(500) NOT NULL,
        week_number integer, lecture_title varchar(200), audience varchar(20) NOT NULL DEFAULT 'STUDENT',
        uploaded_by_id uuid REFERENCES users(id), "order" integer NOT NULL DEFAULT 0,
        class_date timestamp, created_at timestamp NOT NULL
      );
      CREATE TABLE weekly_texts (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, file_url text NOT NULL DEFAULT '', file_name varchar(500),
        body text, cohort_id uuid REFERENCES cohorts(id), text_type varchar(20), class_date timestamp,
        created_at timestamp NOT NULL
      );
      INSERT INTO cohorts(id,name) VALUES ('${cohorts.a}','합성 A기'),('${cohorts.b}','합성 B기');
      INSERT INTO users(id,name,email,role,cohort_id) VALUES
        ('${users.member}','합성 회원','member@fixture.invalid','MEMBER','${cohorts.a}'),
        ('${users.faculty}','합성 교수','faculty@fixture.invalid','FACULTY',NULL),
        ('${users.admin}','합성 관리자','admin@fixture.invalid','ADMIN',NULL),
        ('${users.pending}','합성 대기','pending@fixture.invalid','PENDING',NULL),
        ('${users.revoked}','합성 변경','revoked@fixture.invalid','MEMBER','${cohorts.a}');
      INSERT INTO class_materials(id,title,file_url,file_name,week_number,lecture_title,audience,uploaded_by_id,class_date,created_at) VALUES
        ('${materials.student}','학생용 자료','https://fixture.invalid/student.pdf','student.pdf',2,'고전','STUDENT','${users.faculty}','2026-10-05 00:00:00','2026-10-01 09:00:00'),
        ('${materials.faculty}','교수용 자료','https://fixture.invalid/faculty.pdf','faculty.pdf',2,'고전','FACULTY','${users.faculty}','2026-10-06 00:00:00','2026-10-01 09:00:00'),
        ('${materials.undated}','날짜 없는 자료','https://fixture.invalid/undated.pdf','undated.pdf',NULL,NULL,'STUDENT',NULL,NULL,'2026-10-09 09:00:00');
      INSERT INTO weekly_texts(id,title,file_url,file_name,body,cohort_id,text_type,class_date,created_at) VALUES
        ('${texts.otherCohort}','다른 기수 텍스트','https://fixture.invalid/other.pdf','other.pdf',NULL,'${cohorts.b}','경영서','2026-10-07 00:00:00','2026-10-01 09:00:00'),
        ('${texts.ownCohort}','본인 기수 텍스트','https://fixture.invalid/own.pdf','own.pdf','# 본문','${cohorts.a}','고전명작','2026-10-03 00:00:00','2026-10-01 09:00:00'),
        ('${texts.bodyOnly}','본문만 있는 텍스트','',NULL,'본문만',NULL,NULL,NULL,'2026-10-02 09:00:00');
    `);

    // 사용자별 자료 조회 빈도 제한(#444)도 운영과 같은 원자 예약 함수로 실제 기록합니다.
    cluster.sql("CREATE TABLE application_submissions (id uuid PRIMARY KEY);");
    cluster.sql(readFileSync("scripts/sql/rate-limit-reservations.sql", "utf8"));

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      statements.push(String(request.query));
      try {
        return Response.json(await transport(request));
      } catch {
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    const ownedRoot = cluster?.root;
    cluster?.close();
    if (ownedRoot) expect(existsSync(ownedRoot)).toBe(false);
  });

  it("MEMBER는 학생용 강의자료만 수업일 역순(NULL 마지막)으로 받고 목록 SQL은 파일·업로더 열을 읽지 않는다", async () => {
    statements.length = 0;
    const result = await listClassMaterialsForMember({ principal: { userId: users.member, role: "MEMBER" }, page: 1, pageSize: 10 });
    expect(result).toEqual({ kind: "ok", totalCount: 2, items: [
      { id: materials.student, title: "학생용 자료", audience: "STUDENT", weekNumber: 2, lectureTitle: "고전", classDate: "2026-10-05" },
      { id: materials.undated, title: "날짜 없는 자료", audience: "STUDENT", weekNumber: null, lectureTitle: null, classDate: null },
    ] });
    expect(statements).toHaveLength(4); // 현재 프로필·조회 빈도 예약(#444)·건수·목록
    expect(statements[1]).toContain("reserve_rate_limit");
    const listSql = statements.slice(2).join("\n");
    expect(listSql).toContain("class_materials");
    expect(listSql).not.toMatch(/file_url|file_name|uploaded_by_id/);
  });

  it("FACULTY·ADMIN은 교수용 강의자료도 받는다", async () => {
    for (const [userId, role] of [[users.faculty, "FACULTY"], [users.admin, "ADMIN"]] as const) {
      const result = await listClassMaterialsForMember({ principal: { userId, role }, page: 1, pageSize: 10 });
      expect(result.kind === "ok" && result.items.map((item) => item.id)).toEqual([materials.faculty, materials.student, materials.undated]);
    }
  });

  it("MEMBER의 교수용 강의자료 상세·파일은 SQL 대상 필터로 없는 자료와 같다", async () => {
    expect(await getClassMaterialForMember({ userId: users.member, role: "MEMBER" }, materials.faculty)).toEqual({ kind: "not_found" });
    expect(await findClassMaterialFileForReader({ id: users.member, role: "MEMBER" }, materials.faculty)).toBeNull();
    expect(await findClassMaterialFileForReader({ id: users.faculty, role: "FACULTY" }, materials.faculty))
      .toEqual({ fileUrl: "https://fixture.invalid/faculty.pdf", fileName: "faculty.pdf" });
    expect(await getClassMaterialForMember({ userId: users.member, role: "MEMBER" }, materials.student)).toEqual({
      kind: "ok", item: { id: materials.student, title: "학생용 자료", audience: "STUDENT", weekNumber: 2,
        lectureTitle: "고전", classDate: "2026-10-05", fileName: "student.pdf" },
    });
  });

  it("주차별 텍스트는 다른 기수도 공동 자료로 받고 목록 SQL은 본문·파일 원문을 반환하지 않는다", async () => {
    statements.length = 0;
    const result = await listWeeklyTextsForMember({ principal: { userId: users.member, role: "MEMBER" }, page: 1, pageSize: 10 });
    expect(result).toEqual({ kind: "ok", totalCount: 3, items: [
      { id: texts.otherCohort, title: "다른 기수 텍스트", textType: "경영서", cohort: { id: cohorts.b, name: "합성 B기" },
        classDate: "2026-10-07", hasBody: false, hasFile: true },
      { id: texts.ownCohort, title: "본인 기수 텍스트", textType: "고전명작", cohort: { id: cohorts.a, name: "합성 A기" },
        classDate: "2026-10-03", hasBody: true, hasFile: true },
      { id: texts.bodyOnly, title: "본문만 있는 텍스트", textType: null, cohort: null, classDate: null, hasBody: true, hasFile: false },
    ] });
    // 존재 여부 계산식 외에 본문·파일 열을 그대로 SELECT 목록에 싣지 않습니다.
    expect(statements).toHaveLength(4); // 현재 프로필·조회 빈도 예약(#444)·건수·목록
    const listSql = statements.at(-1) ?? "";
    expect(listSql).toContain("weekly_texts");
    expect(listSql).not.toMatch(/"weekly_texts"\."(?:body|file_url|file_name)"\s*(?:,|from)/i);
  });

  it("주차별 텍스트 상세는 본문·파일명을, 파일 조회는 본문만 있는 텍스트에 빈 URL을 반환한다", async () => {
    expect(await getWeeklyTextForMember({ userId: users.member, role: "MEMBER" }, texts.ownCohort)).toEqual({
      kind: "ok", item: { id: texts.ownCohort, title: "본인 기수 텍스트", textType: "고전명작",
        cohort: { id: cohorts.a, name: "합성 A기" }, classDate: "2026-10-03", hasBody: true, hasFile: true,
        body: "# 본문", fileName: "own.pdf" },
    });
    expect(await findWeeklyTextFile(texts.bodyOnly)).toEqual({ fileUrl: "", fileName: null });
  });

  it("PENDING은 현재 계정 조회도 없이 거부하고 역할 변경 세션은 401 경계로 무효화한다", async () => {
    statements.length = 0;
    expect(await listWeeklyTextsForMember({ principal: { userId: users.pending, role: "PENDING" }, page: 1, pageSize: 10 }))
      .toEqual({ kind: "forbidden" });
    expect(statements).toHaveLength(0);

    cluster?.sql(`UPDATE users SET role='PENDING' WHERE id='${users.revoked}';`);
    expect(await listClassMaterialsForMember({ principal: { userId: users.revoked, role: "MEMBER" }, page: 1, pageSize: 10 }))
      .toEqual({ kind: "unauthenticated" });
    expect(await getWeeklyTextForMember({ userId: users.revoked, role: "PENDING" }, texts.ownCohort))
      .toEqual({ kind: "forbidden" });
  });
});
