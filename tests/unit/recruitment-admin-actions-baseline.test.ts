/** 기수 액션의 검증·이미지 우선순위·저장 완료 대기와 삭제 실패 처리를 고정합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), select: vi.fn(), limit: vi.fn(), insert: vi.fn(), set: vi.fn(), write: vi.fn(), deleted: vi.fn(), guards: vi.fn(), validate: vi.fn(), upload: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("@/lib/admin-image-validation", () => ({ validateAdminImage: mocks.validate }));
vi.mock("@/lib/server-upload-intent", () => ({ uploadWithOwnedIntent: mocks.upload }));
vi.mock("@/lib/db/submission-delete-guards", () => ({ hasSubmissionDeleteGuards: mocks.guards }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, insert: () => ({ values: mocks.insert }),
  update: () => ({ set: (value: unknown) => { mocks.set(value); return { where: mocks.write }; } }),
  delete: () => ({ where: () => ({ returning: mocks.deleted }) }),
} }));
import { createCohort, updateCohort, deleteCohort } from "@/features/recruitment/actions";
const id = "11111111-1111-4111-8111-111111111111";
/** 문자열 입력은 실제 FormData로 전달합니다. */
function form(values: Record<string, string> = { name: " 20기 " }) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: mocks.limit }), innerJoin: () => ({ where: () => ({ limit: mocks.limit }) }) }) });
  mocks.limit.mockResolvedValue([{ imageUrl: "https://fixture.invalid/old.png" }]);
  mocks.guards.mockResolvedValue(true);
  mocks.deleted.mockResolvedValue([{ id }]);
  mocks.validate.mockResolvedValue({ extension: "png", contentType: "image/png" });
  mocks.upload.mockResolvedValue("https://fixture.invalid/new.png");
});
it.each(["create", "update", "delete"])("%s 저장이 끝나기 전에는 캐시 재검증·이동을 하지 않는다", async kind => {
  // 준비: DB 호출 진입과 저장 완료를 독립 신호로 제어합니다.
  let complete: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const entry = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const persist = () => { entered?.(); return pending.then(() => [{ id }]); };
  mocks.insert.mockImplementation(persist);
  mocks.write.mockImplementation(persist);
  mocks.deleted.mockImplementation(persist);
  if (kind === "delete") mocks.limit.mockResolvedValue([]);
  // 실행: 저장은 시작하되 아직 완료하지 않습니다.
  const action = kind === "create" ? createCohort(form()) : kind === "update" ? updateCohort(id, form()) : deleteCohort(id);
  await entry;
  await Promise.resolve();
  // 확인: 저장 완료가 웹 후처리의 선행 조건입니다.
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
  complete?.();
  await action;
  expect(mocks.revalidate.mock.calls).toEqual([["/admin/recruitment"], ["/cohorts"], ["/recruitment"]]);
  expect(mocks.redirect.mock.calls).toEqual(kind === "delete" ? [] : [["/admin/recruitment"]]);
});
it("시작일·종료일 검증 실패는 조회·업로드·저장 전에 같은 필드 오류를 반환한다", async () => {
  const result = await updateCohort(id, form({ name: "20기", startDate: "2026-10-20", endDate: "2026-10-19" }));
  expect(result).toEqual({ success: false, message: "기수 시작일은 종료일보다 늦을 수 없습니다.", fieldErrors: { endDate: "기수 시작일은 종료일보다 늦을 수 없습니다." } });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});
it("없는 기수 수정은 이미지 검증 전에 실패하며 이미지 URL만 조회한다", async () => {
  mocks.limit.mockResolvedValue([]);
  expect(await updateCohort(id, form())).toEqual({ success: false, message: "기수를 찾을 수 없습니다." });
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["imageUrl"]);
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});
it.each([false, true])("order 명시 여부 %s에 따라 저장 필드를 유지하며 업로드가 제거보다 우선한다", async hasOrder => {
  const data = form({ name: "20기", removeImage: "true", ...(hasOrder ? { order: "7" } : {}) });
  const file = new File(["합성 바이트"], "synthetic.png", { type: "image/png" });
  data.set("image", file);
  await updateCohort(id, data);
  expect(mocks.set.mock.calls[0][0]).toEqual({ name: "20기", description: null, startDate: null, endDate: null, isActive: false, ...(hasOrder ? { order: 7 } : {}), imageUrl: "https://fixture.invalid/new.png" });
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith({ namespace: "cohorts", extension: "png", body: file, contentType: "image/png", uploadedById: "admin-1" });
  expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.upload.mock.invocationCallOrder[0]);
  expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0]);
});
it("삭제 중 예상하지 못한 DB 실패는 원래 로그 인자와 한국어 실패를 유지한다", async () => {
  const error = new Error("합성 삭제 실패");
  mocks.limit.mockResolvedValue([]);
  mocks.deleted.mockRejectedValue(error);
  expect(await deleteCohort(id)).toEqual({ success: false, message: "연결된 데이터가 있거나 기수를 삭제할 수 없습니다. 다시 확인해주세요." });
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("recruitment/deleteCohort", error, { id });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it.each([
  "applications_cohort_id_cohorts_id_fk",
  "application_submissions_form_id_application_forms_id_fk",
])("캐시 재검증의 %s 참조 오류도 로그 없이 기존 삭제 거절 안내를 반환한다", async constraint => {
  const error = new Error("합성 캐시 실패", { cause: { code: "23503", constraint } });
  mocks.limit.mockResolvedValue([]);
  mocks.revalidate.mockImplementation(() => { throw error; });
  expect(await deleteCohort(id)).toEqual({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
  expect(mocks.log).not.toHaveBeenCalled();
});
it("캐시 재검증의 알 수 없는 오류는 기존 로그 인자와 일반 삭제 실패 안내를 반환한다", async () => {
  const error = new Error("합성 캐시 실패");
  mocks.limit.mockResolvedValue([]);
  mocks.revalidate.mockImplementation(() => { throw error; });
  expect(await deleteCohort(id)).toEqual({ success: false, message: "연결된 데이터가 있거나 기수를 삭제할 수 없습니다. 다시 확인해주세요." });
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("recruitment/deleteCohort", error, { id });
});
