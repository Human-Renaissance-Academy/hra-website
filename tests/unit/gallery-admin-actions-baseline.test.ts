/** 갤러리 액션의 검증 순서·결과 문구·재검증·이동을 원본 구현부터 고정합니다. */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), find: vi.fn(), insert: vi.fn(), update: vi.fn(),
  remove: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: {
  query: { galleries: { findFirst: mocks.find } },
  insert: () => ({ values: () => ({ returning: mocks.insert }) }),
  update: () => ({ set: () => ({ where: mocks.update }) }),
  delete: () => ({ where: () => ({ returning: mocks.remove }) }),
} }));
import { createGallery, updateGallery, deleteGallery } from "@/features/gallery/actions";

const id = "10000000-0000-4000-8000-000000000001";
/** 사용자 폼 입력은 매 테스트에서 별도 객체로 만듭니다. */
function form(title = "합성 앨범") {
  const data = new FormData(); data.set("title", title); return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.find.mockResolvedValue({ id, coverImageUrl: null, images: [] });
  mocks.insert.mockResolvedValue([{ id }]); mocks.remove.mockResolvedValue([{ id }]);
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

it("생성은 기존 네 경로 재검증 후 UUID 편집 화면으로 이동한다", async () => {
  // 준비: 정상 앨범 입력과 INSERT 결과를 사용합니다.
  const data = form();
  // 실행: 이동 예외까지 실제 액션을 호출합니다.
  await expect(createGallery(data)).rejects.toThrow(`REDIRECT:/admin/gallery/${id}/edit`);
  // 확인: 경로 순서와 이동 시점을 고정합니다.
  expect(mocks.revalidate.mock.calls).toEqual([["/gallery"], [`/gallery/${id}`], ["/admin/gallery"], [`/admin/gallery/${id}/edit`]]);
  expect(mocks.revalidate.mock.invocationCallOrder[3]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});
it("수정은 제목 검증을 UUID 검증보다 먼저 수행한다", async () => {
  // 준비: 제목과 ID가 모두 잘못된 입력입니다.
  const data = form("");
  // 실행: 원본의 검증 우선순위를 관찰합니다.
  const result = await updateGallery("invalid", data);
  // 확인: DB·재검증 없이 제목 오류가 우선합니다.
  expect(result).toEqual({ success: false, message: "제목을 입력해주세요." });
  expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("수정은 기존 결과와 네 경로를 유지하고 이동하지 않는다", async () => {
  // 준비: 존재하는 합성 앨범입니다.
  const data = form();
  // 실행: 정상 수정을 수행합니다.
  const result = await updateGallery(id, data);
  // 확인: 결과와 웹 후처리를 고정합니다.
  expect(result).toEqual({ success: true, message: "앨범 정보가 수정되었습니다." });
  expect(mocks.revalidate.mock.calls).toEqual([["/gallery"], [`/gallery/${id}`], ["/admin/gallery"], [`/admin/gallery/${id}/edit`]]);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("삭제의 조회 후 0행 경합은 실패 결과이며 재검증하지 않는다", async () => {
  // 준비: 존재 조회 이후 다른 요청이 앨범을 삭제한 상황입니다.
  mocks.remove.mockResolvedValue([]);
  // 실행: 원본 DELETE returning 결과를 처리합니다.
  const result = await deleteGallery(id);
  // 확인: 삭제 실패를 성공으로 표시하지 않습니다.
  expect(result).toEqual({ success: false, message: "앨범을 찾을 수 없습니다." });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
