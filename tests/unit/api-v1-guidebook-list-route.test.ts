// @vitest-environment node
/**
 * 회원 가이드북 목록 API의 HTTP 인증·입력·오류·whitelist 응답 경계를 검증합니다.
 * 역할 철회와 SQL 정렬은 서비스 및 격리 PostgreSQL 테스트에서 별도로 확인합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/features/guidebooks/member-list/service", () => ({
  listGuidebooksForMember: mocks.list,
  GuidebookPaginationError: class GuidebookPaginationError extends Error {},
}));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { GET } from "@/app/api/v1/resources/guidebooks/route";
import { GuidebookPaginationError } from "@/features/guidebooks/member-list/service";

const userId = "11111111-1111-4111-8111-111111111111";
const guidebookId = "22222222-2222-4222-8222-222222222222";
const request = (query = "") => new Request(`https://qa.invalid/api/v1/resources/guidebooks${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.list.mockResolvedValue({ kind: "ok", totalCount: 1, items: [{
    id: guidebookId, title: "합성 안내서", fileUrl: "https://private.invalid/secret.pdf",
    fileName: "secret.pdf", createdAt: new Date("2026-10-23T01:02:03Z"),
  }] });
});

it("승인 회원은 Blob 정보를 제외한 ID·제목과 페이지 정보만 받는다", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(mocks.list).toHaveBeenCalledWith({
    principal: { userId, role: "MEMBER" }, page: 1, pageSize: 10,
  });
  const body = await response.json();
  expect(body).toEqual({
    guidebooks: [{ id: guidebookId, title: "합성 안내서" }],
    page: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1,
      hasNextPage: false, hasPreviousPage: false },
  });
  expect(JSON.stringify(body)).not.toMatch(/fileUrl|fileName|private\.invalid|createdAt/);
});

it("요청 페이지를 보존하며 범위 밖 결과는 빈 목록으로 반환한다", async () => {
  mocks.list.mockResolvedValueOnce({ kind: "ok", items: [], totalCount: 12 });
  const response = await GET(request("?page=4&pageSize=5"));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({
    principal: { userId, role: "MEMBER" }, page: 4, pageSize: 5,
  });
  expect(await response.json()).toEqual({
    guidebooks: [], page: { page: 4, pageSize: 5, totalCount: 12, totalPages: 3,
      hasNextPage: false, hasPreviousPage: true },
  });
});

it.each(["?page=1&page=2", "?q=안내", "?page=0", "?pageSize=51", "?page=9007199254740991&pageSize=50", "?page=2147483649"])(
  "잘못된 query %s는 인증·DB 전에 400으로 거부한다",
  async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  },
);

it("익명은 자료 저장소를 열지 않고 401로 거부한다", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  expect(mocks.list).not.toHaveBeenCalled();
});

it("현재 역할이 승인 대기이면 403을 반환한다", async () => {
  mocks.auth.mockResolvedValueOnce({ user: { id: userId, role: "PENDING" } });
  mocks.list.mockResolvedValueOnce({ kind: "forbidden" });
  const response = await GET(request());
  expect(response.status).toBe(403);
  expect((await response.json()).error.code).toBe("FORBIDDEN");
  expect(mocks.list).toHaveBeenCalledWith({
    principal: { userId, role: "PENDING" }, page: 1, pageSize: 10,
  });
});

it("삭제·역할 변경 계정은 401을 반환한다", async () => {
  mocks.list.mockResolvedValueOnce({ kind: "unauthenticated" });
  const response = await GET(request());
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
});

it("서비스 입력 오류는 400, 저장소 오류는 원문 없는 503으로 구분한다", async () => {
  mocks.list.mockRejectedValueOnce(new GuidebookPaginationError());
  const invalid = await GET(request());
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
  expect(mocks.log).not.toHaveBeenCalled();

  mocks.list.mockRejectedValueOnce(new Error("SELECT file_url FROM guidebooks WHERE token='private'"));
  const unavailable = await GET(request());
  expect(unavailable.status).toBe(503);
  const body = await unavailable.json();
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(body)).not.toMatch(/file_url|SELECT|private/);
  expect(mocks.log).toHaveBeenCalledOnce();
});
