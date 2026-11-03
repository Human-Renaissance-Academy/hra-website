/** 모바일 세션 서비스의 프레임워크 독립 공개 타입입니다. DB 행·해시는 공개 결과에 포함하지 않습니다. */
import type { UserRole } from "@hra/contracts/identity";

export type MobileDevice = {
  readonly platform?: "ANDROID" | "IOS";
  readonly appVersion?: string;
  readonly deviceName?: string;
};

export type CreateMobileSessionInput = {
  readonly userId: string;
  readonly sessionVersion: number;
  readonly device?: MobileDevice;
  /** 격리 테스트 전용 결정 시각. 운영 호출자는 생략하여 잠금 후 DB 시계를 사용합니다. */
  readonly now?: Date;
};

export type MobilePrincipal = {
  readonly userId: string;
  readonly role: UserRole;
  readonly sessionVersion: number;
  readonly sessionId: string;
};

export type MobileSession = {
  readonly tokenType: "Bearer";
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
};

export const ROTATION_FAILURE_REASONS = [
  "INVALID", "EXPIRED", "REVOKED", "REUSE_DETECTED", "WITHIN_LEEWAY", "VERSION_MISMATCH", "THROTTLED",
] as const;
export type RotationFailureReason = typeof ROTATION_FAILURE_REASONS[number];
export type RotateRefreshTokenResult =
  | { readonly ok: true; readonly session: MobileSession }
  | { readonly ok: false; readonly reason: RotationFailureReason };

/** DB 드라이버 예외에 매개변수·해시가 포함될 수 있으므로 외부에는 고정 오류만 전달합니다. */
export class MobileSessionStorageError extends Error {
  constructor() { super("모바일 세션 저장소를 사용할 수 없습니다."); this.name = "MobileSessionStorageError"; }
}

/** 유효한 계정/버전이 아닌 발급 요청을 명시적으로 거부합니다. 원문 입력을 반사하지 않습니다. */
export class MobileSessionCreationError extends Error {
  constructor() { super("모바일 세션을 발급할 수 없습니다."); this.name = "MobileSessionCreationError"; }
}
