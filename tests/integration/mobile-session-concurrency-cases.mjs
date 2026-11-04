/** 계정 튜플의 잠금 후 최신성, 접근 비대기, 회전과 회수·정리의 제어된 경합 회귀입니다. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { PgDialect } from "drizzle-orm/pg-core";

/** 관측 조건을 제한 시간 안에서 기다려 실제 DB 잠금 대기를 확인합니다. */
async function waitBlocked(admin, pid) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS blocked", [pid]);
    if (result.rows[0].blocked) return;
    await delay(10);
  }
  assert.fail("독립 연결이 실제 행 잠금을 기다려야 합니다.");
}

export async function registerConcurrencyCases({ t, factory, admin, service, reset, userId, create, at }) {
  for (const mode of ["version", "role", "delete"]) await t.test(`세션 잠금 후 최신 계정 튜플로 회전을 판정한다: ${mode}`, async () => {
    // Given
    await reset(); const original = await service.createMobileSession({ userId, sessionVersion: 0 });
    const blocker = await factory.open();
    const deleter = await factory.open();
    let rotation; let deletion;
    try {
      await blocker.query("BEGIN; SELECT id FROM public.mobile_sessions FOR UPDATE");
      const pid = (await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      if (mode === "delete") { deletion = deleter.query("DELETE FROM public.users"); await waitBlocked(admin, pid); }
      rotation = service.rotateRefreshToken(original.refreshToken);
      if (mode !== "delete") {
        await waitBlocked(admin, pid);
        await admin.query(mode === "version" ? "UPDATE public.users SET session_version=session_version+1" : "UPDATE public.users SET role='PENDING'");
      }
      // When
      await blocker.query("COMMIT");
      if (deletion) await deletion;
      const result = await rotation;
      // Then
      if (mode === "version") {
        assert.deepEqual(result, { ok: false, reason: "VERSION_MISMATCH" });
        assert.equal((await admin.query("SELECT refresh_hash FROM public.mobile_sessions")).rows[0].refresh_hash, service.hashMobileToken(original.refreshToken));
      } else if (mode === "role") {
        assert.ok(result.ok);
        const principal = await service.authenticateAccessToken(result.session.accessToken);
        assert.equal((await service.validateMobileSession({ sessionId: principal.sessionId, expectedVersion: 0 }))?.role, "PENDING");
      } else {
        assert.deepEqual(result, { ok: false, reason: "INVALID" });
        assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_session_refresh_history")).rows[0].count, 0);
      }
    } finally {
      await blocker.query("ROLLBACK"); await blocker.close(); await deleter.close();
      if (rotation) await rotation;
    }
  });

  await t.test("회전이 행을 잠가도 접근 인증은 기록 쓰기를 건너뛰고 즉시 반환한다", async () => {
    // Given
    await reset(); const session = await service.createMobileSession({ userId, sessionVersion: 0 });
    await admin.query("UPDATE public.mobile_sessions SET created_at=statement_timestamp()-interval '3 minutes',rotated_at=statement_timestamp()-interval '3 minutes',last_used_at=statement_timestamp()-interval '2 minutes'");
    const blocker = await factory.open();
    try {
      await blocker.query("BEGIN; SELECT id FROM public.mobile_sessions FOR UPDATE");
      // When / Then: 기존 FOR UPDATE는 이 상한 안에 끝날 수 없습니다.
      const pending = service.authenticateAccessToken(session.accessToken);
      const result = await Promise.race([pending, delay(750).then(() => { throw new Error("접근 인증이 회전 잠금을 기다렸습니다."); })]);
      assert.equal(result?.userId, userId);
    } finally { await blocker.query("ROLLBACK"); await blocker.close(); }
  });

  for (const mode of ["logout", "logout-all", "purge"]) await t.test(`회전과 ${mode} 제어 경합 20회는 일관성을 유지한다`, async () => {
    const dialect = new PgDialect();
    for (let iteration = 0; iteration < 20; iteration++) {
      // Given: 실제 회전 SQL이 끝난 뒤 COMMIT 직전에서 멈춰 세션 잠금을 유지합니다.
      await reset(); const original = await create();
      const locked = Promise.withResolvers(); const release = Promise.withResolvers();
      const execute = globalThis.__mobileSessionExecute;
      globalThis.__mobileSessionExecute = async statement => {
        const connection = await factory.open();
        try {
          await connection.query("BEGIN");
          const query = dialect.sqlToQuery(statement);
          const result = await connection.query(query.sql, query.params);
          const pid = (await connection.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
          locked.resolve(pid); await release.promise; await connection.query("COMMIT"); return result;
        } finally { await connection.close(); }
      };
      const rotation = service.rotateRefreshToken(original.refreshToken, at(1000));
      let contender;
      try {
        const pid = await locked.promise;
        globalThis.__mobileSessionExecute = execute;
        // When
        if (mode === "purge") {
          assert.equal(await service.purgeExpiredSessions(at(31 * 86400000), 10), 0);
        } else {
          contender = mode === "logout" ? service.revokeSessionByRefreshToken(original.refreshToken) : service.revokeAllSessionsForUser(userId);
          await waitBlocked(admin, pid);
        }
        release.resolve();
        const rotated = await rotation; assert.ok(rotated.ok);
        if (contender) await contender;
        // Then: 뒤따른 회수는 새 자격도 거부하고 정리는 방금 회전한 가족을 건드리지 않습니다.
        const identity = await service.authenticateAccessToken(rotated.session.accessToken, at(1001));
        assert.equal(identity?.userId ?? null, mode === "purge" ? userId : null);
        assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_session_refresh_history")).rows[0].count, 1);
        if (mode === "purge") assert.equal(await service.purgeExpiredSessions(at(1001), 10), 0);
      } finally {
        globalThis.__mobileSessionExecute = execute; release.resolve(); await rotation;
        if (contender) await contender;
      }
    }
  });
}
