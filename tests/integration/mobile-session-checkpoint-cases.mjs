/** 소유 로컬 DB에서 인가 체크포인트와 제한 상태의 가족 재사용 회수를 검증합니다. */
import assert from "node:assert/strict";

export async function registerCheckpointCases({ t, admin, service, reset, userId, create, at }) {
  for (const mode of ["valid", "role", "version", "revoked", "refresh-expired", "absolute-expired", "access-expired", "deleted"]) {
    await t.test(`비잠금 체크포인트는 현재 세션·계정 상태를 반영한다: ${mode}`, async () => {
      // Given
      await reset();
      const session = await service.createMobileSession({ userId, sessionVersion: 0 });
      const principal = await service.authenticateAccessToken(session.accessToken);
      assert.ok(principal);
      // When
      if (mode === "role") await admin.query("UPDATE public.users SET role='PENDING'");
      if (mode === "version") await admin.query("UPDATE public.users SET session_version=session_version+1");
      if (mode === "revoked") await service.revokeAllSessionsForUser(userId);
      if (mode === "deleted") await admin.query("DELETE FROM public.users");
      if (mode === "refresh-expired") await admin.query("UPDATE public.mobile_sessions SET created_at=statement_timestamp()-interval '2 hours',rotated_at=statement_timestamp()-interval '2 hours',access_expires_at=statement_timestamp()-interval '1 hour',refresh_expires_at=statement_timestamp()-interval '1 second'");
      if (mode === "absolute-expired") await admin.query("UPDATE public.mobile_sessions SET created_at=statement_timestamp()-interval '2 hours',rotated_at=statement_timestamp()-interval '2 hours',access_expires_at=statement_timestamp()-interval '1 hour',refresh_expires_at=statement_timestamp()-interval '1 second',absolute_expires_at=statement_timestamp()-interval '1 second'");
      if (mode === "access-expired") await admin.query("UPDATE public.mobile_sessions SET created_at=statement_timestamp()-interval '2 hours',rotated_at=statement_timestamp()-interval '2 hours',access_expires_at=statement_timestamp()-interval '1 hour'");
      const identity = await service.validateMobileSession({ sessionId: principal.sessionId, expectedVersion: 0 });
      // Then
      assert.deepEqual(identity, ["valid", "role", "access-expired"].includes(mode) ? { userId, role: mode === "role" ? "PENDING" : "MEMBER" } : null);
    });
  }

  await t.test("제한 상태의 현재 토큰은 불변이며 오래된 소비 토큰은 가족 전체를 회수한다", async () => {
    // Given: 실제 reserve_rate_limit 저장소 경로로 안정적인 세션 ID 예산을 소진합니다.
    await reset(); const original = await create();
    const winner = await service.rotateRefreshToken(original.refreshToken, at(1)); assert.ok(winner.ok);
    const principal = await service.authenticateAccessToken(winner.session.accessToken, at(2)); assert.ok(principal);
    for (let count = 0; count < 12; count++) assert.equal((await service.checkRefreshBudget(service.MOBILE_REFRESH_SESSION_POLICY, principal.sessionId)).allowed, true);
    const budget = await service.checkRefreshBudget(service.MOBILE_REFRESH_SESSION_POLICY, principal.sessionId);
    assert.equal(budget.allowed, false);
    const before = (await admin.query("SELECT to_jsonb(s) AS value FROM public.mobile_sessions s")).rows[0].value;
    // When / Then: 현재 토큰은 새 자격·이력을 만들지 않습니다.
    assert.deepEqual(await service.rotateRefreshToken(winner.session.refreshToken, at(2), { mayRotate: budget.allowed }), { ok: false, reason: "THROTTLED" });
    assert.deepEqual((await admin.query("SELECT to_jsonb(s) AS value FROM public.mobile_sessions s")).rows[0].value, before);
    assert.deepEqual(await service.rotateRefreshToken(original.refreshToken, at(10002), { mayRotate: false }), { ok: false, reason: "REUSE_DETECTED" });
    assert.equal(await service.authenticateAccessToken(winner.session.accessToken, at(10003)), null);
    assert.deepEqual((await admin.query("SELECT (SELECT count(*)::int FROM public.mobile_sessions) AS sessions,(SELECT count(*)::int FROM public.mobile_session_refresh_history) AS history")).rows[0], { sessions: 1, history: 1 });
  });
}
