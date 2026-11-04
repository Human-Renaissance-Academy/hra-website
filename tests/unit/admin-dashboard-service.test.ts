/**
 * 대시보드 서비스의 관리자 재인가·DTO 경계·누락 집계 기본값을 확인합니다.
 * 저장소만 격리하여 인가 실패 시 SQL 진입이 없는지 검사합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ getDashboardCountRows: vi.fn(), requireAdmin: vi.fn(), logServerError: vi.fn() }));
vi.mock("@/features/admin-dashboard/repository", () => mocks);
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import { getDashboardCounts } from "@/features/admin-dashboard/service";
import AdminDashboardPage from "@/app/(admin)/admin/page";

const actor = { userId: "admin-1", role: "ADMIN" };
const keys = ["pendingSubmissions", "totalSubmissions", "pendingUsers", "totalMembers", "totalCohorts",
  "totalNotices", "totalPress", "totalGalleries", "totalAlumni"] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getDashboardCountRows.mockResolvedValue(keys.map((_, index) => [{ total: String(index + 1), internal: "비공개" }]));
});

it.each(["PENDING", "MEMBER", "FACULTY", "", "admin"])("%s 역할은 저장소 접근 전에 거부한다", async (role) => {
  // 준비: 관리자가 아닌 역할의 주체입니다.
  // 실행·검증: 정확한 인가 오류로 거부합니다.
  await expect(getDashboardCounts({ userId: "user-1", role })).rejects.toThrow("DASHBOARD_ADMIN_REQUIRED");
  expect(mocks.getDashboardCountRows).not.toHaveBeenCalled();
});

it("빈 관리자 식별자는 저장소 접근 전에 거부한다", async () => {
  // 준비: 역할만 관리자이고 식별자는 비어 있습니다.
  // 실행·검증: 동일한 인가 오류와 미호출을 확인합니다.
  await expect(getDashboardCounts({ userId: "", role: "ADMIN" })).rejects.toThrow("DASHBOARD_ADMIN_REQUIRED");
  expect(mocks.getDashboardCountRows).not.toHaveBeenCalled();
});

it("누락 주체는 저장소 접근 전에 거부한다", async () => {
  // 준비: 타입을 우회하지 않고 다른 런타임 adapter의 인자 누락을 재현합니다.
  // 실행·검증: FAQ와 같은 런타임 인가 거부를 확인합니다.
  await expect(Reflect.apply(getDashboardCounts, undefined, [undefined])).rejects.toThrow("DASHBOARD_ADMIN_REQUIRED");
  expect(mocks.getDashboardCountRows).not.toHaveBeenCalled();
});

it("관리자 조회는 정확한 아홉 숫자 필드만 반환한다", async () => {
  // 준비: 저장소는 문자열 집계와 내부 필드를 반환합니다.
  // 실행: 관리자 서비스로 변환합니다.
  const dto = await getDashboardCounts(actor);
  // 검증: 타입 변환·매핑·키 순서·내부 필드 제외를 고정합니다.
  expect(dto).toEqual({ pendingSubmissions: 1, totalSubmissions: 2, pendingUsers: 3, totalMembers: 4,
    totalCohorts: 5, totalNotices: 6, totalPress: 7, totalGalleries: 8, totalAlumni: 9 });
  expect(Object.keys(dto)).toEqual(keys);
});

it.each(keys)("%s의 집계 행이 없으면 해당 숫자만 0이 된다", async (key) => {
  // 준비: 선택한 한 집계만 행이 없습니다.
  mocks.getDashboardCountRows.mockResolvedValue(keys.map((field, index) => field === key ? [] : [{ total: index + 1 }]));
  // 실행: 같은 관리자 서비스로 변환합니다.
  const dto = await getDashboardCounts(actor);
  // 검증: 누락 기본값과 나머지 매핑을 함께 확인합니다.
  expect(Object.values(dto)).toEqual(keys.map((field, index) => field === key ? 0 : index + 1));
});

it.each([null, undefined])("집계 total이 %s이면 0으로 변환한다", async (total) => {
  // 준비: 행은 있으나 집계 값이 nullish입니다.
  mocks.getDashboardCountRows.mockResolvedValue(keys.map(() => [{ total }]));
  // 실행·검증: 기존 ?? 0을 모든 집계에 적용합니다.
  expect(Object.values(await getDashboardCounts(actor))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

it("저장소 거부는 같은 오류 객체로 전파한다", async () => {
  // 준비: 저장소가 거부하는 오류입니다.
  const error = new Error("합성 집계 거부");
  mocks.getDashboardCountRows.mockRejectedValue(error);
  // 실행·검증: 페이지 catch가 처리할 원래 객체를 그대로 전파합니다.
  await expect(getDashboardCounts(actor)).rejects.toBe(error);
});

it("서비스 재인가 거부는 페이지의 기존 오류 카드와 로그로 처리한다", async () => {
  // 준비: 웹 세션 mock의 역할이 서비스 재인가에서 거부됩니다.
  mocks.requireAdmin.mockResolvedValue({ user: { id: "user-1", role: "MEMBER" } });
  // 실행: 서비스 호출을 포함한 기존 try/catch를 통과합니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 검증: 저장소에 접근하지 않고 원래 오류 UI와 인가 오류 로그를 반환합니다.
  expect([html.includes("데이터를 불러오지 못했습니다."), mocks.getDashboardCountRows.mock.calls]).toEqual([true, []]);
  expect(mocks.logServerError.mock.calls).toEqual([["admin/dashboard", new Error("DASHBOARD_ADMIN_REQUIRED")]]);
});
