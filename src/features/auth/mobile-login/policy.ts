/**
 * 모바일 갱신 요청의 예산입니다. 정상 앱의 시간당 몇 회 갱신보다 충분히 큽니다.
 * IP는 공유 네트워크를 고려하고 세션 예산은 토큰 회전 후에도 유지합니다.
 */
export const MOBILE_REFRESH_IP_POLICY = { scope: "mobile-refresh-ip", maxAttempts: 120, windowSeconds: 900 } as const;
export const MOBILE_REFRESH_SESSION_POLICY = { scope: "mobile-refresh-session", maxAttempts: 12, windowSeconds: 900 } as const;
export const MOBILE_AUTH_BODY_LIMIT = 16 * 1024;
export const MOBILE_LOGIN_RETRY_SECONDS = 900;
