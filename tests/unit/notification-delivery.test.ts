import { describe, expect, it, vi } from "vitest";
import {
  dispatchNotification,
  type DeliveryClaim,
  type DeviceInstallation,
  type NotificationDeliveryStore,
  type NotificationEvent,
  type NotificationProvider,
  type ProviderSendResult,
} from "@/features/notifications/service";

const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const assignmentId = "44444444-4444-4444-8444-444444444444";
const androidId = "55555555-5555-4555-8555-555555555555";
const iosId = "66666666-6666-4666-8666-666666666666";
const event: NotificationEvent = {
  id: eventId,
  userId,
  assignmentId,
  kind: "ASSIGNMENT_PUBLISHED",
};

const device = (platform: "ANDROID" | "IOS", id = androidId): DeviceInstallation => ({
  id,
  userId,
  platform,
  pushToken: platform === "ANDROID" ? "synthetic-android-token" : "synthetic-ios-token",
  appVersion: "0.1.0",
  lastSeenAt: new Date("2026-11-08T00:00:00Z"),
  revokedAt: null,
});

class MemoryDeliveryStore implements NotificationDeliveryStore {
  readonly state = new Map<
    string,
    { status: "claimed" | "deferred" | "sent" | "terminal"; attempt: number; retryAt?: Date }
  >();
  readonly revoked: string[] = [];
  readonly claims: string[] = [];
  constructor(readNow: () => Date = () => new Date("2026-11-08T00:00:00Z")) {
    this.readNow = readNow;
  }
  private readonly readNow: () => Date;
  async claim(key: string, limit: number): Promise<DeliveryClaim> {
    this.claims.push(key);
    const existing = this.state.get(key);
    if (existing?.status === "sent") return { kind: "sent" };
    if (existing?.status === "terminal" || (existing && existing.attempt >= limit))
      return { kind: "exhausted" };
    if (
      existing?.status === "claimed" ||
      (existing?.retryAt && this.readNow().getTime() < existing.retryAt.getTime())
    )
      return { kind: "busy" };
    const attempt = (existing?.attempt ?? 0) + 1;
    this.state.set(key, { status: "claimed", attempt });
    return { kind: "claimed", attempt };
  }
  async markSent(key: string) {
    const state = this.state.get(key);
    if (!state) throw new Error("missing claim");
    state.status = "sent";
  }
  async defer(key: string, retryAt: Date) {
    const state = this.state.get(key);
    if (!state) throw new Error("missing claim");
    state.status = "deferred";
    state.retryAt = retryAt;
  }
  async markTerminal(key: string) {
    const state = this.state.get(key);
    if (!state) throw new Error("missing claim");
    state.status = "terminal";
  }
  async revokeInstallation(installationId: string) {
    this.revoked.push(installationId);
  }
}

function setup(result: ProviderSendResult = "sent", date = new Date("2026-11-08T00:00:00Z")) {
  let currentDate = date;
  const store = new MemoryDeliveryStore(() => currentDate);
  const provider: NotificationProvider = { send: vi.fn(async () => result) };
  return {
    store,
    provider,
    setDate: (next: Date) => {
      currentDate = next;
    },
    run: (installations: DeviceInstallation[] = [device("ANDROID")], chosenEvent = event) =>
      dispatchNotification({
        event: chosenEvent,
        installations,
        store,
        provider,
        now: () => currentDate,
      }),
  };
}

describe("Android/iOS 공용 알림 전송 계약", () => {
  it("동일 이벤트를 Android와 iOS의 서로 다른 설치로 전송한다", async () => {
    const { store, provider, run } = setup();
    const result = await run([device("ANDROID"), device("IOS", iosId)]);
    expect(result).toEqual({
      sent: 2,
      deferred: 0,
      invalidTokens: 0,
      terminal: 0,
      skipped: 0,
      failures: 0,
    });
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "ANDROID",
        idempotencyKey: eventId + ":" + androidId,
        title: "HRA 과제 안내",
      }),
    );
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "IOS",
        idempotencyKey: eventId + ":" + iosId,
      }),
    );
    expect(store.state.size).toBe(2);
    expect(JSON.stringify(result)).not.toContain("synthetic-");
  });

  it("동일 기기를 중복 입력하거나 이미 보낸 이벤트를 재실행해도 다시 보내지 않는다", async () => {
    const { provider, run } = setup();
    expect((await run([device("ANDROID"), device("ANDROID")])).skipped).toBe(1);
    expect((await run()).skipped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("타 사용자·해제된 설치·잘못된 토큰과 플랫폼은 provider 호출 이전에 걸러진다", async () => {
    const { provider, store, run } = setup();
    const unrelated = { ...device("IOS", iosId), userId: otherId };
    const revoked = { ...device("ANDROID"), revokedAt: new Date("2026-11-01T00:00:00Z") };
    const missingToken = { ...device("ANDROID"), pushToken: "" };
    const invalidPlatform = { ...device("ANDROID"), platform: "WINDOWS" as "ANDROID" };
    const result = await run([unrelated, revoked, missingToken, invalidPlatform]);
    expect(result.skipped).toBe(4);
    expect(provider.send).not.toHaveBeenCalled();
    expect(store.claims).toEqual([]);
  });

  it("과제 공개와 마감 안내 모두 정해진 한국어 텍스트만 전달한다", async () => {
    const { provider, run } = setup();
    await run(undefined, { ...event, kind: "ASSIGNMENT_DUE_SOON" });
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "HRA 과제 알림",
        body: "과제 제출 마감이 가까워졌습니다. 앱에서 확인해 주세요.",
      }),
    );
  });

  it("영구 invalid token은 설치 ID로만 해제하고 전송 완료와 혼동하지 않는다", async () => {
    const { provider, store, run } = setup("invalid-token");
    const result = await run();
    expect(result.invalidTokens).toBe(1);
    expect(result.sent).toBe(0);
    expect(store.revoked).toEqual([androidId]);
    expect(store.state.get(eventId + ":" + androidId)?.status).toBe("terminal");
    expect((await run()).skipped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("토큰 해제 DB가 실패해도 영구 invalid 전송 기록은 terminal로 확정해 재발송을 차단", async () => {
    const { store, provider, run } = setup("invalid-token");
    vi.spyOn(store, "revokeInstallation").mockRejectedValueOnce(
      new Error("synthetic-private-token-in-error"),
    );
    const result = await run();
    expect(result).toMatchObject({ failures: 1, invalidTokens: 0, sent: 0 });
    expect(store.state.get(eventId + ":" + androidId)?.status).toBe("terminal");
    expect((await run()).skipped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("synthetic-private-token");
  });

  it("invalid token 종료 기록 실패는 발송 성공으로 처리하지 않고 실패를 보고", async () => {
    const { store, provider, run } = setup("invalid-token");
    vi.spyOn(store, "markTerminal").mockRejectedValueOnce(new Error("synthetic-DB-secret"));
    const result = await run();
    expect(result).toMatchObject({ failures: 1, invalidTokens: 0, sent: 0 });
    expect(store.revoked).toEqual([androidId]);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("synthetic-DB-secret");
  });

  it("일시 장애는 1분, 5분으로 재시도하고 세 번째 뒤 영구 종료한다", async () => {
    const start = new Date("2026-11-08T00:00:00Z");
    const { provider, store, run, setDate } = setup("transient-failure", start);
    expect((await run()).deferred).toBe(1);
    expect(store.state.get(eventId + ":" + androidId)?.retryAt?.toISOString()).toBe(
      "2026-11-08T00:01:00.000Z",
    );
    expect((await run()).skipped).toBe(1);
    setDate(new Date("2026-11-08T00:01:00Z"));
    expect((await run()).deferred).toBe(1);
    expect(store.state.get(eventId + ":" + androidId)?.retryAt?.toISOString()).toBe(
      "2026-11-08T00:06:00.000Z",
    );
    setDate(new Date("2026-11-08T00:06:00Z"));
    expect((await run()).terminal).toBe(1);
    expect((await run()).skipped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(3);
  });

  it("공급자 예외 원문을 사용자와 저장소 로그로 전달하지 않고 재시도한다", async () => {
    const { provider, run } = setup();
    vi.mocked(provider.send).mockRejectedValue(new Error("synthetic-SECRET-TOKEN"));
    const result = await run();
    expect(result.deferred).toBe(1);
    expect(result.failures).toBe(0);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("영구 오류는 재시도하지 않고 terminal 처리한다", async () => {
    const { provider, run } = setup("permanent-failure");
    expect((await run()).terminal).toBe(1);
    expect((await run()).skipped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("claim 저장소 장애 또는 손상 시도 횟수에서는 provider를 호출하지 않는다", async () => {
    const { store, provider, run } = setup();
    vi.spyOn(store, "claim").mockRejectedValueOnce(new Error("secret-storage-url"));
    expect((await run()).failures).toBe(1);
    vi.spyOn(store, "claim").mockResolvedValueOnce({ kind: "claimed", attempt: 99 });
    expect((await run()).failures).toBe(1);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("발송 성공 후 DB 확인 저장 실패를 거짓 성공으로 집계하지 않는다", async () => {
    const { store, provider, run } = setup();
    vi.spyOn(store, "markSent").mockRejectedValueOnce(new Error("synthetic-db-error"));
    expect((await run()).failures).toBe(1);
    expect((await run()).sent).toBe(0);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("잘못된 이벤트 UUID·지원하지 않는 이벤트 종류를 전송 전에 거부한다", async () => {
    const { provider, run } = setup();
    await expect(run(undefined, { ...event, userId: "unsafe-id" })).rejects.toThrow(
      "NOTIFICATION_EVENT_INVALID",
    );
    await expect(
      run(undefined, { ...event, kind: "USER_MESSAGE" as "ASSIGNMENT_PUBLISHED" }),
    ).rejects.toThrow("NOTIFICATION_EVENT_INVALID");
    expect(provider.send).not.toHaveBeenCalled();
  });
});
