// @vitest-environment node
/**
 * 본인 프로필 API가 세션을 Route 안에서 확인하고 개인정보를 whitelist DTO로 제한합니다.
 * 무세션·삭제/변경 계정·입력 오류·저장소 오류가 고정 상태/문구로 끝나는지 검증합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { apiV1ErrorResponseSchema, apiV1MeResponseSchema } from "@hra/contracts/api-v1";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), profile: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/features/users/me/service", () => ({ getCurrentProfile: mocks.profile }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { GET } from "@/app/api/v1/me/route";

const id = "11111111-1111-4111-8111-111111111111";
const request = (query = "") => new Request(`https://qa.invalid/api/v1/me${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id, role: "PENDING" } });
  mocks.profile.mockResolvedValue({
    id, name: "합성 사용자", email: "kakao_123@oauth.placeholder", role: "PENDING",
    cohortId: null, image: null, passwordHash: "비공개", sessionVersion: 8,
    oauthProviderAccountId: "비공개",
  });
});

it("PENDING의 본인 프로필만 허용하고 내부 필드·placeholder 이메일은 제외한다", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(mocks.auth).toHaveBeenCalledOnce();
  expect(mocks.profile).toHaveBeenCalledWith({ userId: id, role: "PENDING" });

  const body = await response.json();
  expect(apiV1MeResponseSchema.parse(body)).toEqual(body);
  expect(body).toEqual({ user: {
    id, name: "합성 사용자", email: null, role: "PENDING", cohortId: null, imageUrl: null,
  } });
  expect(JSON.stringify(body)).not.toMatch(/passwordHash|sessionVersion|oauthProviderAccountId/);
});

it("세션이 없으면 프로필 DB를 열지 않고 401로 거부한다", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  const response = await GET(request());
  expect(response.status).toBe(401);
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("UNAUTHENTICATED");
  expect(body.error.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(mocks.profile).not.toHaveBeenCalled();
});

it("삭제되거나 역할이 바뀌어 현재 행과 맞지 않으면 401로 거부한다", async () => {
  mocks.profile.mockResolvedValueOnce(null);
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
});

it("지원하지 않는 query는 인증·DB 전에 400으로 거부한다", async () => {
  const response = await GET(request("?userId=22222222-2222-4222-8222-222222222222"));
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_INPUT");
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.profile).not.toHaveBeenCalled();
});

it("프로필 저장소 장애는 SQL·개인정보를 숨긴 503으로 처리한다", async () => {
  mocks.profile.mockRejectedValueOnce(new Error("SELECT password_hash FROM users WHERE email='비공개@example.invalid'"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(body)).not.toMatch(/SELECT|password_hash|example\.invalid/);
  expect(mocks.log).toHaveBeenCalledOnce();
});

it("Auth.js가 예외를 명시적으로 전파해도 원문 없는 503으로 끝난다", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("JWT database SELECT 비공개 값"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("UNAVAILABLE");
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.log).toHaveBeenCalledOnce();
});
