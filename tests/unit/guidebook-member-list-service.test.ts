/**
 * 승인 회원 가이드북 서비스의 역할·페이지·응답 필드 경계를 저장소 mock으로 검증합니다.
 * 잘못된 입력과 권한 거부가 목록 DB 접근 전에 끝나는지 확인합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  countGuidebooks: vi.fn(),
  listGuidebooks: vi.fn(),
}));

vi.mock("@/features/users/me/service", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
// 사용자별 자료 조회 빈도 제한(#444)은 이 파일의 관심사가 아니므로 항상 허용합니다. 제한 동작은 resource-read-limit 테스트가 검증합니다.
vi.mock("@/lib/rate-limit", () => ({
  reserveResourceRead: async () => ({ blocked: false, retryAfterSec: 0, reservationId: null }),
}));
vi.mock("@/features/guidebooks/member-list/repository", () => ({
  countGuidebooks: mocks.countGuidebooks,
  listGuidebooks: mocks.listGuidebooks,
}));

import {
  GuidebookPaginationError,
  listGuidebooksForMember,
} from "@/features/guidebooks/member-list/service";

const principal = { userId: "11111111-1111-1111-1111-111111111111", role: "MEMBER" as const };

beforeEach(() => vi.resetAllMocks());

it.each([
  { page: 0, pageSize: 10 },
  { page: 1.5, pageSize: 10 },
  { page: 1, pageSize: 0 },
  { page: 1, pageSize: 51 },
  { page: 42_949_675, pageSize: 50 },
])("잘못된 page=$page/pageSize=$pageSize는 프로필·가이드북 DB 접근 전에 거부한다", async ({ page, pageSize }) => {
  await expect(listGuidebooksForMember({ principal, page, pageSize })).rejects.toBeInstanceOf(GuidebookPaginationError);
  expect(mocks.getCurrentProfile).not.toHaveBeenCalled();
  expect(mocks.countGuidebooks).not.toHaveBeenCalled();
  expect(mocks.listGuidebooks).not.toHaveBeenCalled();
});

it("삭제·역할 변경으로 현재 프로필이 없으면 자료 행을 조회하지 않는다", async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);
  expect(await listGuidebooksForMember({ principal, page: 1, pageSize: 10 })).toEqual({ kind: "unauthenticated" });
  expect(mocks.countGuidebooks).not.toHaveBeenCalled();
  expect(mocks.listGuidebooks).not.toHaveBeenCalled();
});

it("현재 역할이 PENDING이면 가이드북 접근을 거부한다", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id: principal.userId, role: "PENDING" });
  expect(await listGuidebooksForMember({ principal, page: 1, pageSize: 10 })).toEqual({ kind: "forbidden" });
  expect(mocks.countGuidebooks).not.toHaveBeenCalled();
  expect(mocks.listGuidebooks).not.toHaveBeenCalled();
});

it.each(["ADMIN", "FACULTY", "MEMBER"] as const)("승인된 %s는 파일 경로 없는 목록만 받는다", async (role) => {
  mocks.getCurrentProfile.mockResolvedValue({ id: principal.userId, role });
  mocks.countGuidebooks.mockResolvedValue(2);
  mocks.listGuidebooks.mockResolvedValue([{
    id: "22222222-2222-2222-2222-222222222222", title: "합성 가이드북",
    createdAt: new Date(), fileUrl: "private://must-not-return", fileName: "secret.pdf",
  }]);

  const result = await listGuidebooksForMember({ principal: { ...principal, role }, page: 1, pageSize: 10 });
  expect(result).toEqual({ kind: "ok", totalCount: 2, items: [{
    id: "22222222-2222-2222-2222-222222222222", title: "합성 가이드북",
  }] });
  expect(mocks.listGuidebooks).toHaveBeenCalledWith(10, 0);
});

it("범위 밖 페이지는 전체 건수만 돌려주고 목록 쿼리를 실행하지 않는다", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id: principal.userId, role: "MEMBER" });
  mocks.countGuidebooks.mockResolvedValue(2);
  expect(await listGuidebooksForMember({ principal, page: 9, pageSize: 10 })).toEqual({
    kind: "ok", items: [], totalCount: 2,
  });
  expect(mocks.listGuidebooks).not.toHaveBeenCalled();
});

it("저장소 장애는 정상·권한 거부로 위장하지 않고 호출자에게 전달한다", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id: principal.userId, role: "MEMBER" });
  const failure = new Error("synthetic database failure");
  mocks.countGuidebooks.mockRejectedValue(failure);
  await expect(listGuidebooksForMember({ principal, page: 1, pageSize: 10 })).rejects.toBe(failure);
});
