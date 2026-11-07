import { describe, expect, it, vi } from "vitest";
import {
  canRegisterDevice, registerDevice, unregisterDevice,
  type InstallationRegistry, type InstallationPrincipal,
  type InstallationInput, type InstallationWriteResult,
} from "@/features/notifications/installations";

const firstUser = "11111111-1111-4111-8111-111111111111";
const secondUser = "22222222-2222-4222-8222-222222222222";
const installationId = "33333333-3333-4333-8333-333333333333";
const at = new Date("2026-11-08T00:00:00.000Z");
const principal: InstallationPrincipal = { userId: firstUser, role: "MEMBER" };
const registered: InstallationInput = {
  installationId, platform: "ANDROID", pushToken: "ExpoPushToken[abcdefghijklmnop]",
  appVersion: "0.1.0", consentGranted: true,
};

/** 실제 DB 대신 원자 소유자 규칙을 모사합니다. 메모리 검증을 DB race 증거로 주장하지 않습니다. */
class FakeRegistry implements InstallationRegistry {
  records = new Map<string, {
    ownerUserId: string; platform: string; token: string; version: string; revoked: boolean;
  }>();
  writes = 0;
  revokes = 0;
  async upsertForOwner(input: {
    ownerUserId: string; installationId: string; platform: "ANDROID" | "IOS";
    pushToken: string; appVersion: string; seenAt: Date;
  }): Promise<InstallationWriteResult> {
    this.writes++;
    const old = this.records.get(input.installationId);
    if (old?.ownerUserId !== undefined && old.ownerUserId !== input.ownerUserId) return "owner-mismatch";
    if (old?.revoked) return "revoked";
    if (!old) {
      this.records.set(input.installationId, {
        ownerUserId: input.ownerUserId, platform: input.platform,
        token: input.pushToken, version: input.appVersion, revoked: false,
      });
      return "created";
    }
    if (old.token === input.pushToken && old.version === input.appVersion && old.platform === input.platform) {
      return "unchanged";
    }
    this.records.set(input.installationId, {
      ownerUserId: old.ownerUserId, platform: input.platform,
      token: input.pushToken, version: input.appVersion, revoked: false,
    });
    return "updated";
  }
  async revokeForOwner(input: { ownerUserId: string; installationId: string; revokedAt: Date }) {
    this.revokes++;
    const old = this.records.get(input.installationId);
    if (old?.ownerUserId === input.ownerUserId) old.revoked = true;
  }
}

const fixed = () => new Date(at.getTime());
const create = (registry: InstallationRegistry, overrides: Partial<InstallationInput> = {},
  user: InstallationPrincipal | null = principal) =>
  registerDevice({ principal: user, installation: { ...registered, ...overrides }, registry, now: fixed });

describe("모바일 기기 등록·토큰 회전·해제", () => {
  it("승인된 사용자만 자신의 기기를 등록하고 userId를 입력 본문에서 읽지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry)).toBe("created");
    expect(registry.records.get(installationId)).toMatchObject({ ownerUserId: firstUser, platform: "ANDROID" });
    expect(registry.writes).toBe(1);
    expect(await create(registry)).toBe("unchanged");
    expect(registry.writes).toBe(2);
  });

  it("같은 사용자·설치 ID의 토큰 회전과 버전 변경은 별도 등록으로 처리하지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry)).toBe("created");
    const token = "ExpoPushToken[qrstuvwxyzabcdef]";
    expect(await create(registry, { pushToken: token, appVersion: "0.2.0" })).toBe("updated");
    expect(registry.records.size).toBe(1);
    expect(registry.records.get(installationId)?.token).toBe(token);
  });

  it("Android와 iOS를 스키마/등록 정책 변경 없이 수용한다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry)).toBe("created");
    const iosId = "44444444-4444-4444-8444-444444444444";
    expect(await create(registry, { installationId: iosId, platform: "IOS" })).toBe("created");
    expect(registry.records.get(iosId)?.platform).toBe("IOS");
    expect(registry.records.size).toBe(2);
  });

  it("PENDING·미인증·손상된 계정 ID는 저장소 접근 이전에 차단한다", async () => {
    const registry = new FakeRegistry();
    for (const user of [null, { userId: firstUser, role: "PENDING" },
      { userId: "invalid", role: "MEMBER" }, { userId: firstUser, role: "UNKNOWN" }]) {
      expect(canRegisterDevice(user)).toBe(false);
      expect(await create(registry, {}, user)).toBe("forbidden");
    }
    expect(registry.writes).toBe(0);
  });

  it("알림 권한/동의가 확인되지 않으면 토큰을 저장하지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry, { consentGranted: false })).toBe("forbidden");
    expect(registry.writes).toBe(0);
  });

  it.each(["", "short", "https://private.example/token", "token with spaces",
    "x".repeat(2049), "secret\nvalue"])("손상된 기기 토큰을 거부한다", async pushToken => {
    const registry = new FakeRegistry();
    expect(await create(registry, { pushToken })).toBe("invalid");
    expect(registry.writes).toBe(0);
  });

  it("손상된 설치 ID·플랫폼·앱 버전도 저장소 접근 이전에 거부한다", async () => {
    const registry = new FakeRegistry();
    for (const overrides of [
      { installationId: "not-a-uuid" },
      { platform: "WINDOWS" as "ANDROID" },
      { appVersion: "a.b.c" },
      { appVersion: "1.0.0\nsecret" },
    ]) expect(await create(registry, overrides)).toBe("invalid");
    expect(registry.writes).toBe(0);
  });

  it("다른 사용자가 같은 installation ID를 주장해도 소유권을 넘겨주지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry)).toBe("created");
    expect(await create(registry, { pushToken: "ExpoPushToken[otheruserlongtoken]" },
      { userId: secondUser, role: "MEMBER" })).toBe("forbidden");
    expect(registry.records.get(installationId)?.ownerUserId).toBe(firstUser);
    expect(registry.records.get(installationId)?.token).toBe(registered.pushToken);
  });

  it("로그아웃 시 본인 것만 해제하고 재등록에도 이전 ID를 재활성화하지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await create(registry)).toBe("created");
    expect(await unregisterDevice({
      principal: { userId: secondUser, role: "MEMBER" }, installationId, registry, now: fixed,
    })).toBe("revoked");
    expect(registry.records.get(installationId)?.revoked).toBe(false);
    expect(await unregisterDevice({ principal, installationId, registry, now: fixed })).toBe("revoked");
    expect(await unregisterDevice({ principal, installationId, registry, now: fixed })).toBe("revoked");
    expect(registry.records.get(installationId)?.revoked).toBe(true);
    expect(await create(registry)).toBe("revoked");
  });

  it("해제는 미인증·손상 입력을 먼저 거부하고 기존 설치를 변경하지 않는다", async () => {
    const registry = new FakeRegistry();
    expect(await unregisterDevice({ principal: null, installationId, registry })).toBe("forbidden");
    expect(await unregisterDevice({ principal, installationId: "x", registry })).toBe("invalid");
    expect(registry.revokes).toBe(0);
  });

  it("DB 예외/알 수 없는 결과/시계 오류는 실패 코드만 돌려주고 토큰·SQL을 내보내지 않는다", async () => {
    const registry = new FakeRegistry();
    vi.spyOn(registry, "upsertForOwner").mockRejectedValueOnce(new Error("private-db-uri synthetic-secret-token"));
    expect(await create(registry)).toBe("unavailable");
    vi.spyOn(registry, "upsertForOwner").mockResolvedValueOnce("unsafe-result" as InstallationWriteResult);
    expect(await create(registry)).toBe("unavailable");
    expect(await registerDevice({
      principal, installation: registered, registry, now: () => new Date("invalid"),
    })).toBe("unavailable");
    vi.spyOn(registry, "revokeForOwner").mockRejectedValueOnce(new Error("SQL SECRET"));
    expect(await unregisterDevice({ principal, installationId, registry })).toBe("unavailable");
  });
});
