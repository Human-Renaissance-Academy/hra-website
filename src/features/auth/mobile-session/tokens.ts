/**
 * 모바일 전용 불투명 토큰 생성·형식 검사·단방향 해시 도구입니다.
 * 접근/갱신 도메인을 접두어로 분리하고 원문 비교나 기록을 하지 않습니다.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const REFRESH_REUSE_LEEWAY_MS = 10 * 1000;
export const LAST_USED_INTERVAL_MS = 60 * 1000;

/** 256비트 난수에 용도별 접두어를 붙입니다. 호출자는 성공 발급 응답에만 원문을 사용합니다. */
export function generateMobileToken(kind: "access" | "refresh"): string {
  return `${kind === "access" ? "hra_at_" : "hra_rt_"}${randomBytes(32).toString("base64url")}`;
}

/** 해시 전 최대 길이와 정규 형식을 제한하여 임의 크기 입력의 CPU/DB 낭비를 막습니다. */
export function isMobileToken(raw: string, kind: "access" | "refresh"): boolean {
  return typeof raw === "string" && raw.length === 50 && (kind === "access"
    ? /^hra_at_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/
    : /^hra_rt_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/).test(raw);
}

/** SQL에는 이 해시만 넘깁니다. 고엔트로피 토큰이므로 비밀번호용 느린 해시는 필요 없습니다. */
export function hashMobileToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
