/**
 * 모바일 비밀번호 로그인과 갱신 정책을 조정하는 Application Service입니다.
 * Auth.js를 import하지 않아 쿠키를 설치하지 않으며 차단된 로그인은 bcrypt 전에 종료합니다.
 */
import "server-only";
import { compare } from "bcryptjs";
import { toApiV1MeResponse, type ApiV1MobileLoginInput, type ApiV1MobileLoginResponse, type ApiV1MobileLogoutInput, type ApiV1MobileRefreshInput, type ApiV1MobileRefreshResponse } from "@hra/contracts/api-v1";
import { findCredentialUser } from "@/lib/auth-credentials";
import { reserveLoginAttempt, releaseSuccessfulLogin } from "@/lib/rate-limit";
import { getCurrentProfile } from "@/features/users/me/service";
import { createMobileSession, rotateRefreshToken, hashMobileToken, isMobileToken, revokeSessionByRefreshToken } from "@/features/auth/mobile-session/service";
import { logServerError } from "@/lib/errors";
import { MobileAuthError } from "./errors";
import { MOBILE_LOGIN_RETRY_SECONDS, MOBILE_REFRESH_IP_POLICY, MOBILE_REFRESH_SESSION_POLICY } from "./policy";
import { checkRefreshBudget, findRefreshSessionId, reserveRefreshBudget } from "./repository";

// Web과 같은 cost 12의 사전 계산 해시이며 실제 계정의 인증에는 절대로 사용하지 않습니다.
const DUMMY_PASSWORD_HASH = "$2b$12$z/qEe8YYHyxXWQv8pJpxgOM8sLEXLWOmxou0re9M1IkPPhMYHyd32";

/** 조회 결과의 sessionVersion은 전체 사용자 열을 읽는 기존 저장소에서 얻습니다. */
export async function loginWithPassword(input: ApiV1MobileLoginInput, ip: string): Promise<ApiV1MobileLoginResponse> {
  const reservation = await reserveLoginAttempt(ip, input.email);
  if (reservation.unavailable) throw new MobileAuthError("UNAVAILABLE");
  if (reservation.blocked) throw new MobileAuthError("RATE_LIMITED", MOBILE_LOGIN_RETRY_SECONDS);
  const user = await findCredentialUser(input.email);
  const valid = await compare(input.password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !valid) throw new MobileAuthError("UNAUTHENTICATED");
  await releaseSuccessfulLogin(reservation.reservationId, true);
  const profile = await getCurrentProfile({ userId: user.id, role: user.role });
  if (!profile) throw new MobileAuthError("UNAUTHENTICATED");
  const session = await createMobileSession({ userId: user.id, sessionVersion: user.sessionVersion, device: input.device });
  return { session, user: toApiV1MeResponse(profile).user };
}

/** IP 예산을 먼저 소비하고 식별 가능한 모든 세대의 토큰을 동일한 세션 예산으로 묶습니다. */
export async function refreshMobileSession(input: ApiV1MobileRefreshInput, ip: string): Promise<ApiV1MobileRefreshResponse> {
  await reserveRefreshBudget(MOBILE_REFRESH_IP_POLICY, ip);
  let budget = { allowed: true, retryAfterSeconds: MOBILE_LOGIN_RETRY_SECONDS };
  // 세션 ID는 비밀이 아닌 UUID이며 재사용·회수 모니터링 로그의 상관 키로만 사용합니다.
  let sessionId: string | null = null;
  if (isMobileToken(input.refreshToken, "refresh")) {
    sessionId = await findRefreshSessionId(hashMobileToken(input.refreshToken));
    if (sessionId) budget = await checkRefreshBudget(MOBILE_REFRESH_SESSION_POLICY, sessionId);
  }
  const result = await rotateRefreshToken(input.refreshToken, undefined, { mayRotate: budget.allowed });
  switch (result.ok) {
    case true: return { session: result.session };
    case false:
      switch (result.reason) {
        case "THROTTLED": throw new MobileAuthError("RATE_LIMITED", budget.retryAfterSeconds);
        case "REUSE_DETECTED":
          logServerError("mobile-auth/refresh-reuse", null, { outcome: "DENIED", sessionId });
          break;
        case "REVOKED":
          logServerError("mobile-auth/refresh-revoked", null, { outcome: "DENIED", sessionId });
          break;
        case "INVALID": case "EXPIRED": case "WITHIN_LEEWAY": case "VERSION_MISMATCH": break;
        default: return assertNever(result.reason);
      }
      throw new MobileAuthError("UNAUTHENTICATED");
    default: return assertNever(result);
  }
}

/**
 * 단일 로그아웃도 토큰 조회 전에 갱신과 같은 IP 예산을 소비합니다.
 * 존재하지 않는 토큰의 대량 조회를 제한하되 응답은 계속 존재 여부를 드러내지 않는 204입니다.
 */
export async function logoutMobileSession(input: ApiV1MobileLogoutInput, ip: string): Promise<void> {
  await reserveRefreshBudget(MOBILE_REFRESH_IP_POLICY, ip);
  await revokeSessionByRefreshToken(input.refreshToken);
}

/** 새 회전 결과가 추가되면 컴파일 단계에서 처리를 요구합니다. */
function assertNever(value: never): never { throw value; }
