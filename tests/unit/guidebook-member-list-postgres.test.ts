// @vitest-environment node
/**
 * 승인 회원 가이드북 목록의 역할 재검사·정렬·비공개 파일 열 제외를 소유 PostgreSQL에서 검증합니다.
 * 합성 사용자·파일만 사용하고 Neon 요청은 임시 Unix 소켓으로 한정합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
    return mocks.database;
  },
}));

import { GuidebookPaginationError, listGuidebooksForMember } from "@/features/guidebooks/member-list/service";

const bin = process.env.HRA_TEST_PG_BIN;
const users = {
  member: "72000000-0000-4000-8000-000000000001",
  faculty: "72000000-0000-4000-8000-000000000002",
  admin: "72000000-0000-4000-8000-000000000003",
  pending: "72000000-0000-4000-8000-000000000004",
  revoked: "72000000-0000-4000-8000-000000000005",
};
const books = {
  older: "73000000-0000-4000-8000-000000000001",
  tiedLow: "73000000-0000-4000-8000-000000000002",
  tiedHigh: "73000000-0000-4000-8000-000000000003",
};

describe.skipIf(!bin)("가이드북 목록 실제 PostgreSQL 회원 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TABLE users (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, email varchar(255) NOT NULL,
        role user_role NOT NULL, cohort_id uuid, image text
      );
      CREATE TABLE guidebooks (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL,
        file_url text NOT NULL, file_name varchar(500) NOT NULL,
        created_at timestamp NOT NULL
      );
      INSERT INTO users(id,name,email,role) VALUES
        ('${users.member}','합성 회원','member@fixture.invalid','MEMBER'),
        ('${users.faculty}','합성 교수','faculty@fixture.invalid','FACULTY'),
        ('${users.admin}','합성 관리자','admin@fixture.invalid','ADMIN'),
        ('${users.pending}','합성 대기','pending@fixture.invalid','PENDING'),
        ('${users.revoked}','합성 변경','revoked@fixture.invalid','MEMBER');
      INSERT INTO guidebooks(id,title,file_url,file_name,created_at) VALUES
        ('${books.older}','오래된 안내','private://older','older-secret.pdf','2026-10-01 09:00:00'),
        ('${books.tiedLow}','같은 시각 낮은 ID','private://low','low-secret.pdf','2026-10-02 09:00:00'),
        ('${books.tiedHigh}','같은 시각 높은 ID','private://high','high-secret.pdf','2026-10-02 09:00:00');
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
      // 저장소가 비공개 파일 열을 SELECT에 추가하면 응답 값 이전에 SQL 자체를 거부합니다.
      if (/\b(?:file_url|file_name|password_hash|oauth_provider|session_version)\b/i.test(JSON.stringify(request))) {
        throw new Error("비공개 열 조회 금지");
      }
      postCount++;
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

  it("승인 회원은 작성 시각·ID 역순 페이지에서 제목과 ID만 받는다", async () => {
    postCount = 0;
    const result = await listGuidebooksForMember({
      principal: { userId: users.member, role: "MEMBER" }, page: 1, pageSize: 2,
    });
    expect(result).toEqual({ kind: "ok", totalCount: 3, items: [
      { id: books.tiedHigh, title: "같은 시각 높은 ID" },
      { id: books.tiedLow, title: "같은 시각 낮은 ID" },
    ] });
    expect(postCount).toBe(4); // 현재 프로필·조회 빈도 예약(#444)·전체 건수·목록 각각 한 번
    expect(cluster?.sql(`SELECT count(*) FROM rate_limit_events WHERE scope LIKE 'resource-read-user-%'`)).toBe("2");

    const second = await listGuidebooksForMember({
      principal: { userId: users.faculty, role: "FACULTY" }, page: 2, pageSize: 2,
    });
    expect(second).toEqual({ kind: "ok", totalCount: 3, items: [
      { id: books.older, title: "오래된 안내" },
    ] });
  });

  it("관리자는 읽고 PENDING은 파일·목록 쿼리 전에 거부한다", async () => {
    expect((await listGuidebooksForMember({
      principal: { userId: users.admin, role: "ADMIN" }, page: 1, pageSize: 1,
    })).kind).toBe("ok");
    postCount = 0;
    expect(await listGuidebooksForMember({
      principal: { userId: users.pending, role: "PENDING" }, page: 1, pageSize: 10,
    })).toEqual({ kind: "forbidden" });
    expect(postCount).toBe(1); // 현재 역할 조회만 허용하며 조회 빈도 예산에도 기록하지 않음
  });

  it("역할 변경·계정 삭제는 기존 세션 주체를 401 경계로 무효화한다", async () => {
    cluster?.sql(`UPDATE users SET role='PENDING' WHERE id='${users.revoked}';`);
    postCount = 0;
    expect(await listGuidebooksForMember({
      principal: { userId: users.revoked, role: "MEMBER" }, page: 1, pageSize: 10,
    })).toEqual({ kind: "unauthenticated" });
    expect(postCount).toBe(1);

    cluster?.sql(`DELETE FROM users WHERE id='${users.revoked}';`);
    expect(await listGuidebooksForMember({
      principal: { userId: users.revoked, role: "MEMBER" }, page: 1, pageSize: 10,
    })).toEqual({ kind: "unauthenticated" });
  });

  it("큰 offset과 범위 밖 페이지를 DB 사전 거부·빈 목록으로 구분한다", async () => {
    postCount = 0;
    await expect(listGuidebooksForMember({
      principal: { userId: users.member, role: "MEMBER" }, page: 42_949_675, pageSize: 50,
    })).rejects.toBeInstanceOf(GuidebookPaginationError);
    expect(postCount).toBe(0);

    const beyond = await listGuidebooksForMember({
      principal: { userId: users.member, role: "MEMBER" }, page: 99, pageSize: 10,
    });
    expect(beyond).toEqual({ kind: "ok", items: [], totalCount: 3 });
    expect(postCount).toBe(3); // 현재 프로필·조회 빈도 예약·전체 건수만 조회
  });
});
