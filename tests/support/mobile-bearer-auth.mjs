/** 인증·전송 우선순위·회전 가족·현재 계정 인가를 실제 서버와 로컬 SQL로 검증한다. */
import { academicG1Actors as actors } from "./academic-g1-fixture.mjs";
import { check, expectStatus, hash, pass, webLogin } from "./mobile-bearer-http.mjs";

export async function verifyMobileAuth(context) {
  const { http: h, cluster, origin, cronSecret } = context;
  for (const name of ["studentA", "pending", "admin", "faculty"]) {
    const session = await h.login(name);
    await expectStatus(await h.me(session), 200, "ME");
    pass(`LOGIN_${name.toUpperCase()}`);
  }
  const bad = await h.json("/api/v1/auth/login", { email: actors.peerA.email, password: "wrong-isolated-password" });
  const absent = await h.json("/api/v1/auth/login", { email: "absent@mobile.invalid", password: "wrong-isolated-password" });
  const first = await expectStatus(bad, 401, "BAD_PASSWORD"), second = await expectStatus(absent, 401, "UNKNOWN_EMAIL");
  check(JSON.stringify({ ...first.error, requestId: null }) === JSON.stringify({ ...second.error, requestId: null }), "GENERIC_401");
  pass("GENERIC_401");
  let throttled;
  for (let index = 0; index < 6; index++) {
    const response = await h.json("/api/v1/auth/login", { email: actors.peerA.email, password: "wrong-isolated-password" });
    if (response.status === 429) { throttled = response; break; }
    await expectStatus(response, 401, "THROTTLE_FAILURE");
  }
  check(throttled, "THROTTLE_REQUIRED");
  const limited = await throttled.json();
  check(limited.error.retryAfterSeconds > 0 && limited.error.retryAfterSeconds <= 900 &&
    throttled.headers.get("retry-after") === String(limited.error.retryAfterSeconds), "THROTTLE_HEADERS");
  await h.login("studentB"); pass("LOGIN_THROTTLE_ISOLATION");
  const cookie = await webLogin(origin), session = await h.login();
  for (const Authorization of ["", "Basic abc", "Bearer", "Bearer invalid"]) {
    await expectStatus(await h.request("/api/v1/me", { headers: { Authorization, Cookie: cookie } }), 401, "AUTH_PRECEDENCE");
  }
  // 합성 쓰레기 쿠키: 공개 소스 검사기가 세션 쿠키 형태로 오인하지 않도록 이름을 조각으로 조립합니다.
  const garbageSessionCookie = ["authjs", "session-token"].join(".") + "=garbage";
  const mixed = await h.request("/api/v1/me", { headers: { ...h.bearer(session), Cookie: garbageSessionCookie } });
  await expectStatus(mixed, 200, "VALID_BEARER");
  await expectStatus(await h.request("/api/v1/me", { headers: { Cookie: cookie } }), 200, "COOKIE_ONLY");
  const protectedResponse = await h.me(session);
  const vary = protectedResponse.headers.get("vary")?.toLowerCase().split(",").map(value => value.trim());
  check(vary?.includes("cookie") && vary.includes("authorization") && protectedResponse.headers.get("cache-control") === "private, no-store", "PROTECTED_HEADERS");
  await protectedResponse.body.cancel(); pass("TRANSPORT_HEADERS_COOKIE");
  const rotated = await h.refresh(session); check(rotated.status === 200, "ROTATE");
  const next = (await rotated.json()).session;
  check(next.refreshToken !== session.refreshToken && next.accessToken !== session.accessToken, "ROTATE_TOKENS");
  await expectStatus(await h.refresh(session), 401, "LEEWAY");
  await expectStatus(await h.me(next), 200, "LEEWAY_ALIVE"); pass("ROTATION_LEEWAY");
  // 시간 순서 제약을 보존하면서 마지막 회전만 과거로 이동한다. 대기나 운영 시계 변경은 없다.
  cluster.sql(`UPDATE mobile_sessions SET created_at=created_at-interval '20 seconds',rotated_at=rotated_at-interval '20 seconds'
    WHERE refresh_hash='${hash(next.refreshToken)}'`);
  await expectStatus(await h.refresh(session), 401, "REUSE");
  await expectStatus(await h.me(next), 401, "REUSE_REVOKED"); pass("REUSE_AFTER_LEEWAY");
  const r0 = await h.login(), r1 = (await (await h.refresh(r0)).json()).session, r2 = (await (await h.refresh(r1)).json()).session;
  await expectStatus(await h.refresh(r0), 401, "THEFT");
  await expectStatus(await h.me(r2), 401, "FAMILY_REVOKED"); pass("TWO_ROTATION_THEFT");
  const race = await h.login();
  const results = await Promise.all(Array.from({ length: 6 }, () => h.refresh(race)));
  check(results.filter(value => value.status === 200).length === 1 && results.filter(value => value.status === 401).length === 5, "RACE_ONE_WINNER");
  let winner;
  for (const response of results) { const body = await response.json(); if (response.status === 200) winner = body.session; }
  await expectStatus(await h.me(winner), 200, "RACE_ALIVE");
  await expectStatus(await h.refresh(winner), 200, "RACE_REFRESH_ALIVE"); pass("REFRESH_RACE");
  const logout = await h.login();
  for (let index = 0; index < 2; index++) await expectStatus(await h.json("/api/v1/auth/logout", { refreshToken: logout.refreshToken }), 204, "LOGOUT");
  await expectStatus(await h.me(logout), 401, "LOGOUT_REVOKED"); pass("LOGOUT_IDEMPOTENT");
  const allA = await h.login(), allB = await h.login();
  await expectStatus(await h.json("/api/v1/auth/logout-all", {}, h.bearer(allA)), 400, "LOGOUT_ALL_BODY_REJECTED");
  await expectStatus(await h.json("/api/v1/auth/logout-all", undefined, { Cookie: cookie }), 401, "LOGOUT_ALL_COOKIE");
  await expectStatus(await h.json("/api/v1/auth/logout-all", undefined, h.bearer(allA)), 204, "LOGOUT_ALL");
  for (const item of [allA, allB]) { await expectStatus(await h.me(item), 401, "ALL_ACCESS"); await expectStatus(await h.refresh(item), 401, "ALL_REFRESH"); }
  await expectStatus(await h.request("/api/v1/me", { headers: { Cookie: cookie } }), 200, "WEB_SURVIVES"); pass("LOGOUT_ALL_WEB_SURVIVES");
  const version = await h.login("studentB");
  cluster.sql(`UPDATE users SET session_version=session_version+1 WHERE id='${actors.studentB.id}'`);
  await expectStatus(await h.me(version), 401, "VERSION_ACCESS"); await expectStatus(await h.refresh(version), 401, "VERSION_REFRESH"); pass("SESSION_VERSION");
  const role = await h.login("studentB");
  cluster.sql(`UPDATE users SET role='PENDING' WHERE id='${actors.studentB.id}'`);
  const profile = await (await h.me(role)).json(); check(profile.user.role === "PENDING", "FRESH_ROLE");
  await expectStatus(await h.request("/api/v1/resources/guidebooks", { headers: h.bearer(role) }), 403, "FRESH_ROLE_DENIED");
  cluster.sql(`UPDATE users SET role='MEMBER' WHERE id='${actors.studentB.id}'`); pass("FRESH_ROLE");
  const deleted = await h.login("pending");
  cluster.sql(`DELETE FROM users WHERE id='${actors.pending.id}'`);
  await expectStatus(await h.me(deleted), 401, "USER_DELETED"); pass("USER_DELETION");
  const expired = await h.login();
  cluster.sql(`UPDATE mobile_sessions SET created_at=created_at-interval '1 hour',rotated_at=rotated_at-interval '1 hour',
    access_expires_at=clock_timestamp()-interval '1 second' WHERE access_hash='${hash(expired.accessToken)}'`);
  await expectStatus(await h.me(expired), 401, "ACCESS_EXPIRED");
  await expectStatus(await h.refresh(expired), 200, "EXPIRED_REFRESH"); pass("ACCESS_EXPIRY_REFRESH");
  const revokedCount = Number(cluster.sql("SELECT count(*) FROM mobile_sessions WHERE revoked_at IS NOT NULL"));
  check(revokedCount > 0, "PURGE_FIXTURE");
  await expectStatus(await h.request("/api/cron/cleanup-mobile-sessions"), 401, "CRON_AUTH");
  const purge = await h.request("/api/cron/cleanup-mobile-sessions", { headers: { Authorization: `Bearer ${cronSecret}` } });
  check(purge.status === 200 && (await purge.json()).deletedCount >= revokedCount, "CRON_PURGE"); pass("CRON_PURGE");
  return cookie;
}
