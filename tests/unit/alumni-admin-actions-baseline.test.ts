// @vitest-environment node
/**
 * 수료생 액션의 입력 오류·저장 결과·웹 후처리를 이동 전후에 고정합니다.
 * DB 체인만 격리하고 실제 Zod 파싱 및 액션 반환값을 실행합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), insert: vi.fn(), returning: vi.fn(),
  deleteWhere: vi.fn(), reorder: vi.fn(), cache: vi.fn(), redirect: vi.fn(), log: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db/reorder", () => ({ reorderByCase: mocks.reorder }));
vi.mock("@/lib/alumni-upload-server", () => ({ validateAlumniImageReference: vi.fn() }));
vi.mock("@/lib/create-with-blobs", () => ({ uploadBlobsForCreate: async () => [], cleanupCreatedBlobs: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select,
  insert: () => ({ values: mocks.insert }),
  update: () => ({ set: () => ({ where: () => ({ returning: mocks.returning }) }) }),
  delete: () => ({ where: mocks.deleteWhere }),
} }));

import { createAlumniStory, updateAlumniStory, toggleAlumniPin, reorderAlumniStories, deleteAlumniStory } from "@/features/alumni/actions";

const id = "10000000-0000-4000-8000-000000000001";
const paths = ["/", "/admin/alumni", "/alumni"];

/** 실제 폼 파싱을 통과하는 최소 합성 입력입니다. */
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ requestId: id, name: " 수료생 ", quote: " 문구 ", content: " 본문 " })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockImplementation((fields: Record<string, unknown>) => ({ from: () => ({
    then: (resolve: (value: unknown) => void) => Promise.resolve([{ maxOrder: 4 }]).then(resolve),
    where: () => Object.assign(Promise.resolve(fields.imageUrl ? [{ imageUrl: null }] : []), { limit: async () => [] }),
  }) }));
  mocks.insert.mockResolvedValue(undefined);
  mocks.returning.mockResolvedValue([{ id, pinned: true }]);
  mocks.reorder.mockResolvedValue({ affected: 1 });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`QA_REDIRECT:${path}`); });
});

it.each([
  ["name", "", "이름을 입력해주세요."], ["name", "가".repeat(101), "이름은 100자 이하여야 합니다."],
  ["title", "가".repeat(101), "소속/직함은 100자 이하여야 합니다."],
  ["quote", "", "대표 문구를 입력해주세요."], ["quote", "가".repeat(501), "대표 문구는 500자 이하여야 합니다."],
  ["content", "", "내용을 입력해주세요."], ["content", "가".repeat(5001), "내용은 5000자 이하여야 합니다."],
])("생성의 %s 입력 오류는 동일 필드 메시지로 저장 전에 거절한다", async (field, value, message) => {
  const data = form(); data.set(field, value);
  expect(await createAlumniStory(data)).toEqual({ success: false, message, fieldErrors: { [field]: message } });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});

it.each([
  ["생성", () => createAlumniStory(form()), "alumni/create", "수료생 이야기 저장에 실패했습니다. 잠시 후 다시 시도해주세요."],
  ["수정", () => updateAlumniStory(id, form()), "alumni/update", "수정 중 오류가 발생했습니다. DB 마이그레이션 상태를 확인해주세요."],
])("%s 조회 실패는 기존 로그와 안전한 결과를 반환한다", async (_label, run, context, message) => {
  const failure = new Error("QA_DB_FAILED");
  mocks.select.mockImplementation(() => { throw failure; });
  expect(await run()).toEqual({ success: false, message });
  expect(mocks.log.mock.calls).toEqual([context === "alumni/create" ? [context, failure] : [context, failure, { id }]]);
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("정렬 실패는 기존 로그와 안전한 재시도 안내를 반환한다", async () => {
  const failure = new Error("QA_REORDER_FAILED");
  mocks.reorder.mockRejectedValue(failure);
  expect(await reorderAlumniStories([id])).toEqual({ success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." });
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("alumni/reorder", failure);
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("삭제 실패는 기존 로그와 고정 오류를 던진다", async () => {
  const failure = new Error("QA_DELETE_FAILED");
  mocks.deleteWhere.mockRejectedValue(failure);
  await expect(deleteAlumniStory(id)).rejects.toThrow("삭제 중 오류가 발생했습니다.");
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("alumni/delete", failure, { id });
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("잘못된 요청 키는 생성 조회 전에 거절한다", async () => {
  const data = form(); data.delete("requestId");
  expect(await createAlumniStory(data)).toEqual({ success: false, message: "페이지를 새로고침한 뒤 다시 제출해주세요." });
  expect(mocks.select).not.toHaveBeenCalled();
});

it.each([createAlumniStory, (data: FormData) => updateAlumniStory(id, data)])("저장 성공은 캐시 세 경로를 순서대로 갱신한 후 목록으로 이동한다", async run => {
  await expect(run(form())).rejects.toThrow("QA_REDIRECT:/admin/alumni");
  expect(mocks.cache.mock.calls).toEqual(paths.map(path => [path]));
  expect(mocks.cache.mock.invocationCallOrder[2]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});

it("수정의 없는 대상은 저장·캐시·이동 없이 기존 실패를 반환한다", async () => {
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [] }) });
  expect(await updateAlumniStory(id, form())).toEqual({ success: false, message: "수료생 이야기를 찾을 수 없습니다." });
  expect(mocks.returning).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("수정의 조건부 갱신 0행은 새로고침 안내를 반환한다", async () => {
  mocks.returning.mockResolvedValue([]);
  expect(await updateAlumniStory(id, form())).toEqual({ success: false, message: "수료생 이야기 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." });
  expect(mocks.cache).not.toHaveBeenCalled();
});

it.each([true, false])("고정 결과 %s는 저장값의 문구와 캐시 순서를 유지한다", async pinned => {
  mocks.returning.mockResolvedValue([{ pinned }]);
  expect(await toggleAlumniPin(id)).toEqual({ success: true, message: pinned ? "상단에 고정했습니다." : "고정을 해제했습니다." });
  expect(mocks.cache.mock.calls).toEqual(paths.map(path => [path]));
});

it("정렬 성공은 동일 결과와 캐시 순서를 유지한다", async () => {
  expect(await reorderAlumniStories([id])).toEqual({ success: true, message: "순서를 저장했습니다." });
  expect(mocks.cache.mock.calls).toEqual(paths.map(path => [path]));
});

it("정렬 일부 갱신은 건수 로그와 실패 문구를 유지한다", async () => {
  mocks.reorder.mockResolvedValue({ affected: 0 });
  expect(await reorderAlumniStories([id])).toEqual({ success: false, message: "일부 항목을 저장하지 못했습니다." });
  expect(mocks.log).toHaveBeenCalledWith("alumni/reorder", expect.any(Error), { expected: 1, actual: 0 });
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("삭제는 void 결과와 캐시 순서를 유지한다", async () => {
  expect(await deleteAlumniStory(id)).toBeUndefined();
  expect(mocks.deleteWhere).toHaveBeenCalledOnce();
  expect(mocks.cache.mock.calls).toEqual(paths.map(path => [path]));
});

it.each([
  ["수정", () => updateAlumniStory("bad", form()), "잘못된 수료생 이야기 ID입니다."],
  ["고정", () => toggleAlumniPin("bad"), "잘못된 ID입니다."],
  ["정렬", () => reorderAlumniStories([]), "유효하지 않은 요청입니다."],
])("%s의 잘못된 식별자는 저장 전에 기존 문구로 거절한다", async (_label, run, message) => {
  expect(await run()).toEqual({ success: false, message });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.returning).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});
