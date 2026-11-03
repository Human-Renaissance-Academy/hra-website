/**
 * 언론보도 웹 액션의 검증 결과·캐시 순서·이동·오류 기록을 이동 전에 고정합니다.
 * 외부 웹 효과와 저장소 체인만 격리하여 실제 FormData 검증을 실행합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), values: vi.fn(), set: vi.fn(), returning: vi.fn(),
  remove: vi.fn(), reorder: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(), logServerError: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, insert: () => ({ values: mocks.values }),
  update: () => ({ set: mocks.set }), delete: () => ({ where: mocks.remove }),
} }));
vi.mock("@/lib/db/reorder", () => ({ reorderByCase: mocks.reorder }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import { createPressArticle, updatePressArticle, deletePressArticle, reorderPressArticles, trackPressView } from "@/features/press/actions";
import * as service from "@/features/press/admin/service";
import * as viewService from "@/features/press/view-service";

const id = "81000000-0000-4000-8000-000000000001";
/** 합성 입력을 만들어 공백 정규화와 선택 필드 저장을 확인합니다. */
function formData() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ title: " 합성 기사 ", source: " 합성 매체 ", url: " https://press.invalid/article ", publishedAt: "2026-10-24", description: " ", imageUrl: " " })) form.set(key, value);
  return form;
}

/** 세션과 저장 체인의 마이크로태스크를 비워 미완료 저장 뒤의 웹 효과를 관찰합니다. */
async function flushMicrotasks() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: async () => [{ maxOrder: 7 }] });
  mocks.set.mockReturnValue({ where: () => ({ returning: mocks.returning }) });
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.reorder.mockResolvedValue({ affected: 1 });
});

it.each([
  ["title", "", "제목을 입력해주세요."], ["title", "가".repeat(301), "제목은 300자 이하여야 합니다."],
  ["source", "", "언론사명을 입력해주세요."], ["source", "가".repeat(201), "언론사명은 200자 이하여야 합니다."],
  ["url", "잘못됨", "올바른 기사 링크를 입력해주세요."], ["publishedAt", "2026-02-30", "올바른 게시일을 입력해주세요."],
  ["description", "가".repeat(5001), "요약은 5000자 이하여야 합니다."], ["imageUrl", "잘못됨", "올바른 썸네일 URL을 입력해주세요."],
])("%s 검증 실패는 기존 메시지와 필드 오류를 반환한다", async (field, value, message) => {
  // 준비: 한 필드만 유효하지 않은 입력입니다.
  const form = formData(); form.set(field, value);
  // 실행: 실제 생성 액션의 검증입니다.
  const result = await createPressArticle(form);
  // 검증: DB와 성공 효과는 실행하지 않습니다.
  expect(result).toEqual({ success: false, message, fieldErrors: { [field]: message } });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it.each([createPressArticle, (form: FormData) => updatePressArticle(id, form)])("빈 폼은 첫 오류와 모든 필드 오류를 기존 순서로 반환한다", async action => {
  // 준비 및 실행: 필수 필드가 전부 없습니다.
  const result = await action(new FormData());
  // 검증: 첫 오류와 전체 필드 오류의 고정 계약입니다.
  expect(result).toEqual({ success: false, message: "제목을 입력해주세요.", fieldErrors: {
    title: "제목을 입력해주세요.", source: "언론사명을 입력해주세요.", url: "올바른 기사 링크를 입력해주세요.", publishedAt: "올바른 게시일을 입력해주세요.",
  } });
  expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
});

it.each(["create", "update"] as const)("%s 성공은 정규화된 값 저장 뒤 관리자·공개 캐시와 이동을 순서대로 실행한다", async kind => {
  // 준비: 실제 저장값 검증은 유지하고 서비스 완료만 직접 제어합니다.
  const persistence = Promise.withResolvers<void>();
  const create = service.createItem;
  const update = service.updateItem;
  switch (kind) {
    case "create":
      vi.spyOn(service, "createItem").mockImplementation(async (actor, input) => {
        await create(actor, input); await persistence.promise;
      });
      break;
    case "update":
      vi.spyOn(service, "updateItem").mockImplementation(async (actor, articleId, input) => {
        const updated = await update(actor, articleId, input); await persistence.promise; return updated;
      });
      break;
  }
  const form = formData();
  // 실행: 생성 또는 수정입니다.
  const action = kind === "create" ? createPressArticle(form) : updatePressArticle(id, form);
  await flushMicrotasks();
  // 검증: 저장 완료 전에는 캐시 갱신과 이동이 없어야 합니다.
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  persistence.resolve();
  await action;
  // 검증: 값 변환과 웹 효과의 순서를 고정합니다.
  const saved = { title: "합성 기사", source: "합성 매체", url: "https://press.invalid/article", publishedAt: new Date("2026-10-24"), description: null, imageUrl: null };
  if (kind === "create") expect(mocks.values).toHaveBeenCalledWith({ ...saved, order: 8 });
  else expect(mocks.set).toHaveBeenCalledWith(saved);
  expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/press"], ["/press"]]);
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/admin/press");
  expect(mocks.revalidatePath.mock.invocationCallOrder[1]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});

it("수정 ID 검증은 폼 검증보다 먼저 기존 실패를 반환한다", async () => {
  // 준비 및 실행: ID와 폼 모두 잘못되었습니다.
  expect(await updatePressArticle("잘못됨", new FormData())).toEqual({ success: false, message: "잘못된 언론보도 ID입니다." });
  // 검증: SQL은 실행하지 않습니다.
  expect(mocks.set).not.toHaveBeenCalled();
});

it("수정 0행은 정확한 누락 메시지를 반환하며 캐시·이동을 실행하지 않는다", async () => {
  // 준비: 저장 직전 삭제도 같은 결과입니다.
  mocks.returning.mockResolvedValueOnce([]);
  // 실행 및 검증: 성공으로 위장하지 않습니다.
  expect(await updatePressArticle(id, formData())).toEqual({ success: false, message: "언론보도를 찾을 수 없습니다." });
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it("삭제는 레코드 삭제 뒤 두 캐시를 기존 순서로 갱신하며 이동하지 않는다", async () => {
  // 준비: 기존 삭제 호출은 유지하고 서비스 완료를 제어합니다.
  const persistence = Promise.withResolvers<void>();
  const remove = service.deleteItem;
  vi.spyOn(service, "deleteItem").mockImplementation(async (actor, articleId) => {
    await remove(actor, articleId); await persistence.promise;
  });
  // 실행: 미완료 삭제를 시작합니다.
  const action = deletePressArticle(id);
  await flushMicrotasks();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  persistence.resolve();
  await action;
  // 검증: 웹 후처리의 순서와 반환을 고정합니다.
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/press"], ["/press"]]);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([{ ids: [] }, { ids: ["잘못됨"] }])("순서 요청 형식 오류는 저장과 로깅 없이 실패한다", async ({ ids }) => {
  // 준비 및 실행: 비어 있거나 UUID가 아닙니다.
  expect(await reorderPressArticles(ids)).toEqual({ success: false, message: "유효하지 않은 요청입니다." });
  // 검증: 저장소와 오류 기록에 도달하지 않습니다.
  expect(mocks.reorder).not.toHaveBeenCalled(); expect(mocks.logServerError).not.toHaveBeenCalled();
});

it("순서 변경 건수 불일치는 기존 로그 인자와 한국어 실패를 유지한다", async () => {
  // 준비: 단일 SQL이 0행을 변경했습니다.
  mocks.reorder.mockResolvedValueOnce({ affected: 0 });
  // 실행 및 검증: 정확한 오류 기록 계약입니다.
  expect(await reorderPressArticles([id])).toEqual({ success: false, message: "일부 항목을 저장하지 못했습니다." });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("press/reorder", new Error("update count mismatch"), { expected: 1, actual: 0 });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("순서 변경 예외는 원래 오류와 요청 건수만 기록한다", async () => {
  // 준비: 서비스 저장 예외의 발생 시점을 직접 제어합니다.
  const persistence = Promise.withResolvers<{ matched: boolean; affected: number }>();
  vi.spyOn(service, "reorderItems").mockReturnValueOnce(persistence.promise);
  const error = new Error("합성 실패");
  // 실행: 미완료 저장에서는 웹 효과도 오류 기록도 없어야 합니다.
  const action = reorderPressArticles([id]);
  await flushMicrotasks();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.logServerError).not.toHaveBeenCalled();
  persistence.reject(error);
  // 실행 및 검증: 오류 객체를 바꾸지 않습니다.
  expect(await action).toEqual({ success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("press/reorder", error, { orderedIdsCount: 1 });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("순서 성공은 두 캐시를 갱신하고 기존 성공 메시지를 반환한다", async () => {
  // 준비: 저장 체인을 유지하면서 서비스 결과 확정을 지연합니다.
  const persistence = Promise.withResolvers<void>();
  const reorder = service.reorderItems;
  vi.spyOn(service, "reorderItems").mockImplementation(async (actor, ids) => {
    const result = await reorder(actor, ids); await persistence.promise; return result;
  });
  // 실행: 저장이 미완료인 동안에는 성공 후처리가 없어야 합니다.
  const action = reorderPressArticles([id]);
  await flushMicrotasks();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  persistence.resolve();
  expect(await action).toEqual({ success: true, message: "순서를 저장했습니다." });
  // 검증: 성공 후처리를 유지합니다.
  expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/press"], ["/press"]]);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([
  { name: "생성", method: "createItem", action: () => createPressArticle(formData()) },
  { name: "수정", method: "updateItem", action: () => updatePressArticle(id, formData()) },
  { name: "삭제", method: "deleteItem", action: () => deletePressArticle(id) },
] as const)("$name 저장 거부는 원래 오류를 전파하고 웹 효과를 실행하지 않는다", async ({ method, action }) => {
  // 준비: 생성·수정·삭제는 순서 변경과 달리 저장 오류를 그대로 전파합니다.
  const persistence = Promise.withResolvers<never>();
  vi.spyOn(service, method).mockReturnValueOnce(persistence.promise);
  const error = new Error("합성 저장 실패");
  // 실행: 거부 전에 관찰자를 연결하여 처리되지 않은 거부를 방지합니다.
  const result = action();
  const rejection = expect(result).rejects.toBe(error);
  await flushMicrotasks();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  persistence.reject(error);
  // 검증: 오류 객체와 웹 효과 부재를 유지합니다.
  await rejection;
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it("공개 조회수는 관리자 세션과 캐시·이동 없이 증가시킨다", async () => {
  // 준비: 실제 공개 서비스와 SQL을 함께 관찰합니다.
  const record = vi.spyOn(viewService, "recordPressView");
  // 준비 및 실행: 공개 기사 클릭입니다.
  await trackPressView(id);
  // 검증: 공개 인가 정책과 웹 부작용 부재를 유지합니다.
  expect(mocks.set).toHaveBeenCalledOnce(); expect(mocks.requireAdmin).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledExactlyOnceWith(id);
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it("공개 조회수의 잘못된 UUID는 서비스를 호출하지 않는다", async () => {
  // 준비: UUID 검증 경계의 서비스 호출을 관찰합니다.
  const record = vi.spyOn(viewService, "recordPressView");
  // 실행: 잘못된 공개 기사 ID입니다.
  await trackPressView("잘못됨");
  // 검증: 저장과 모든 웹 효과가 없습니다.
  expect(record).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.requireAdmin).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it("공개 조회수 서비스 거부는 원래 오류를 전파한다", async () => {
  // 준비: 공개 서비스의 합성 저장 오류입니다.
  const error = new Error("합성 조회수 실패");
  const record = vi.spyOn(viewService, "recordPressView").mockRejectedValueOnce(error);
  // 실행: 유효한 UUID의 클릭 기록입니다.
  await expect(trackPressView(id)).rejects.toBe(error);
  // 검증: 오류를 숨기거나 관리자 웹 효과를 실행하지 않습니다.
  expect(record).toHaveBeenCalledExactlyOnceWith(id); expect(mocks.requireAdmin).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});
