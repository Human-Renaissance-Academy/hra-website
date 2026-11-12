/**
 * 소유 일회성 PostgreSQL에서 실제 서비스·SQL의 회전 경합·회수·만료를 검증합니다.
 * 번들링에서 DB 전송만 소유 로컬 Neon 세션으로 연결하고 인증 판정과 SQL은 교체하지 않습니다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { PgDialect } from "drizzle-orm/pg-core";
import { createOwnedLocalFactory } from "../support/db-migration-local-adapter.mjs";
import { registerHardeningCases } from "./mobile-session-hardening-cases.mjs";
import { registerCheckpointCases } from "./mobile-session-checkpoint-cases.mjs";
import { registerConcurrencyCases } from "./mobile-session-concurrency-cases.mjs";
import { registerLockCases } from "./mobile-session-lock-cases.mjs";

const root = new URL("../../", import.meta.url).pathname;
const userId = "10000000-0000-4000-8000-000000000001";
const base = new Date("2026-01-01T00:00:00Z");
const at = milliseconds => new Date(base.getTime() + milliseconds);
const migration = readFileSync(new URL("../../scripts/migrate-mobile-sessions.sql", import.meta.url), "utf8");

test("모바일 세션의 실제 PostgreSQL 보안 경계", { timeout: 120_000 }, async t => {
  const factory = createOwnedLocalFactory({ postgresBin: process.env.HRA_TEST_PG_BIN });
  const admin = await factory.open();
  t.after(async () => { delete globalThis.__mobileSessionExecute; await admin.close(); await factory.close(); });
  await admin.query("CREATE TYPE public.user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING'); CREATE TABLE public.users(id uuid PRIMARY KEY,name text NOT NULL,email text NOT NULL,role public.user_role NOT NULL,session_version integer NOT NULL DEFAULT 0,cohort_id uuid,password_hash text)");
  await admin.query(migration);
  await admin.query(migration);
  await admin.query("CREATE TABLE public.application_submissions(id uuid PRIMARY KEY)");
  await admin.query(readFileSync(new URL("../../scripts/sql/rate-limit-reservations.sql", import.meta.url), "utf8"));
  const dialect = new PgDialect();
  // 각 호출마다 독립 물리 연결을 사용하므로 Promise.all의 회전은 실제 DB에서 경합합니다.
  globalThis.__mobileSessionExecute = async statement => {
    const session = await factory.open();
    try { const query = dialect.sqlToQuery(statement); return await session.query(query.sql, query.params); }
    finally { await session.close(); }
  };
  const bundled = await build({
    absWorkingDir: root, stdin: { contents: 'export * from "./src/features/auth/mobile-session/service"; export {mobileAuthResponse} from "./src/features/auth/mobile-login/http"; export {checkRefreshBudget} from "./src/features/auth/mobile-login/repository"; export {MOBILE_REFRESH_SESSION_POLICY} from "./src/features/auth/mobile-login/policy";', resolveDir: root, loader: "ts" },
    bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
    plugins: [{ name: "owned-local-db", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "empty", namespace: "mobile-test" }));
      builder.onResolve({ filter: /^@\/lib\/db$/ }, () => ({ path: "db", namespace: "mobile-test" }));
      builder.onLoad({ filter: /.*/, namespace: "mobile-test" }, args => ({ contents: args.path === "db"
        ? "export const db={execute: statement=>globalThis.__mobileSessionExecute(statement)}" : "" }));
    } }],
  });
  const service = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));
  const reset = async () => {
    await admin.query("TRUNCATE public.mobile_sessions,public.users,public.rate_limit_events CASCADE");
    await admin.query("INSERT INTO public.users(id,name,email,role,session_version) VALUES($1,'합성 계정','mobile@fixture.invalid','MEMBER',0)", [userId]);
  };
  const create = () => service.createMobileSession({ userId, sessionVersion: 0, now: base, device: { platform: "ANDROID" } });

  await t.test("SQL 제약은 원문 토큰·잘못된 해시·회수 사유·시간 역전을 거부한다", async () => {
    // Given: 정상 세션과 각 제약을 위반하는 변경
    await reset(); await create();
    const invalid = [
      ["access_hash=$1", "hra_at_" + "A".repeat(43)],
      ["refresh_hash=$1", "A".repeat(64)],
      ["prev_refresh_hash=$1", "a".repeat(63)],
      ["platform=$1", "WEB"],
      ["revoke_reason=$1", "OTHER"],
      ["access_expires_at=$1::timestamptz", at(0).toISOString()],
      ["refresh_expires_at=$1::timestamptz", at(91 * 86400000).toISOString()],
    ];
    // When: 각 변경을 실제 PostgreSQL에 적용
    for (const [assignment, value] of invalid) {
      // Then: 원문을 출력하지 않고 CHECK SQLSTATE만 비교
      await assert.rejects(admin.query(`UPDATE public.mobile_sessions SET ${assignment}`, [value]), error => error.code === "23514");
    }
  });

  await t.test("기존 표의 제약 drift는 재실행 시 자동 보정하지 않고 거부한다", async () => {
    // Given: 해시 CHECK를 제거한 기존 테이블
    await reset();
    await admin.query("ALTER TABLE public.mobile_sessions DROP CONSTRAINT mobile_sessions_access_hash_check");
    // When: 동일 migration을 다시 적용
    await assert.rejects(admin.query(migration), error => error.code === "P0001");
    // Then: 실패 transaction을 종료하고 명시적으로 fixture만 복구
    await admin.query("ROLLBACK");
    assert.equal((await admin.query("SELECT to_regnamespace('hra_mobile273_expected') IS NULL AS clean")).rows[0].clean, true);
    await admin.query("ALTER TABLE public.mobile_sessions ADD CONSTRAINT mobile_sessions_access_hash_check CHECK(access_hash ~ '^[0-9a-f]{64}$')");
  });

  for (let repetition = 1; repetition <= 5; repetition++) await t.test(`동시 회전 12건은 승자 한 명이며 패자는 승자를 무효화하지 않는다 (${repetition}/5)`, async () => {
    // Given: 하나의 유효 갱신 토큰
    await reset(); const original = await create();
    // When: 서로 다른 연결에서 동일 시각에 12건 회전
    const results = await Promise.all(Array.from({ length: 12 }, () => service.rotateRefreshToken(original.refreshToken, at(1000))));
    // Then: 정확히 한 승자·유예 패자이며 승자의 접근/갱신 토큰 모두 유효
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(results.filter(result => !result.ok && result.reason === "WITHIN_LEEWAY").length, 11);
    const history = await admin.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE refresh_hash=$1)::int AS consumed FROM public.mobile_session_refresh_history", [service.hashMobileToken(original.refreshToken)]);
    assert.deepEqual(history.rows[0], { total: 1, consumed: 1 });
    const winner = results.find(result => result.ok);
    assert.ok(winner);
    assert.equal((await service.authenticateAccessToken(winner.session.accessToken, at(1001)))?.userId, userId);
    assert.equal(await service.authenticateAccessToken(original.accessToken, at(1001)), null);
    assert.equal((await service.rotateRefreshToken(winner.session.refreshToken, at(1002))).ok, true);
  });

  await t.test("직전 토큰은 유예 경계까지 회수하지 않고 경계 이후 전체 세션을 회수한다", async () => {
    // Given: 1초 시각에 회전된 세션
    await reset(); const original = await create();
    const winner = await service.rotateRefreshToken(original.refreshToken, at(1000)); assert.ok(winner.ok);
    assert.deepEqual(await service.rotateRefreshToken(original.refreshToken, at(11000)), { ok: false, reason: "WITHIN_LEEWAY" });
    // When: 유예 종료 1ms 뒤 직전 토큰 재사용
    const replay = await service.rotateRefreshToken(original.refreshToken, at(11001));
    // Then: 승자의 토큰도 회수되고 사유가 영속화됨
    assert.deepEqual(replay, { ok: false, reason: "REUSE_DETECTED" });
    assert.equal(await service.authenticateAccessToken(winner.session.accessToken, at(11002)), null);
    assert.deepEqual(await service.rotateRefreshToken(winner.session.refreshToken, at(11002)), { ok: false, reason: "REVOKED" });
    assert.equal((await admin.query("SELECT revoke_reason FROM public.mobile_sessions")).rows[0].revoke_reason, "REUSE_DETECTED");
  });

  for (const [name, milliseconds, canRotate] of [
    ["접근 만료", 15 * 60 * 1000, true],
    ["갱신 만료", 30 * 86400000, false],
    ["절대 만료", 90 * 86400000, false],
  ]) await t.test(`${name} 경계는 주입 시각으로 판정한다`, async () => {
    // Given: 고정 시각에서 발급한 세션
    await reset(); const original = await create();
    // When: 만료 경계에서 인증·갱신 요청
    const principal = await service.authenticateAccessToken(original.accessToken, at(milliseconds));
    const rotated = await service.rotateRefreshToken(original.refreshToken, at(milliseconds));
    // Then: 접근 만료만 갱신으로 복구 가능
    assert.equal(principal, null); assert.equal(rotated.ok, canRotate);
    if (!canRotate) assert.equal(rotated.reason, "EXPIRED");
  });

  await t.test("슬라이딩 갱신도 최초 로그인 90일을 넘기지 않는다", async () => {
    // Given: 만료 전에 29일 간격으로 갱신한 로그인
    await reset(); let session = await create();
    for (const day of [29, 58, 87]) { const result = await service.rotateRefreshToken(session.refreshToken, at(day * 86400000)); assert.ok(result.ok); session = result.session; }
    // When: 절대 만료 직전과 정각에 요청
    const last = await service.rotateRefreshToken(session.refreshToken, at(90 * 86400000 - 1)); assert.ok(last.ok);
    // Then: 새 접근/갱신 수명도 절대 한도에 고정되고 정각에는 둘 다 거부
    assert.equal(last.session.accessTokenExpiresAt, at(90 * 86400000).toISOString());
    assert.equal(last.session.refreshTokenExpiresAt, at(90 * 86400000).toISOString());
    assert.equal(await service.authenticateAccessToken(last.session.accessToken, at(90 * 86400000)), null);
    assert.deepEqual(await service.rotateRefreshToken(last.session.refreshToken, at(90 * 86400000)), { ok: false, reason: "EXPIRED" });
  });

  await t.test("계정 버전 증가가 인증과 회전을 즉시 무효화한다", async () => {
    // Given: 버전 0으로 발급
    await reset(); const session = await create();
    // When: 계정 버전을 올림
    await admin.query("UPDATE public.users SET session_version=1");
    // Then: 다음 인증·갱신 거부
    assert.equal(await service.authenticateAccessToken(session.accessToken, at(1)), null);
    assert.deepEqual(await service.rotateRefreshToken(session.refreshToken, at(1)), { ok: false, reason: "VERSION_MISMATCH" });
    await assert.rejects(create(), service.MobileSessionCreationError);
  });

  await t.test("현재 역할을 반영하고 계정 삭제는 FK로 로그인도 삭제한다", async () => {
    // Given: 회원 로그인
    await reset(); const session = await create();
    // When: 역할만 변경
    await admin.query("UPDATE public.users SET role='PENDING'");
    // Then: 역할은 즉시 반영되며 삭제 후에는 토큰이 존재하지 않음
    assert.equal((await service.authenticateAccessToken(session.accessToken, at(1)))?.role, "PENDING");
    await admin.query("DELETE FROM public.users");
    assert.equal(await service.authenticateAccessToken(session.accessToken, at(2)), null);
    assert.deepEqual(await service.rotateRefreshToken(session.refreshToken, at(2)), { ok: false, reason: "INVALID" });
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_sessions")).rows[0].count, 0);
  });

  await t.test("로그아웃은 멱등이고 전체 로그아웃은 계정 버전을 바꾸지 않는다", async () => {
    // Given: 같은 계정의 로그인 둘
    await reset(); const first = await create(); const second = await create();
    // When: 첫 로그인 반복 회수 후 전체 회수
    await service.revokeSessionByRefreshToken(first.refreshToken); await service.revokeSessionByRefreshToken(first.refreshToken);
    await service.revokeSessionByRefreshToken(service.generateMobileToken("refresh"));
    assert.equal(await service.authenticateAccessToken(first.accessToken, base), null);
    assert.ok(await service.authenticateAccessToken(second.accessToken, base));
    await service.revokeAllSessionsForUser(userId);
    // Then: 두 번째도 회수되나 Web 버전은 그대로
    assert.equal(await service.authenticateAccessToken(second.accessToken, base), null);
    assert.equal((await admin.query("SELECT session_version FROM public.users")).rows[0].session_version, 0);
  });

  await t.test("접근 기록은 분당 최대 한 번 갱신하며 원문은 어떤 열에도 저장하지 않는다", async () => {
    // Given: 발급 후 한 번 회전한 세션
    await reset(); const first = await create(); const next = await service.rotateRefreshToken(first.refreshToken, at(1000)); assert.ok(next.ok);
    // When: 한 분 이내 여러 번 인증
    await service.authenticateAccessToken(next.session.accessToken, at(60000));
    await service.authenticateAccessToken(next.session.accessToken, at(61000));
    await service.authenticateAccessToken(next.session.accessToken, at(62000));
    // Then: 기록은 61초 한 번이고 저장 행에는 원문/접두어가 없음
    const row = (await admin.query("SELECT to_jsonb(s) AS value FROM public.mobile_sessions s")).rows[0].value;
    assert.equal(new Date(row.last_used_at).getTime(), at(61000).getTime());
    const serialized = JSON.stringify(row);
    assert.equal(/hra_[ar]t_/.test(serialized), false);
    for (const token of [first.accessToken, first.refreshToken, next.session.accessToken, next.session.refreshToken]) assert.equal(serialized.includes(token), false);
    for (const name of ["access_hash", "refresh_hash", "prev_refresh_hash"]) assert.match(row[name], /^[0-9a-f]{64}$/);
  });

  await t.test("정리 배치는 만료/회수 행만 상한 내에서 삭제한다", async () => {
    // Given: 유효 세션 하나와 회수 세션 둘
    await reset(); const valid = await create();
    for (let index = 0; index < 2; index++) { const session = await create(); await service.revokeSessionByRefreshToken(session.refreshToken); }
    await admin.query("UPDATE public.mobile_sessions SET revoked_at=$1 WHERE revoked_at IS NOT NULL", [at(1)]);
    // When: 정리 상한 1로 요청
    const deleted = await service.purgeExpiredSessions(at(2), 1);
    // Then: 한 건만 삭제되고 비정상 상한은 거부
    assert.equal(deleted, 1);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_sessions")).rows[0].count, 2);
    assert.equal(await service.purgeExpiredSessions(base, 0), 0);
    assert.ok(await service.authenticateAccessToken(valid.accessToken, base));
  });

  await t.test("세션 테이블이 아직 없으면 저장소 오류로 닫히고 HTTP 503이 된다", async () => {
    // Given: 운영 DB에 migration을 적용하기 전과 같은 상태(두 테이블 부재)를 이름 변경으로 재현
    await reset(); const before = await create();
    await admin.query("ALTER TABLE public.mobile_session_refresh_history RENAME TO mobile_session_refresh_history_hidden");
    await admin.query("ALTER TABLE public.mobile_sessions RENAME TO mobile_sessions_hidden");
    try {
      // When: 발급·인증·회전·전체 회수를 시도
      const calls = [
        () => create(),
        () => service.authenticateAccessToken(before.accessToken, base),
        () => service.rotateRefreshToken(before.refreshToken, at(1000)),
        () => service.revokeAllSessionsForUser(userId),
      ];
      // Then: 모두 정제된 저장소 오류이며 인증 성공이나 null(401)로 흘러가지 않음
      for (const call of calls) await assert.rejects(call(), error => error instanceof service.MobileSessionStorageError);
      const response = await service.mobileAuthResponse(async () => { await service.authenticateAccessToken(before.accessToken, base); return new Response(null, { status: 204 }); });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error.code, "UNAVAILABLE");
    } finally {
      await admin.query("ALTER TABLE public.mobile_sessions_hidden RENAME TO mobile_sessions");
      await admin.query("ALTER TABLE public.mobile_session_refresh_history_hidden RENAME TO mobile_session_refresh_history");
    }
  });

  await registerHardeningCases({ t, factory, admin, service, reset, create, userId, base, at, migration });
  await registerCheckpointCases({ t, admin, service, reset, userId, create, at });
  await registerConcurrencyCases({ t, factory, admin, service, reset, userId, create, at });
  await registerLockCases({ t, factory, admin, service, reset, userId });
});
