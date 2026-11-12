// @vitest-environment node
/** 모바일 정리 작업의 비밀 검증·배치 상한·장애 비노출 회귀입니다. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ purge: vi.fn(), log: vi.fn() }));
vi.mock("@/features/auth/mobile-session/service", () => ({ purgeExpiredSessions: mocks.purge }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { GET } from "@/app/api/cron/cleanup-mobile-sessions/route";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-cron-secret"); mocks.purge.mockResolvedValue(17); });
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "Basic synthetic", "Bearer wrong", "Bearer same-length-but-wrong"])("잘못된 cron 인증을 거부한다: %s", async (authorization) => {
  // Given / When
  const response = await GET(new Request("https://qa.invalid/api/cron/cleanup-mobile-sessions", { headers: authorization ? { authorization } : {} }));
  // Then
  expect(response.status).toBe(401); expect(mocks.purge).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("설정이 없으면 닫힌 503을 반환한다", async () => {
  // Given
  vi.stubEnv("CRON_SECRET", "");
  // When
  const response = await GET(new Request("https://qa.invalid/api/cron/cleanup-mobile-sessions"));
  // Then
  expect(response.status).toBe(503); expect(mocks.purge).not.toHaveBeenCalled();
});
it("인증되면 한 번에 1000행만 삭제한다", async () => {
  // Given / When
  const response = await GET(new Request("https://qa.invalid/api/cron/cleanup-mobile-sessions", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
  // Then
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ deletedCount: 17 });
  expect(mocks.purge).toHaveBeenCalledWith(undefined, 1000);
  expect(response.headers.has("set-cookie")).toBe(false);
});
it("정리 장애에서 비밀·오류 원문을 로그에 전달하지 않는다", async () => {
  // Given
  mocks.purge.mockRejectedValue(new Error("synthetic-cron-secret SQL private"));
  // When
  const response = await GET(new Request("https://qa.invalid/api/cron/cleanup-mobile-sessions", { headers: { authorization: "Bearer synthetic-cron-secret" } }));
  // Then
  expect(response.status).toBe(503);
  expect(JSON.stringify(mocks.log.mock.calls)).not.toMatch(/synthetic-cron-secret|SQL/);
});
