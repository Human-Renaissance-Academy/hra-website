/**
 * Android·iOS 공용 푸시 전송 계약 (#275).
 * 이 모듈은 DB·HTTP·Expo/FCM/APNs SDK를 import하지 않고, 실제 발송은 어댑터가 담당합니다.
 * 업무 트랜잭션 완료 이벤트만 이 서비스에 전달하며 제출/공개 성공을 push 결과에 종속시키지 않습니다.
 */

export type DevicePlatform = "ANDROID" | "IOS";

export type DeviceInstallation = {
  id: string;
  userId: string;
  platform: DevicePlatform;
  /** 서버 저장소와 전송 어댑터에서만 취급하며 로그·메트릭·오류 출력에 포함하지 않습니다. */
  pushToken: string;
  appVersion: string | null;
  lastSeenAt: Date;
  revokedAt: Date | null;
};

export type NotificationKind = "ASSIGNMENT_PUBLISHED" | "ASSIGNMENT_DUE_SOON";

/** 실제 과제 내용이나 제출자 개인정보를 이벤트에 복제하지 않습니다. */
export type NotificationEvent = {
  id: string;
  userId: string;
  assignmentId: string;
  kind: NotificationKind;
};

export type DeliveryClaim =
  | { kind: "claimed"; attempt: number }
  | { kind: "sent" | "busy" | "exhausted" };

export interface NotificationDeliveryStore {
  /**
   * DB의 고유키(eventId, installationId)와 atomic lease로 하나의 worker만 claim해야 합니다.
   * 시도 횟수는 성공하지 않은 claim까지 포함해 영속 저장해야 하며 이미 전송되면 sent를 반환합니다.
   * 여기서 구현한 순수 서비스는 adapter의 DB 원자성을 대신 보증하지 않습니다.
   */
  claim(key: string, limit: number): Promise<DeliveryClaim>;
  markSent(key: string): Promise<void>;
  /** retryAt 이전에 재claim을 허용하지 않습니다. */
  defer(key: string, retryAt: Date): Promise<void>;
  /** 영구 실패 또는 최대 횟수 초과. 같은 이벤트의 자동 재전송을 차단합니다. */
  markTerminal(key: string): Promise<void>;
  /** 디바이스 ID만 받아 등록을 해제합니다. push token 원문을 로그에 포함하지 않습니다. */
  revokeInstallation(installationId: string): Promise<void>;
}

export type ProviderSendResult = "sent" | "invalid-token" | "transient-failure" | "permanent-failure";

export interface NotificationProvider {
  send(request: {
    platform: DevicePlatform;
    token: string;
    title: string;
    body: string;
    /** 공급자가 지원하면 이 키를 중복 전송 방지 키로 전달합니다. */
    idempotencyKey: string;
  }): Promise<ProviderSendResult>;
}

export type NotificationDispatchSummary = {
  sent: number;
  deferred: number;
  invalidTokens: number;
  terminal: number;
  skipped: number;
  failures: number;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxAttempts = 3;
const backoffMs = [60_000, 300_000] as const;

function message(kind: NotificationKind): { title: string; body: string } {
  if (kind === "ASSIGNMENT_PUBLISHED") {
    return { title: "HRA 과제 안내", body: "새 과제가 공개되었습니다. 앱에서 확인해 주세요." };
  }
  return { title: "HRA 과제 알림", body: "과제 제출 마감이 가까워졌습니다. 앱에서 확인해 주세요." };
}

function validateEvent(event: NotificationEvent): void {
  if (!event || !uuid.test(event.id) || !uuid.test(event.userId) ||
    !uuid.test(event.assignmentId) ||
    !["ASSIGNMENT_PUBLISHED", "ASSIGNMENT_DUE_SOON"].includes(event.kind)) {
    throw new Error("NOTIFICATION_EVENT_INVALID");
  }
}

/**
 * 이미 커밋한 application event를 디바이스 단위로 전송합니다.
 * 공개 API, UI, 사용자 입력에서는 직접 호출하지 않습니다. 저장소 장애 시 발송하지 않습니다.
 * 결과 요약은 정수만 반환하며 토큰·개인정보·공급자 오류 메시지를 절대 반환하지 않습니다.
 */
export async function dispatchNotification(input: {
  event: NotificationEvent;
  installations: readonly DeviceInstallation[];
  store: NotificationDeliveryStore;
  provider: NotificationProvider;
  now?: () => Date;
}): Promise<NotificationDispatchSummary> {
  const { event, installations, store, provider, now = () => new Date() } = input;
  validateEvent(event);
  if (!Array.isArray(installations) || !store || !provider) {
    throw new Error("NOTIFICATION_INPUT_INVALID");
  }
  const summary: NotificationDispatchSummary = {
    sent: 0, deferred: 0, invalidTokens: 0, terminal: 0, skipped: 0, failures: 0,
  };
  const seenInstallations = new Set<string>();
  const notification = message(event.kind);
  for (const installation of installations) {
    if (!installation || !uuid.test(installation.id) ||
      installation.userId !== event.userId ||
      !["ANDROID", "IOS"].includes(installation.platform) ||
      typeof installation.pushToken !== "string" ||
      installation.pushToken.length < 1 || installation.pushToken.length > 2048 ||
      installation.revokedAt !== null || seenInstallations.has(installation.id)) {
      summary.skipped++;
      continue;
    }
    seenInstallations.add(installation.id);
    // URL·시크릿·사용자 입력 없이 UUID 두 개만 사용하므로 결과/로그에 push token이 포함되지 않습니다.
    const key = event.id + ":" + installation.id;
    let claim: DeliveryClaim;
    try {
      claim = await store.claim(key, maxAttempts);
    } catch {
      summary.failures++;
      continue;
    }
    if (claim.kind !== "claimed") {
      summary.skipped++;
      continue;
    }
    if (!Number.isSafeInteger(claim.attempt) || claim.attempt < 1 ||
      claim.attempt > maxAttempts) {
      summary.failures++;
      // 손상된 claim 상태에서 발송하거나 재시도하지 않습니다.
      continue;
    }
    let result: ProviderSendResult;
    try {
      result = await provider.send({
        platform: installation.platform,
        token: installation.pushToken,
        ...notification,
        idempotencyKey: key,
      });
    } catch {
      // 공급자 에러 message·stack·request 전체를 로그로 보내지 않습니다.
      result = "transient-failure";
    }
    try {
      if (result === "sent") {
        await store.markSent(key);
        summary.sent++;
      } else if (result === "invalid-token") {
        await store.revokeInstallation(installation.id);
        await store.markTerminal(key);
        summary.invalidTokens++;
      } else if (result === "permanent-failure" || claim.attempt === maxAttempts) {
        await store.markTerminal(key);
        summary.terminal++;
      } else if (result === "transient-failure") {
        const current = now();
        if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
          throw new Error("NOTIFICATION_CLOCK_INVALID");
        }
        await store.defer(key, new Date(current.getTime() + backoffMs[claim.attempt - 1]));
        summary.deferred++;
      } else {
        // 알려지지 않은 공급자 결과도 전송 성공으로 간주하지 않습니다.
        await store.markTerminal(key);
        summary.terminal++;
      }
    } catch {
      // 영속 기록 실패는 성공으로 오인하지 않습니다. 외부 provider의 중복 전송 가능성은 문서에 명시합니다.
      summary.failures++;
    }
  }
  return summary;
}
