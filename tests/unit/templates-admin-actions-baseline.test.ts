/**
 * 보고서 양식 서버 액션의 이동 전 계약입니다.
 * 조회의 catch 범위와 저장 대기·캐시 경로·오류 로그를 실제 어댑터 호출로 검증합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), findFirst: vi.fn(), values: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(),
  revalidatePath: vi.fn(), redirect: vi.fn(), logServerError: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: {
  query: { reportTemplates: { findFirst: mocks.findFirst } },
  insert: () => ({ values: mocks.values }), update: () => ({ set: mocks.set }),
} }));
import { createReportTemplate, updateReportTemplate, deleteReportTemplate } from "@/features/report-templates/actions";

const id = "11111111-1111-4111-8111-111111111111";
/** 정상 입력은 공백 정규화·기본 버전·정수 변환도 함께 관찰합니다. */
function data() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ slug: " new-slug ", title: " 양식 ", category: "template",
    reportCategory: "classic-book", body: " 본문 ", description: " ", published: "on", order: "3tail" })) form.set(key, value);
  return form;
}
const paths = (slug: string) => ["/admin/resources/templates", "/member/templates", "/member/guides", "/resources",
  `/member/templates/${slug}`, `/member/templates/${slug}/print`, `/member/guides/${slug}`];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.findFirst.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockImplementation(() => Object.assign(Promise.resolve(), { returning: mocks.returning }));
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
});

it("검증 오류는 사전 조회 없이 기존 메시지를 반환한다", async () => {
  // 준비: 분야 코드가 없는 양식입니다.
  const form = data(); form.set("reportCategory", "");
  // 실행·검증: 폼 검증은 DB 접근 전에 끝납니다.
  expect(await createReportTemplate(form)).toEqual({ success: false,
    message: "양식(template) 카테고리는 분야 코드를 선택해야 합니다.",
    fieldErrors: { reportCategory: "양식(template) 카테고리는 분야 코드를 선택해야 합니다." } });
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it.each(["create", "update"])("%s 중복 slug는 저장하지 않는다", async kind => {
  // 준비: 다른 대상이 같은 slug를 사용합니다.
  mocks.findFirst.mockResolvedValue({ id: "other", slug: "new-slug" });
  // 실행: 생성 또는 수정의 사전 검증입니다.
  const result = kind === "create" ? await createReportTemplate(data()) : await updateReportTemplate(id, data());
  // 검증: 기존 중복 응답이며 쓰기를 하지 않습니다.
  expect(result).toEqual({ success: false, message: "이미 사용 중인 슬러그입니다.", fieldErrors: { slug: "이미 사용 중인 슬러그입니다." } });
  expect(mocks.values).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
});

it.each(["create", "update", "delete"])("%s는 저장이 끝나기 전 캐시·이동을 실행하지 않는다", async kind => {
  // 준비: 저장 완료를 직접 해제하는 지연 약속과 도달 신호입니다.
  const persisted = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  mocks.values.mockImplementation(() => { entered.resolve(); return persisted.promise; });
  mocks.returning.mockImplementation(async () => { entered.resolve(); await persisted.promise; return [{ id }]; });
  if (kind === "update") mocks.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id, slug: "old-slug" });
  if (kind === "delete") {
    mocks.findFirst.mockResolvedValue({ id, slug: "old-slug" });
    mocks.where.mockImplementation(() => { entered.resolve(); return persisted.promise; });
  }
  // 실행: 약속을 유지한 채 웹 후처리 여부를 관찰합니다.
  const pending = kind === "create" ? createReportTemplate(data()) : kind === "update" ? updateReportTemplate(id, data()) : deleteReportTemplate(id);
  const observed = pending.then(value => ({ value }), error => ({ error }));
  await entered.promise;
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  persisted.resolve();
  const result = await observed;
  // 검증: 완료 이후 HEAD 순서대로 캐시가 무효화됩니다.
  expect(mocks.revalidatePath.mock.calls.map(call => call[0])).toEqual(kind === "update"
    ? [...paths("old-slug"), ...paths("new-slug")] : paths(kind === "create" ? "new-slug" : "old-slug"));
  if (kind === "delete") expect(result).toEqual({ value: { success: true, message: "비공개 처리되었습니다." } });
  else expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/admin/resources/templates");
  if (kind === "update") expect(Object.keys(mocks.returning.mock.calls[0][0])).toEqual(["id"]);
  if (kind !== "create") expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([id]);
  expect(kind === "create" ? mocks.values.mock.calls[0][0] : mocks.set.mock.calls[0][0]).toEqual(kind === "delete"
    ? { published: false } : { slug: "new-slug", title: "양식", category: "template", reportCategory: "classic-book",
      description: null, version: "1.0.0", body: "본문", published: true, order: 3 });
});

it.each(["create", "update", "delete"])("%s의 revalidate 오류는 HEAD catch 범위를 유지한다", async kind => {
  // 준비: 저장은 성공하지만 웹 캐시가 거부합니다.
  const error = new Error("CACHE_FAILURE");
  mocks.revalidatePath.mockImplementation(() => { throw error; });
  if (kind === "update") mocks.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id, slug: "new-slug" });
  if (kind === "delete") mocks.findFirst.mockResolvedValue({ id, slug: "new-slug" });
  // 실행·검증: 비공개만 catch 안에 있고 생성·수정은 전파합니다.
  if (kind === "delete") {
    expect(await deleteReportTemplate(id)).toEqual({ success: false, message: "양식 비공개 처리에 실패했습니다." });
    expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("report-templates/delete", error, { id });
  } else {
    await expect(kind === "create" ? createReportTemplate(data()) : updateReportTemplate(id, data())).rejects.toBe(error);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  }
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each(["create", "update", "delete"])("%s 조회 실패의 catch 범위를 유지한다", async kind => {
  // 준비: 최초 사전 조회 실패입니다.
  const error = new Error("READ_FAILURE"); mocks.findFirst.mockRejectedValue(error);
  // 실행·검증: 생성·수정 조회는 catch 밖, 비공개 조회는 catch 안입니다.
  if (kind === "delete") {
    expect(await deleteReportTemplate(id)).toEqual({ success: false, message: "양식 비공개 처리에 실패했습니다." });
    expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("report-templates/delete", error, { id });
  } else {
    await expect(kind === "create" ? createReportTemplate(data()) : updateReportTemplate(id, data())).rejects.toBe(error);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  }
});

it("수정 returning이 빈 배열이면 캐시·이동 없이 누락을 반환한다", async () => {
  // 준비: 조회 후 대상이 사라집니다.
  mocks.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id, slug: "old" });
  mocks.returning.mockResolvedValue([]);
  // 실행·검증: 실제 갱신 0행을 실패로 유지합니다.
  expect(await updateReportTemplate(id, data())).toEqual({ success: false, message: "양식을 찾을 수 없습니다." });
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each(["create", "update", "delete"])("%s 저장 실패는 기존 결과와 로그 인자를 유지한다", async kind => {
  // 준비: 조회는 성공하고 실제 저장만 거부합니다.
  const error = new Error("WRITE_FAILURE");
  mocks.values.mockRejectedValue(error); mocks.returning.mockRejectedValue(error);
  if (kind === "update") mocks.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id, slug: "old" });
  if (kind === "delete") {
    mocks.findFirst.mockResolvedValue({ id, slug: "old" }); mocks.where.mockRejectedValue(error);
  }
  // 실행: 실제 웹 어댑터의 기존 catch입니다.
  const result = kind === "create" ? await createReportTemplate(data()) : kind === "update"
    ? await updateReportTemplate(id, data()) : await deleteReportTemplate(id);
  // 검증: 사용자 결과와 로그 필드 순서를 그대로 유지합니다.
  expect(result).toEqual({ success: false, message: kind === "create" ? "양식 저장에 실패했습니다."
    : kind === "update" ? "양식 수정에 실패했습니다." : "양식 비공개 처리에 실패했습니다." });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(`report-templates/${kind}`, error,
    kind === "create" ? { category: "template", hasReportCategory: true, published: true }
      : kind === "update" ? { id, category: "template", published: true } : { id });
  expect(mocks.revalidatePath).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each(["update", "delete"])("%s 잘못된 ID는 조회 없이 거부한다", async kind => {
  // 준비: UUID가 아닌 식별자입니다.
  // 실행·검증: ID 검증이 폼 검증과 조회보다 먼저입니다.
  expect(kind === "update" ? await updateReportTemplate("bad-id", new FormData()) : await deleteReportTemplate("bad-id"))
    .toEqual({ success: false, message: "유효하지 않은 ID입니다." });
  expect(mocks.findFirst).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
});

it.each(["update", "delete"])("%s 누락 대상은 쓰기 없이 거부한다", async kind => {
  // 준비: 모든 조회에서 대상이 없습니다.
  // 실행·검증: 기존 누락 응답이며 웹 후처리도 하지 않습니다.
  expect(kind === "update" ? await updateReportTemplate(id, data()) : await deleteReportTemplate(id))
    .toEqual({ success: false, message: "양식을 찾을 수 없습니다." });
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
