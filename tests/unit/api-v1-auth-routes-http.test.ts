// @vitest-environment node
/** 모바일 HTTP 계약의 입력 제한·상태·캐시·쿠키 비사용 경계를 검증합니다. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import openapi from "../../packages/contracts/openapi.json";
import { apiV1ErrorResponseSchema, apiV1MobileLoginResponseSchema, apiV1MobileRefreshResponseSchema, apiV1MobileRateLimitedErrorSchema } from "@hra/contracts/api-v1";
const mocks = vi.hoisted(() => ({ login: vi.fn(), refresh: vi.fn(), revoke: vi.fn(), revokeAll: vi.fn(), bearer: vi.fn(), log: vi.fn() }));
vi.mock("@/features/auth/mobile-login/service", () => ({ loginWithPassword: mocks.login, refreshMobileSession: mocks.refresh,
  logoutMobileSession: (input: { refreshToken: string }) => mocks.revoke(input.refreshToken) }));
vi.mock("@/features/auth/mobile-session/service", () => ({ revokeSessionByRefreshToken: mocks.revoke, revokeAllSessionsForUser: mocks.revokeAll }));
vi.mock("@/lib/api-v1-principal", async (original) => ({ ...await original<object>(), resolveBearer: mocks.bearer }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("@/lib/auth", () => { throw new Error("모바일 경로에서 쿠키 인증을 import하면 안 됩니다."); });
vi.mock("next/headers", () => { throw new Error("모바일 경로에서 쿠키를 읽으면 안 됩니다."); });
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as refresh } from "@/app/api/v1/auth/refresh/route";
import { POST as logout } from "@/app/api/v1/auth/logout/route";
import { POST as logoutAll } from "@/app/api/v1/auth/logout-all/route";
import { MobileAuthError } from "@/features/auth/mobile-login/errors";
import { MobileSessionStorageError } from "@/features/auth/mobile-session/types";
const id = "11111111-1111-4111-8111-111111111111";
const session = { tokenType: "Bearer", accessToken: "synthetic-access", refreshToken: "synthetic-refresh", accessTokenExpiresAt: "2026-10-31T12:15:00.000Z", refreshTokenExpiresAt: "2026-11-30T12:00:00.000Z" };
const user = { id, name: "합성", email: null, role: "PENDING", cohortId: null, imageUrl: null };
const request = (body?: string, contentType = "application/json", query = "") => new Request(`https://qa.invalid/api/v1/auth/test${query}`, { method: "POST", headers: { "content-type": contentType, cookie: "synthetic-cookie" }, ...(body === undefined ? {} : { body }) });
function assertPrivate(response: Response, protectedResponse = false) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  if (protectedResponse) expect(response.headers.get("vary")?.toLowerCase().split(",").map(value => value.trim())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  else expect(response.headers.get("vary")).toBe("Authorization");
  expect(response.headers.has("set-cookie")).toBe(false);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.login.mockResolvedValue({ session, user });
  mocks.refresh.mockResolvedValue({ session });
  mocks.bearer.mockResolvedValue({ kind: "VALID", principal: { userId: id } });
});
afterEach(() => { vi.useRealTimers(); });

it("logout-all은 끝나지 않는 본문과 취소를 기다리지 않고 기한에 400을 반환한다", async () => {
  // Given: 바이트도 EOF도 없고 취소도 끝나지 않는 공급자
  vi.useFakeTimers();
  const body = new ReadableStream<Uint8Array>({ cancel: () => new Promise<void>(() => undefined) });
  const init = { method: "POST", body, duplex: "half" };
  const input = new Request("https://qa.invalid/api/v1/auth/logout-all", init);
  // When: 애플리케이션 기한을 넘긴다.
  const pending = logoutAll(input);
  await vi.advanceTimersByTimeAsync(3_001);
  // Then: 취소 완료와 무관하게 잘못된 입력으로 종료한다.
  const response = await pending;
  expect(response.status).toBe(400);
  expect(mocks.revokeAll).not.toHaveBeenCalled();
});

it("logout-all은 취소가 거부되어도 첫 바이트의 400을 보존한다", async () => {
  // Given: 첫 바이트 뒤 취소가 거부되는 공급자
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array([1])); },
    cancel() { return Promise.reject(new Error("합성 취소 실패")); },
  });
  // When
  const init = { method: "POST", body, duplex: "half" };
  const response = await logoutAll(new Request("https://qa.invalid/api/v1/auth/logout-all", init));
  // Then: 정리 실패가 일반 503으로 바뀌지 않는다.
  expect(response.status).toBe(400);
  expect(mocks.revokeAll).not.toHaveBeenCalled();
});
it.each([[login, { email: "person@example.invalid", password: "합성" }, apiV1MobileLoginResponseSchema], [refresh, { refreshToken: "synthetic" }, apiV1MobileRefreshResponseSchema]] as const)("Origin 없이 계약 성공 응답을 반환한다", async (route, input, schema) => {
  // Given / When
  const response = await route(request(JSON.stringify(input)));
  // Then
  expect(response.status).toBe(200);
  assertPrivate(response);
  const body: unknown = await response.json();
  expect(schema.safeParse(body).success).toBe(true);
});
for (const route of [login, refresh, logout]) {
  it.each([[undefined, "application/json", "", 400], ["{}", "text/plain", "", 400], ["{", "application/json", "", 400], ["{}", "application/json", "?extra=1", 400], ["{}", "application/json", "", 400], [" ".repeat(16385), "application/json", "", 413]] as const)("잘못된 입력을 제한된 계약 상태로 거부한다: %s %s %s %s", async (body, media, query, status) => {
    // Given / When
    const response = await route(request(body, media, query));
    // Then
    expect(response.status).toBe(status);
    assertPrivate(response);
    expect(apiV1ErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
  });
}
it.each([login, refresh])("정책 제한은 Retry-After와 계약 429를 반환한다", async (route) => {
  // Given
  mocks.login.mockRejectedValue(new MobileAuthError("RATE_LIMITED", 900));
  mocks.refresh.mockRejectedValue(new MobileAuthError("RATE_LIMITED", 900));
  // When
  const response = await route(request(JSON.stringify(route === login ? { email: "person@example.invalid", password: "합성" } : { refreshToken: "synthetic" })));
  // Then
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("900");
  assertPrivate(response);
  expect(apiV1MobileRateLimitedErrorSchema.safeParse(await response.json()).success).toBe(true);
});
it.each([login, refresh])("인증 실패는 일반 401만 반환한다", async (route) => {
  // Given
  mocks.login.mockRejectedValue(new MobileAuthError("UNAUTHENTICATED"));
  mocks.refresh.mockRejectedValue(new MobileAuthError("UNAUTHENTICATED"));
  // When
  const response = await route(request(JSON.stringify(route === login ? { email: "person@example.invalid", password: "합성" } : { refreshToken: "synthetic" })));
  // Then
  expect(response.status).toBe(401);
  assertPrivate(response);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
});
it.each([login, refresh, logout, logoutAll])("저장소 예외는 비밀 없는 503으로 처리한다", async (route) => {
  // Given
  const secretError = new Error("password synthetic-refresh Authorization SQL private");
  mocks.login.mockRejectedValue(secretError); mocks.refresh.mockRejectedValue(secretError);
  mocks.revoke.mockRejectedValue(new MobileSessionStorageError()); mocks.revokeAll.mockRejectedValue(secretError);
  // When
  const response = await route(request(route === logoutAll ? undefined : JSON.stringify(route === login ? { email: "person@example.invalid", password: "합성" } : { refreshToken: "synthetic" })));
  // Then
  expect(response.status).toBe(503);
  assertPrivate(response, route === logoutAll);
  expect((await response.json()).error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(mocks.log.mock.calls)).not.toMatch(/password|synthetic-refresh|Authorization|SQL/);
});
it("알 수 없는 토큰도 반복 로그아웃은 204다", async () => {
  // Given / When
  const responses = await Promise.all([logout(request('{"refreshToken":"unknown"}')), logout(request('{"refreshToken":"unknown"}'))]);
  // Then
  for (const response of responses) { expect(response.status).toBe(204); expect(await response.text()).toBe(""); assertPrivate(response); }
});
it.each(["NO_BEARER", "INVALID_BEARER"])("logout-all은 %s에서 쿠키로 대체하지 않는다", async (kind) => {
  // Given
  mocks.bearer.mockResolvedValue({ kind });
  // When
  const response = await logoutAll(request());
  // Then
  expect(response.status).toBe(401); assertPrivate(response, true);
  expect(mocks.revokeAll).not.toHaveBeenCalled();
});
it("logout-all은 검증된 사용자의 모바일 세션만 회수한다", async () => {
  // Given / When
  const response = await logoutAll(request());
  // Then
  expect(response.status).toBe(204); assertPrivate(response, true);
  expect(mocks.revokeAll).toHaveBeenCalledWith(id);
});
it.each([["{}", ""], ["x", ""], [undefined, "?extra=1"]] as const)("logout-all은 실제 본문 바이트와 query를 거부한다", async (body, query) => {
  // Given / When
  const response = await logoutAll(request(body, "application/json", query));
  // Then
  expect(response.status).toBe(400); assertPrivate(response, true);
  expect(mocks.bearer).not.toHaveBeenCalled();
});

it("logout-all은 Node 어댑터처럼 비어 있지만 non-null인 스트림을 허용한다", async () => {
  // Given
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array()); controller.close(); } });
  const init = { method: "POST", body, duplex: "half" };
  const input = new Request("https://qa.invalid/api/v1/auth/logout-all", init);
  expect(input.body).not.toBeNull();
  // When
  const response = await logoutAll(input);
  // Then
  expect(response.status).toBe(204);
  expect(mocks.revokeAll).toHaveBeenCalledWith(id);
});

it.each([204, 400, 401, 503])("logout-all %s의 런타임 헤더가 OpenAPI 계약을 만족한다", async status => {
  // Given
  if (status === 401) mocks.bearer.mockResolvedValue({ kind: "INVALID_BEARER" });
  if (status === 503) mocks.revokeAll.mockRejectedValue(new MobileSessionStorageError());
  // When
  const response = await logoutAll(request(status === 400 ? "x" : undefined));
  // Then
  expect(response.status).toBe(status);
  for (const contract of Object.values(openapi.paths["/api/v1/auth/logout-all"].post.responses)) {
    expect(response.headers.get("Cache-Control")).toBe(contract.headers["Cache-Control"].schema.const);
    const required = contract.headers.Vary.schema.const.toLowerCase().split(", ");
    expect(response.headers.get("Vary")?.toLowerCase().split(", ")).toEqual(expect.arrayContaining(required));
  }
});
