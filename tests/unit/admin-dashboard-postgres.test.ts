// @vitest-environment node
/**
 * 대시보드 집계의 아홉 숫자와 두 PENDING 필터를 소유 PostgreSQL에서 확인합니다.
 * 필요한 일곱 테이블만 합성 DDL로 만들고 Neon 전송은 임시 Unix 소켓 psql로 제한합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
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

import { getDashboardCounts } from "@/features/admin-dashboard/service";

const bin = process.env.HRA_TEST_PG_BIN;
describe.skipIf(!bin)("관리자 대시보드 실제 PostgreSQL 집계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE submission_status AS ENUM ('PENDING','ACCEPTED','REJECTED');
      CREATE TYPE user_role AS ENUM ('PENDING','MEMBER','FACULTY','ADMIN');
      CREATE TABLE application_submissions (id integer PRIMARY KEY, status submission_status NOT NULL);
      CREATE TABLE users (id integer PRIMARY KEY, role user_role NOT NULL);
      CREATE TABLE cohorts (id integer PRIMARY KEY);
      CREATE TABLE notices (id integer PRIMARY KEY);
      CREATE TABLE press_articles (id integer PRIMARY KEY);
      CREATE TABLE galleries (id integer PRIMARY KEY);
      CREATE TABLE alumni_stories (id integer PRIMARY KEY);
      INSERT INTO application_submissions VALUES (1,'PENDING'),(2,'PENDING'),(3,'ACCEPTED'),(4,'REJECTED');
      INSERT INTO users VALUES (1,'PENDING'),(2,'PENDING'),(3,'PENDING'),(4,'MEMBER'),(5,'FACULTY'),(6,'ADMIN');
      INSERT INTO cohorts SELECT generate_series(1,5);
      INSERT INTO notices SELECT generate_series(1,7);
      INSERT INTO press_articles SELECT generate_series(1,8);
      INSERT INTO galleries SELECT generate_series(1,9);
      INSERT INTO alumni_stories SELECT generate_series(1,10);
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
        if (!(error instanceof Error)) throw error;
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("두 대기 필터와 모든 콘텐츠 집계를 구분한다", async () => {
    // 준비: 상태·역할·테이블별로 서로 다른 개수의 합성 행이 있습니다.
    // 실행: 실제 서비스·저장소·Drizzle·PostgreSQL을 연결합니다.
    const counts = await getDashboardCounts({ userId: "admin-1", role: "ADMIN" });
    // 검증: 전체 회원에는 네 역할이 모두 포함되고 대기 값만 필터링됩니다.
    expect(counts).toEqual({ pendingSubmissions: 2, totalSubmissions: 4, pendingUsers: 3, totalMembers: 6,
      totalCohorts: 5, totalNotices: 7, totalPress: 8, totalGalleries: 9, totalAlumni: 10 });
  });
});
