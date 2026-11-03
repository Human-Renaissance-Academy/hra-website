// @vitest-environment node
/** 모바일 로그인·갱신의 예약 순서와 토큰 상태 비노출을 검증하는 정책 회귀입니다. */
import { beforeEach, expect, it, vi } from "vitest";
import { apiV1MobileLoginResponseSchema } from "@hra/contracts/api-v1";
const mocks = vi.hoisted(() => ({ reserve: vi.fn(), release: vi.fn(), user: vi.fn(), compare: vi.fn(), profile: vi.fn(), create: vi.fn(), rotate: vi.fn(), revoke: vi.fn(), budget: vi.fn(), check: vi.fn(), identify: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ reserveLoginAttempt: mocks.reserve, releaseSuccessfulLogin: mocks.release }));
vi.mock("@/lib/auth-credentials", () => ({ findCredentialUser: mocks.user }));
vi.mock("bcryptjs", () => ({ compare: mocks.compare }));
vi.mock("@/features/users/me/service", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/features/auth/mobile-session/service", async (original) => ({ ...await original<object>(), createMobileSession: mocks.create, rotateRefreshToken: mocks.rotate, revokeSessionByRefreshToken: mocks.revoke }));
vi.mock("@/features/auth/mobile-login/repository", () => ({ reserveRefreshBudget: mocks.budget, checkRefreshBudget: mocks.check, findRefreshSessionId: mocks.identify }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { loginWithPassword, logoutMobileSession, refreshMobileSession } from "@/features/auth/mobile-login/service";
import { MobileAuthError } from "@/features/auth/mobile-login/errors";
import { MOBILE_REFRESH_IP_POLICY, MOBILE_REFRESH_SESSION_POLICY } from "@/features/auth/mobile-login/policy";

const id = "11111111-1111-4111-8111-111111111111";
const input = { email: "person@example.invalid", password: "합성 비밀번호" };
const session = { tokenType: "Bearer", accessToken: "hra_at_synthetic", refreshToken: "hra_rt_synthetic", accessTokenExpiresAt: "2026-10-31T12:15:00.000Z", refreshTokenExpiresAt: "2026-11-30T12:00:00.000Z" };
const refreshInput = { refreshToken: `hra_rt_${"a".repeat(42)}A` };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.reserve.mockResolvedValue({ blocked: false, reservationId: id, retryAfterSec: 0 });
  mocks.user.mockResolvedValue({ id, role: "MEMBER", passwordHash: "synthetic-hash", sessionVersion: 7 });
  mocks.compare.mockResolvedValue(true);
  mocks.profile.mockResolvedValue({ id, name: "합성", email: "kakao_123@oauth.placeholder", role: "MEMBER", cohortId: null, image: null });
  mocks.create.mockResolvedValue(session);
  mocks.identify.mockResolvedValue(id);
  mocks.rotate.mockResolvedValue({ ok: true, session });
  mocks.check.mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
});

it("차단된 예약이면 사용자 조회와 bcrypt를 실행하지 않는다", async () => {
  // Given
  mocks.reserve.mockResolvedValue({ blocked: true, retryAfterSec: 0, reservationId: null });
  // When / Then
  await expect(loginWithPassword(input, "unknown")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 900 });
  expect(mocks.user).not.toHaveBeenCalled();
  expect(mocks.compare).not.toHaveBeenCalled();
});
it("예약 저장소 장애이면 정책 차단이 아닌 UNAVAILABLE을 반환한다", async () => {
  // Given
  mocks.reserve.mockResolvedValue({ blocked: true, unavailable: true });
  // When / Then
  await expect(loginWithPassword(input, "unknown")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  expect(mocks.compare).not.toHaveBeenCalled();
});
it.each([null, { id, role: "MEMBER", passwordHash: null }, { id, role: "MEMBER", passwordHash: "" }])("허용된 미존재·소셜 계정은 dummy bcrypt 후 동일 오류가 된다: %j", async (user) => {
  // Given
  mocks.user.mockResolvedValue(user);
  // When / Then
  await expect(loginWithPassword(input, "unknown")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.compare).toHaveBeenCalledWith(input.password, expect.stringMatching(/^\$2b\$12\$/));
  expect(mocks.create).not.toHaveBeenCalled();
});
it("비밀번호가 다르면 동일 인증 실패로 끝난다", async () => {
  // Given
  mocks.compare.mockResolvedValue(false);
  // When / Then
  await expect(loginWithPassword(input, "unknown")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.release).not.toHaveBeenCalled();
});
it.each(["PENDING", "ADMIN"])("%s도 로그인하며 현재 버전과 공개 프로필만 사용한다", async (role) => {
  // Given
  mocks.user.mockResolvedValue({ id, role, passwordHash: "synthetic-hash", sessionVersion: 7 });
  mocks.profile.mockResolvedValue({ id, name: "합성", email: "kakao_123@oauth.placeholder", role, cohortId: null, image: null, passwordHash: "비공개" });
  // When
  const result = await loginWithPassword(input, "unknown");
  // Then
  expect(apiV1MobileLoginResponseSchema.parse(result)).toEqual(result);
  expect(result.user.email).toBeNull();
  expect(mocks.create).toHaveBeenCalledWith({ userId: id, sessionVersion: 7, device: undefined });
  expect(mocks.release).toHaveBeenCalledWith(id, true);
  expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.user.mock.invocationCallOrder[0]);
});
it("IP 제한에 걸리면 토큰 식별과 회전을 실행하지 않는다", async () => {
  // Given
  mocks.budget.mockRejectedValueOnce(new MobileAuthError("RATE_LIMITED", 30));
  // When / Then
  await expect(refreshMobileSession(refreshInput, "unknown")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(mocks.identify).not.toHaveBeenCalled();
  expect(mocks.rotate).not.toHaveBeenCalled();
});
it("성공 갱신도 IP와 안정적인 세션 ID 예산을 소비한다", async () => {
  // Given / When
  const result = await refreshMobileSession(refreshInput, "unknown");
  // Then
  expect(result).toEqual({ session });
  expect(mocks.budget.mock.calls).toEqual([[MOBILE_REFRESH_IP_POLICY, "unknown"]]);
  expect(mocks.check).toHaveBeenCalledWith(MOBILE_REFRESH_SESSION_POLICY, id);
  expect(mocks.check.mock.invocationCallOrder[0]).toBeLessThan(mocks.rotate.mock.invocationCallOrder[0]);
});
it("세션 제한에서도 판정을 실행하고 현재 토큰 THROTTLED만 429로 변환한다", async () => {
  // Given
  mocks.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
  mocks.rotate.mockResolvedValue({ ok: false, reason: "THROTTLED" });
  // When / Then
  await expect(refreshMobileSession(refreshInput, "unknown")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 20 });
  expect(mocks.rotate).toHaveBeenCalledWith(refreshInput.refreshToken, undefined, { mayRotate: false });
});
it.each(["INVALID", "EXPIRED", "REVOKED", "REUSE_DETECTED", "WITHIN_LEEWAY", "VERSION_MISMATCH"])("갱신 실패 %s를 동일 오류로 숨기고 비밀 없는 모니터링만 남긴다", async (reason) => {
  // Given
  mocks.rotate.mockResolvedValue({ ok: false, reason });
  mocks.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
  // When / Then
  await expect(refreshMobileSession(refreshInput, "unknown")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(refreshInput.refreshToken);
  expect(mocks.log).toHaveBeenCalledTimes(reason === "REVOKED" || reason === "REUSE_DETECTED" ? 1 : 0);
  // 모니터링 상관 키는 비밀이 아닌 세션 UUID와 고정 결과뿐이다.
  for (const call of mocks.log.mock.calls) expect(call[2]).toEqual({ outcome: "DENIED", sessionId: id });
});
it("단일 로그아웃은 토큰 회수 전에 갱신과 같은 IP 예산을 소비한다", async () => {
  // Given / When
  await logoutMobileSession(refreshInput, "unknown");
  // Then
  expect(mocks.budget.mock.calls).toEqual([[MOBILE_REFRESH_IP_POLICY, "unknown"]]);
  expect(mocks.revoke).toHaveBeenCalledWith(refreshInput.refreshToken);
  expect(mocks.budget.mock.invocationCallOrder[0]).toBeLessThan(mocks.revoke.mock.invocationCallOrder[0]);
});
it("단일 로그아웃의 IP 예산이 소진되면 토큰을 조회하지 않고 429다", async () => {
  // Given
  mocks.budget.mockRejectedValue(new MobileAuthError("RATE_LIMITED", 30));
  // When / Then
  await expect(logoutMobileSession(refreshInput, "unknown")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 30 });
  expect(mocks.revoke).not.toHaveBeenCalled();
});
