// @vitest-environment node
/** 기존 회원 쓰기 회귀에 없는 실제 조회 투영·정렬·계정 연결 배치 참조를 검증합니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { listAdminUsers, getAdminUser, listAdminCohorts, deleteAdminUser } from "@/features/users/admin/service";

const actor = { userId: "10000000-0000-4000-8000-000000000001", role: "ADMIN" };
const target = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("회원 관리자 미중복 PostgreSQL 계약", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const oldFetch = neonConfig.fetchFunction;
  const oldEndpoint = neonConfig.fetchEndpoint;
  const failures: { code: string; constraint: string | undefined }[] = [];
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TABLE cohorts(id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE users(id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL,
        role user_role NOT NULL, cohort_id uuid REFERENCES cohorts(id), image text,
        created_at timestamp NOT NULL, updated_at timestamp NOT NULL DEFAULT now(),
        password_hash text, session_version integer NOT NULL DEFAULT 0);
      CREATE TABLE academic_enrollment_link_batches(id uuid PRIMARY KEY,
        actor_user_id uuid NOT NULL CONSTRAINT academic_enrollment_link_batches_actor_user_id_users_id_fk
        REFERENCES users(id) ON DELETE RESTRICT);
      INSERT INTO cohorts VALUES ('${cohort}','2기'),
        ('20000000-0000-4000-8000-000000000002','20기'),
        ('20000000-0000-4000-8000-000000000003','특별반');
      INSERT INTO users(id,name,email,role,created_at,password_hash,session_version) VALUES
        ('${actor.userId}','합성 관리자','admin@qa.invalid','ADMIN','2026-01-01',NULL,4),
        ('${target}','합성 회원','member@qa.invalid','MEMBER','2026-02-01','비공개',7);
      INSERT INTO academic_enrollment_link_batches VALUES
        ('30000000-0000-4000-8000-000000000001','${target}');
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      try {
        return Response.json(await transport(JSON.parse(String(options.body))));
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string") throw error;
        const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : undefined;
        failures.push({ code: error.code, constraint });
        return Response.json({ message: "격리 SQL 거부", code: error.code, constraint }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);
  afterAll(() => {
    neonConfig.fetchFunction = oldFetch;
    neonConfig.fetchEndpoint = oldEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("실제 목록은 생성 시각 내림차순의 일곱 열만 반환한다", async () => {
    // 준비·실행: 생성 시각이 다른 두 합성 계정을 읽습니다.
    const rows = await listAdminUsers(actor);
    // 검증: 내부 비밀번호와 세션 열은 조회 결과에 없습니다.
    expect(rows.map(row => row.id)).toEqual([target, actor.userId]);
    for (const row of rows) expect(Object.keys(row)).toEqual(["id", "name", "email", "role", "cohortId", "image", "createdAt"]);
  });
  it("실제 상세는 비밀번호 존재 여부만 투영한다", async () => {
    // 준비·실행: 비밀번호가 있는 합성 계정을 조회합니다.
    const row = await getAdminUser(actor, target);
    // 검증: 원문 없는 아홉 표시 열을 반환합니다.
    expect(row?.hasPassword).toBe(true);
    expect(Object.keys(row ?? {})).toEqual(["id", "name", "email", "role", "cohortId", "image", "createdAt", "updatedAt", "hasPassword"]);
    expect(JSON.stringify(row)).not.toMatch(/비공개|sessionVersion|passwordHash/);
  });
  it("실제 기수는 숫자 내림차순으로 정렬하고 숫자 없는 이름은 마지막이다", async () => {
    // 준비·실행·검증: 공통 인프라 정렬 표현식의 실제 결과를 확인합니다.
    expect((await listAdminCohorts(actor)).map(row => row.name)).toEqual(["20기", "2기", "특별반"]);
  });
  it("계정 연결 배치 작성자는 실제 세 번째 보호 FK로 삭제를 거부하고 행을 보존한다", async () => {
    // 준비: 기존 회원 테스트가 설치하지 않은 계정 연결 배치 참조가 있습니다.
    const before = cluster.sql("SELECT row_to_json(u) FROM users u ORDER BY id; SELECT row_to_json(b) FROM academic_enrollment_link_batches b ORDER BY id;");
    // 실행: 실제 서비스·Drizzle·PostgreSQL로 삭제를 시도합니다.
    const result = await deleteAdminUser(actor, target);
    // 검증: 안전한 응답과 원본 회원·세션·참조 보존을 함께 확인합니다.
    expect(result).toEqual({ kind: "result", result: { success: false, message: "학적 정보나 학사 운영 이력이 연결된 회원은 삭제할 수 없습니다." } });
    expect(failures).toEqual([{ code: expect.stringMatching(/^(23001|23503)$/), constraint: "academic_enrollment_link_batches_actor_user_id_users_id_fk" }]);
    expect(cluster.sql("SELECT row_to_json(u) FROM users u ORDER BY id; SELECT row_to_json(b) FROM academic_enrollment_link_batches b ORDER BY id;")).toBe(before);
  });
});
