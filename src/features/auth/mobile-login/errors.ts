/**
 * 모바일 인증 정책의 공개 오류입니다.
 * 원본 요청·드라이버 오류를 보관하지 않고 계약 코드와 제한 시간만 전달합니다.
 */
import "server-only";

export class MobileAuthError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "TOO_LARGE" | "UNAUTHENTICATED" | "RATE_LIMITED" | "UNAVAILABLE",
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "MobileAuthError";
  }
}
