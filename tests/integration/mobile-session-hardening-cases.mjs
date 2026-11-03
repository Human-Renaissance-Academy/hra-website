/** 모바일 가족 재사용·실제 잠금 대기·계정 정책을 소유 일회성 DB에서 검증하는 추가 사례입니다. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

/** 부모 fixture 수명을 공유하되 실제 DB·서비스 경계는 교체하지 않습니다. */
export async function registerHardeningCases(context) {
  const { t, factory, admin, service, reset, create, userId, at, migration } = context;

  await t.test("두 세대 이전 토큰은 최신 회전 유예 중에도 가족 전체를 회수한다", async () => {
    // Given: 탈취자가 원래 토큰을 두 번 교환한 가족
    await reset(); const original = await create();
    const first = await service.rotateRefreshToken(original.refreshToken, at(1000)); assert.ok(first.ok);
    const second = await service.rotateRefreshToken(first.session.refreshToken, at(2000)); assert.ok(second.ok);
    // When: 정당한 보유자가 최신 회전 직후 R0를 제시
    const replay = await service.rotateRefreshToken(original.refreshToken, at(2001));
    // Then: 유예는 직전 세대에만 적용되며 탈취자의 새 토큰도 무효
    assert.deepEqual(replay, { ok: false, reason: "REUSE_DETECTED" });
    assert.equal(await service.authenticateAccessToken(second.session.accessToken, at(2002)), null);
    assert.deepEqual(await service.rotateRefreshToken(second.session.refreshToken, at(2002)), { ok: false, reason: "REVOKED" });
  });

  for (const boundary of ["expiry", "leeway"]) await t.test(`실제 행 잠금 대기 후 DB 시각으로 ${boundary} 경계를 판정한다`, async () => {
    // Given: 운영 기본 시계 경로의 세션과 독립 연결의 배타 행 잠금
    await reset(); let session = await service.createMobileSession({ userId, sessionVersion: 0 });
    if (boundary === "leeway") {
      const original = session;
      const rotated = await service.rotateRefreshToken(original.refreshToken); assert.ok(rotated.ok);
      session = original;
      await admin.query("UPDATE public.mobile_sessions SET created_at=clock_timestamp()-interval '1 minute',rotated_at=clock_timestamp()-interval '9.5 seconds'");
    } else {
      await admin.query("UPDATE public.mobile_sessions SET access_expires_at=clock_timestamp()+interval '1 second',refresh_expires_at=clock_timestamp()+interval '2 seconds'");
    }
    const blocker = await factory.open();
    let pending;
    try {
      await blocker.query("BEGIN; SELECT id FROM public.mobile_sessions FOR UPDATE");
      const blockerPid = (await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = service.rotateRefreshToken(session.refreshToken);
      // When: pg_blocking_pids가 실제 대기를 증명한 뒤 경계를 넘겨 잠금을 해제
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const observed = await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS blocked", [blockerPid]);
        if (observed.rows[0].blocked) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, "회전 요청이 실제 행 잠금을 기다려야 함");
      await blocker.query(boundary === "expiry" ? "SELECT pg_sleep(2.2); COMMIT" : "SELECT pg_sleep(1.5); COMMIT");
      // Then: 요청 시작 시각을 쓰면 통과할 판정이 잠금 해제 시각에는 거부됨
      assert.deepEqual(await pending, { ok: false, reason: boundary === "expiry" ? "EXPIRED" : "REUSE_DETECTED" });
    } finally {
      await blocker.query("ROLLBACK"); await blocker.close();
      if (pending) await pending;
    }
  });

  await t.test("운영 DB 시계 기본 경로의 발급·인증·회전은 절대 만료로 제한된다", async () => {
    // Given: 시험 시각을 전달하지 않은 로그인
    await reset(); const session = await service.createMobileSession({ userId, sessionVersion: 0 });
    assert.ok(await service.authenticateAccessToken(session.accessToken));
    await admin.query("UPDATE public.mobile_sessions SET access_expires_at=clock_timestamp()+interval '30 seconds',refresh_expires_at=clock_timestamp()+interval '1 minute',absolute_expires_at=clock_timestamp()+interval '1 minute'");
    const absolute = (await admin.query("SELECT absolute_expires_at FROM public.mobile_sessions")).rows[0].absolute_expires_at;
    // When: 운영 기본 DB 시계로 회전
    const rotated = await service.rotateRefreshToken(session.refreshToken); assert.ok(rotated.ok);
    // Then: 새 만료는 DB 절대 만료와 같고 접근도 계속 가능
    assert.equal(rotated.session.accessTokenExpiresAt, new Date(absolute).toISOString());
    assert.equal(rotated.session.refreshTokenExpiresAt, new Date(absolute).toISOString());
    assert.ok(await service.authenticateAccessToken(rotated.session.accessToken));
  });

  await t.test("실제 그룹 변경의 조건부 버전 증가가 Web 비교와 모바일을 함께 무효화한다", async () => {
    // Given: users/actions의 role·cohort 변경 조건과 같은 버전 0 자격
    await reset(); const session = await create(); const webSessionVersion = 0;
    // When: 실제 액션과 동일한 NULL-safe 변경 판정으로 버전을 원자 증가
    await admin.query(`UPDATE public.users SET role=$1::user_role,cohort_id=$2::uuid,
      session_version=CASE WHEN role IS DISTINCT FROM $1::user_role OR cohort_id IS DISTINCT FROM $2::uuid
        THEN session_version+1 ELSE session_version END WHERE id=$3::uuid`, ["PENDING", null, userId]);
    // Then: Web-style 비교와 모바일 접근·갱신 모두 거부
    const currentVersion = (await admin.query("SELECT session_version FROM public.users WHERE id=$1", [userId])).rows[0].session_version;
    assert.equal(webSessionVersion === currentVersion, false);
    assert.equal(await service.authenticateAccessToken(session.accessToken, at(1)), null);
    assert.deepEqual(await service.rotateRefreshToken(session.refreshToken, at(1)), { ok: false, reason: "VERSION_MISMATCH" });
  });

  await t.test("비밀번호 정책: 해시만 바꾸면 무효화되지 않으므로 같은 문장의 버전 증가가 필수다", async () => {
    // Given: 기존 자격과 비밀번호 해시만 바꾸는 잘못된 운영 변경
    await reset(); const session = await create();
    await admin.query("UPDATE public.users SET password_hash='synthetic-replacement-not-a-password'");
    // When: 기존 자격으로 인증·회전
    const principal = await service.authenticateAccessToken(session.accessToken, at(1));
    const rotated = await service.rotateRefreshToken(session.refreshToken, at(1));
    // Then: 이는 권장 동작이 아닌 버전 증가 누락의 보안 한계를 기록하는 정책 시험
    assert.equal(principal?.sessionVersion, 0); assert.ok(rotated.ok);
    await admin.query("UPDATE public.users SET password_hash='synthetic-next-not-a-password',session_version=session_version+1");
    assert.equal(await service.authenticateAccessToken(rotated.session.accessToken, at(2)), null);
    assert.deepEqual(await service.rotateRefreshToken(rotated.session.refreshToken, at(2)), { ok: false, reason: "VERSION_MISMATCH" });
  });

  for (const mode of ["delete-user", "purge"]) await t.test(`가족 이력은 ${mode} 시 세션과 함께 cascade 삭제된다`, async () => {
    // Given: 소비 이력이 있는 로그인
    await reset(); const session = await create();
    const rotated = await service.rotateRefreshToken(session.refreshToken, at(1)); assert.ok(rotated.ok);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_session_refresh_history")).rows[0].count, 1);
    // When: 사용자 삭제 또는 DB 기본 시계의 만료 정리
    if (mode === "delete-user") await admin.query("DELETE FROM public.users");
    else assert.equal(await service.purgeExpiredSessions(undefined, 10), 1);
    // Then: 고아 이력이 남지 않음
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_session_refresh_history")).rows[0].count, 0);
    assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_sessions")).rows[0].count, 0);
  });

  for (const [name, corrupt, restore] of [
    ["CHECK", "ALTER TABLE public.mobile_session_refresh_history DROP CONSTRAINT mobile_session_refresh_history_hash_check; ALTER TABLE public.mobile_session_refresh_history ADD CONSTRAINT mobile_session_refresh_history_hash_check CHECK(length(refresh_hash)>0)", "ALTER TABLE public.mobile_session_refresh_history DROP CONSTRAINT mobile_session_refresh_history_hash_check; ALTER TABLE public.mobile_session_refresh_history ADD CONSTRAINT mobile_session_refresh_history_hash_check CHECK(refresh_hash ~ '^[0-9a-f]{64}$')"],
    ["FK", "ALTER TABLE public.mobile_session_refresh_history DROP CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk; ALTER TABLE public.mobile_session_refresh_history ADD CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk FOREIGN KEY(session_id) REFERENCES public.mobile_sessions(id)", "ALTER TABLE public.mobile_session_refresh_history DROP CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk; ALTER TABLE public.mobile_session_refresh_history ADD CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk FOREIGN KEY(session_id) REFERENCES public.mobile_sessions(id) ON DELETE CASCADE"],
    // 정의는 같고 이름만 PostgreSQL 기본값(*_fkey)인 기존 FK도 Drizzle export와 달라 거부한다.
    ["FK 이름", "ALTER TABLE public.mobile_session_refresh_history RENAME CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk TO mobile_session_refresh_history_session_id_fkey", "ALTER TABLE public.mobile_session_refresh_history RENAME CONSTRAINT mobile_session_refresh_history_session_id_fkey TO mobile_session_refresh_history_session_id_mobile_sessions_id_fk"],
    ["index", "DROP INDEX public.mobile_session_refresh_history_session_idx; CREATE INDEX mobile_session_refresh_history_session_idx ON public.mobile_session_refresh_history(consumed_at)", "DROP INDEX public.mobile_session_refresh_history_session_idx; CREATE INDEX mobile_session_refresh_history_session_idx ON public.mobile_session_refresh_history(session_id)"],
  ]) await t.test(`이력 표의 느슨한 ${name} drift를 migration 재실행이 거부한다`, async () => {
    // Given: 이름만 같은 느슨한 기존 객체
    await reset(); await admin.query(corrupt);
    try {
      // When / Then: 자동 보정하지 않고 거부
      await assert.rejects(admin.query(migration), error => error.code === "P0001");
    } finally { await admin.query("ROLLBACK"); await admin.query(restore); }
  });

  await t.test("migration 결과의 제약·인덱스 이름과 정의가 Drizzle export 번들과 일치한다", async () => {
    // Given: export 번들의 모바일 세션 문장만 별도 schema에 적용 (users는 FK 대상 최소 정의)
    const exportSql = readFileSync(new URL("../../scripts/db/candidates/db-fresh/schema-export.sql", import.meta.url), "utf8");
    const statements = exportSql.split(/;\s*\n/).map(statement => statement.trim())
      .filter(statement => /"mobile_session(s|_refresh_history)"/.test(statement) && /^(CREATE TABLE|ALTER TABLE|CREATE INDEX)/.test(statement));
    assert.ok(statements.length >= 9, "export 번들에서 모바일 세션 문장을 찾지 못했습니다.");
    const probe = "hra_mobile_export_probe";
    await admin.query(`DROP SCHEMA IF EXISTS ${probe} CASCADE; CREATE SCHEMA ${probe}; CREATE TABLE ${probe}.users(id uuid PRIMARY KEY)`);
    try {
      await admin.query(`SET search_path=${probe},pg_catalog`);
      for (const statement of statements) await admin.query(statement.replaceAll('"public".', `"${probe}".`));
      // When: 두 schema의 카탈로그를 같은 search_path 규칙으로 읽음(정의 문자열에 schema 접두어가 붙지 않게 함)
      const catalog = async schema => {
        await admin.query(`SET search_path=${schema},pg_catalog`);
        const constraints = (await admin.query(`SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition
          FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relname IN ('mobile_sessions','mobile_session_refresh_history') ORDER BY 1,2`, [schema])).rows;
        const indexes = (await admin.query(`SELECT c.relname,i.relname AS index_name,replace(pg_get_indexdef(i.oid),$1||'.','') AS definition
          FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relname IN ('mobile_sessions','mobile_session_refresh_history') ORDER BY 1,2`, [schema])).rows;
        return { constraints, indexes };
      };
      const expected = await catalog(probe), actual = await catalog("public");
      // Then: FK·PK·UNIQUE·CHECK 이름과 정의, 인덱스 이름과 정의가 모두 같음
      assert.ok(actual.constraints.some(row => row.conname === "mobile_sessions_user_id_users_id_fk"));
      assert.ok(actual.constraints.some(row => row.conname === "mobile_session_refresh_history_session_id_mobile_sessions_id_fk"));
      assert.deepEqual(actual.constraints, expected.constraints);
      assert.deepEqual(actual.indexes, expected.indexes);
    } finally {
      await admin.query("SET search_path=public,pg_catalog");
      await admin.query(`DROP SCHEMA IF EXISTS ${probe} CASCADE`);
    }
  });
}
