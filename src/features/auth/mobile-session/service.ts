/**
 * 모바일 토큰 발급·인증·회전·회수 Application Service입니다.
 * HTTP/Next/Auth.js에 의존하지 않습니다. now 인자는 격리 시험 전용이며 운영 시각은 DB가 소유합니다.
 */
import "server-only";
import { z } from "zod/v4";
import { deleteExpiredSessions, findAccessPrincipal, findValidMobileSession, insertMobileSession, revokeByRefreshHash, revokeUserSessions, rotateSessionHash } from "./repository";
import { generateMobileToken, hashMobileToken, isMobileToken } from "./tokens";
import { MobileSessionCreationError, MobileSessionStorageError, type CreateMobileSessionInput, type MobilePrincipal, type MobileSession, type RotateRefreshTokenResult } from "./types";

export * from "./tokens";
export * from "./types";

const creationSchema = z.object({
  userId: z.uuid(), sessionVersion: z.number().int().nonnegative(),
  device: z.object({ platform: z.enum(["ANDROID", "IOS"]).optional(), appVersion: z.string().max(64).optional(), deviceName: z.string().max(100).optional() }).optional(),
  now: z.date().optional(),
});

/** 원문은 서비스 메모리와 성공 반환에만 존재하고 저장소 입력에는 해시만 투영합니다. */
function prepareTokens(testNow?: Date) {
  const accessToken = generateMobileToken("access");
  const refreshToken = generateMobileToken("refresh");
  return {
    accessToken, refreshToken,
    hashes: {
      accessHash: hashMobileToken(accessToken), refreshHash: hashMobileToken(refreshToken), testNow,
    },
  };
}

/** 로그인 검증 당시 버전을 DB에서 다시 확인한 뒤에만 토큰을 반환합니다. */
export async function createMobileSession(input: CreateMobileSessionInput): Promise<MobileSession> {
  const parsed = creationSchema.safeParse(input);
  if (!parsed.success) throw new MobileSessionCreationError();
  const tokens = prepareTokens(parsed.data.now);
  const created = await insertMobileSession({ ...parsed.data, ...tokens.hashes });
  if (!created) throw new MobileSessionCreationError();
  if (!created.accessExpiresAt || !created.refreshExpiresAt) throw new MobileSessionStorageError();
  return { tokenType: "Bearer", accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: created.accessExpiresAt.toISOString(), refreshTokenExpiresAt: created.refreshExpiresAt.toISOString() };
}

/** 계정 삭제·버전 변경·회수·세 가지 만료를 매번 DB의 단일 조회에서 확인합니다. */
export async function authenticateAccessToken(rawToken: string, testNow?: Date): Promise<MobilePrincipal | null> {
  if (!isMobileToken(rawToken, "access") || !z.date().optional().safeParse(testNow).success) return null;
  return findAccessPrincipal(hashMobileToken(rawToken), testNow);
}

/** 실패 시 생성한 토큰도 버리고 승자에게만 새로운 원문을 반환합니다. */
export async function rotateRefreshToken(rawRefreshToken: string, testNow?: Date, options?: { readonly mayRotate?: boolean }): Promise<RotateRefreshTokenResult> {
  if (!isMobileToken(rawRefreshToken, "refresh") || !z.date().optional().safeParse(testNow).success) return { ok: false, reason: "INVALID" };
  const tokens = prepareTokens(testNow);
  const result = await rotateSessionHash(hashMobileToken(rawRefreshToken), tokens.hashes, options?.mayRotate ?? true);
  if (!result) return { ok: false, reason: "INVALID" };
  if (result.reason !== "ROTATED") return { ok: false, reason: result.reason };
  if (!result.accessExpiresAt || !result.refreshExpiresAt) throw new MobileSessionStorageError();
  return { ok: true, session: {
    tokenType: "Bearer", accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: result.accessExpiresAt.toISOString(), refreshTokenExpiresAt: result.refreshExpiresAt.toISOString(),
  } };
}

/** 최초 Bearer 인증 뒤 각 인가 지점에서 현재 역할·회수·버전·가족 수명을 다시 확인합니다. */
export async function validateMobileSession(input: { readonly sessionId: string; readonly expectedVersion: number }) {
  const parsed = z.object({ sessionId: z.uuid(), expectedVersion: z.number().int().nonnegative() }).safeParse(input);
  if (!parsed.success) return null;
  return findValidMobileSession(parsed.data);
}

/** 알 수 없거나 잘못된 토큰도 조용히 종료하여 존재 여부 열거를 막습니다. */
export async function revokeSessionByRefreshToken(raw: string): Promise<void> {
  if (isMobileToken(raw, "refresh")) await revokeByRefreshHash(hashMobileToken(raw));
}

/** 모바일 로그인만 회수하며 웹 로그인 버전은 바꾸지 않습니다. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  if (z.uuid().safeParse(userId).success) await revokeUserSessions(userId);
}

/** 호출자 오류로 한 번에 무제한 삭제하지 않도록 명시적 배치 상한을 둡니다. */
export async function purgeExpiredSessions(testNow: Date | undefined, limit: number): Promise<number> {
  if (!z.date().optional().safeParse(testNow).success || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return 0;
  return deleteExpiredSessions(testNow, limit);
}
