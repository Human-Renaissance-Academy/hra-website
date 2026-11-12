// @vitest-environment node
/** 강의자료 액션의 저장 대기·캐시 예외·파일 참조 교체 계약을 고정합니다. */
import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), requireAdmin: vi.fn(), findFirst: vi.fn(), values: vi.fn(),
  set: vi.fn(), where: vi.fn(), returning: vi.fn(), revalidatePath: vi.fn(),
  logServerError: vi.fn(), validate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("@/lib/resource-upload-server", () => ({ validateResourceUploadReference: mocks.validate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({ db: {
  query: { classMaterials: { findFirst: mocks.findFirst } },
  insert: () => ({ values: mocks.values }), update: () => ({ set: mocks.set }),
  delete: () => ({ where: mocks.where }),
} }));
import { createClassMaterial, updateClassMaterial, deleteClassMaterial } from "@/features/class-materials/actions";

const id = "11111111-1111-4111-8111-111111111111";
const url = "https://fixture.invalid/new.pdf";
/** 기존 웹 입력 형태를 그대로 구성합니다. */
function form(upload = false) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: "합성 제목", audience: "STUDENT", weekNumber: "", lectureTitle: "" })) data.set(key, value);
  if (upload) { data.set("uploadedFileUrl", url); data.set("uploadedFileName", "합성.pdf"); }
  return data;
}
/** 타이머 대신 저장 진입과 완료를 분리합니다. */
function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, complete(value: T) { if (!resolve) throw new Error("합성 신호 초기화 오류"); resolve(value); } };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id, role: "ADMIN" } });
  mocks.requireAdmin.mockResolvedValue({ user: { id, role: "ADMIN" } });
  mocks.findFirst.mockResolvedValue({ id, fileUrl: "old", classDate: new Date(0) });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.values.mockResolvedValue(undefined);
  mocks.validate.mockResolvedValue({ url, fileName: "합성.pdf" });
});

const cases = [
  { kind: "create", run: () => createClassMaterial(form(true)), persistence: mocks.values, result: undefined },
  { kind: "update", run: () => updateClassMaterial(id, form()), persistence: mocks.returning, result: [{ id }] },
  { kind: "delete", run: () => deleteClassMaterial(id), persistence: mocks.returning, result: [{ id }] },
] as const;
it.each(cases)("$kind는 저장 완료 전 캐시를 갱신하지 않는다", async ({ run, persistence, result }) => {
  // 준비: 실제 저장이 완료되지 않은 상황입니다.
  const entered = deferred<void>();
  const saved = deferred<unknown>();
  persistence.mockImplementationOnce(() => { entered.complete(undefined); return saved.promise; });
  // 실행: 액션은 저장 응답을 기다립니다.
  const pending = run();
  await entered.promise;
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  saved.complete(result);
  // 검증: 동일 순서의 세 경로만 갱신합니다.
  expect(await pending).toEqual({ success: true });
  expect(mocks.revalidatePath.mock.calls).toEqual([
    ["/admin/resources/class-materials"], ["/resources"], ["/resources/class-materials"],
  ]);
});
it.each(cases)("$kind 캐시 갱신 예외도 기존 catch 범위에 포함된다", async ({ kind, run }) => {
  // 준비: 저장 이후 Web 후처리가 실패합니다.
  const failure = new Error("합성 캐시 장애");
  mocks.revalidatePath.mockImplementationOnce(() => { throw failure; });
  // 실행·검증: 오류 결과와 로그 메타데이터가 유지됩니다.
  const errors = { create: "강의 자료 저장에 실패했습니다.", update: "강의 자료 수정에 실패했습니다.", delete: "강의 자료 삭제에 실패했습니다." };
  expect(await run()).toEqual({ success: false, error: errors[kind] });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(`class-materials/${kind}`, failure,
    kind === "create" ? { audience: "STUDENT", hasUploadedBlob: true } : kind === "update" ? { id, audience: "STUDENT" } : { id });
});
it("파일 교체는 검증 뒤 이전 URL 조건으로 경합을 거절한다", async () => {
  // 준비: 대상은 조회되지만 실제 갱신은 0행입니다.
  mocks.returning.mockResolvedValue([]);
  // 실행: 검증된 새 파일로 교체를 요청합니다.
  expect(await updateClassMaterial(id, form(true))).toEqual({ success: false,
    error: "강의 자료 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." });
  // 검증: 낡은 참조 조건과 파일 검증 인자가 유지됩니다.
  expect(new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([id, "old"]);
  expect(mocks.validate).toHaveBeenCalledExactlyOnceWith("class-materials", id, url, "합성.pdf");
  expect(mocks.validate.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0]);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it.each(["ADMIN", "FACULTY"])("%s의 생성은 기존 업로드 권한을 유지한다", async (role) => {
  // 준비: 교수도 관리자와 같은 파일을 등록할 수 있습니다.
  mocks.auth.mockResolvedValue({ user: { id, role } });
  // 실행·검증: 저장 주체는 세션 ID입니다.
  expect(await createClassMaterial(form(true))).toEqual({ success: true });
  expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ uploadedById: id, fileUrl: url }));
});
