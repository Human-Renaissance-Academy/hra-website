/**
 * 모바일 기기 등록/토큰 교체/로그아웃 시 해제 Application Service의 순수 경계 (#275).
 * 실제 인증 Principal을 검증하는 서버 어댑터와 암호화 DB 저장소가 연결되기 전에는
 * HTTP route 및 provider에서 호출하지 않습니다. userId는 요청 본문에서 받지 않습니다.
 */
import type { DevicePlatform } from "./service";

export type InstallationPrincipal = {
  /** #273에서 현재 DB 사용자/세션 버전을 재확인한 주체만 전달해야 합니다. */
  userId: string;
  role: string;
};

export type InstallationInput = {
  installationId: string;
  platform: DevicePlatform;
  pushToken: string;
  appVersion: string;
  /** 모바일에서 OS 알림 권한/사용자 동의를 확인한 뒤 true를 전달합니다. */
  consentGranted: boolean;
};

export type InstallationWriteResult =
  | "created" | "updated" | "unchanged" | "owner-mismatch" | "revoked";

export interface InstallationRegistry {
  /**
   * 반드시 원자적 DB 트랜잭션/UNIQUE 제약으로 소유자 고정과 token rotation을 구현합니다.
   * 다른 사용자에게 등록된 installation ID는 재할당하지 않고 owner-mismatch를 반환합니다.
   * revoke된 설치 ID는 자동 복구하지 않습니다. 새 OS 설치는 새 ID를 발급해야 합니다.
   * token은 검증된 서버 저장소에서 암호화하고 로그/오류/HTTP 응답에 남기지 않습니다.
   */
  upsertForOwner(input: {
    ownerUserId: string;
    installationId: string;
    platform: DevicePlatform;
    pushToken: string;
    appVersion: string;
    seenAt: Date;
  }): Promise<InstallationWriteResult>;
  /** ID+소유자 조건을 하나의 SQL UPDATE로 검사하고 반복 호출은 멱등하게 처리합니다. */
  revokeForOwner(input: { ownerUserId: string; installationId: string; revokedAt: Date }): Promise<void>;
}

export type InstallationActionResult =
  | "created" | "updated" | "unchanged" | "revoked" | "forbidden" | "invalid" | "unavailable";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\+[A-Za-z0-9.-]{1,40})?$/;
const VALID_ROLES = new Set(["ADMIN", "FACULTY", "MEMBER"]);

/** 별도 PENDING/로그인 안 된 사용자의 DB 접근을 시작하지 않습니다. */
export function canRegisterDevice(principal: InstallationPrincipal | null | undefined): boolean {
  return !!principal && UUID.test(principal.userId) && VALID_ROLES.has(principal.role);
}

/**
 * 플랫폼 사업자의 가변 토큰 문자열을 발급 형식에 결합하지 않는 최소 경계.
 * URL/공백/제어문자/비정상 크기 등은 거부하며 실제 provider 검증은 전송 adapter가 수행합니다.
 */
function validToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 16 && token.length <= 2048 &&
    /^[\x21-\x7e]+$/.test(token) && !token.includes("://");
}

function validInput(input: InstallationInput | null | undefined): input is InstallationInput {
  return !!input &&
    UUID.test(input.installationId) &&
    (input.platform === "ANDROID" || input.platform === "IOS") &&
    validToken(input.pushToken) &&
    typeof input.appVersion === "string" &&
    input.appVersion.length <= 60 &&
    APP_VERSION.test(input.appVersion);
}

function validNow(now: () => Date): Date | null {
  try {
    const value = now();
    return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
  } catch {
    return null;
  }
}

export async function registerDevice(input: {
  principal: InstallationPrincipal | null;
  installation: InstallationInput;
  registry: InstallationRegistry;
  now?: () => Date;
}): Promise<InstallationActionResult> {
  if (!canRegisterDevice(input?.principal)) return "forbidden";
  if (!input?.installation || !input.installation.consentGranted) return "forbidden";
  if (!validInput(input.installation)) return "invalid";
  if (!input.registry) return "unavailable";
  const seenAt = validNow(input.now ?? (() => new Date()));
  if (!seenAt) return "unavailable";

  try {
    const result = await input.registry.upsertForOwner({
      ownerUserId: input.principal!.userId,
      installationId: input.installation.installationId,
      platform: input.installation.platform,
      pushToken: input.installation.pushToken,
      appVersion: input.installation.appVersion,
      seenAt,
    });
    // DB 어댑터가 불명확한 결과를 돌려주면 성공으로 간주하지 않습니다.
    if (result === "owner-mismatch") return "forbidden";
    if (result === "revoked") return "revoked";
    if (result === "created" || result === "updated" || result === "unchanged") return result;
    return "unavailable";
  } catch {
    // 공급자·DB의 토큰/SQL/인증 정보 포함 원본 오류를 출력·반환하지 않습니다.
    return "unavailable";
  }
}

export async function unregisterDevice(input: {
  principal: InstallationPrincipal | null;
  installationId: string;
  registry: InstallationRegistry;
  now?: () => Date;
}): Promise<"revoked" | "forbidden" | "invalid" | "unavailable"> {
  if (!canRegisterDevice(input?.principal)) return "forbidden";
  if (!UUID.test(input.installationId)) return "invalid";
  if (!input.registry) return "unavailable";
  const revokedAt = validNow(input.now ?? (() => new Date()));
  if (!revokedAt) return "unavailable";
  try {
    await input.registry.revokeForOwner({
      ownerUserId: input.principal!.userId,
      installationId: input.installationId,
      revokedAt,
    });
    return "revoked";
  } catch {
    return "unavailable";
  }
}
