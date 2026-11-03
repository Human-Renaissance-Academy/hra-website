// @vitest-environment node
/**
 * 가이드북 관리자 액션의 검증 순서·경합·오류 범위·저장 대기를 이동 전에 고정합니다.
 * 외부 업로드 검증과 DB 전송만 격리하고 실제 웹 액션을 호출합니다.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), validate: vi.fn(), findFirst: vi.fn(), insert: vi.fn(),
  set: vi.fn(), where: vi.fn(), returning: vi.fn(), deleteReturning: vi.fn(),
  revalidatePath: vi.fn(), logServerError: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/resource-upload-server", () => ({ validateResourceUploadReference: mocks.validate }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => ({ db: {
  query: { guidebooks: { findFirst: mocks.findFirst } },
  insert: () => ({ values: mocks.insert }),
  update: () => ({ set: mocks.set }),
  delete: () => ({ where: () => ({ returning: mocks.deleteReturning }) }),
} }));
import { createGuidebook, updateGuidebook, deleteGuidebook } from "@/features/guidebooks/actions";

const id = "11111111-1111-4111-8111-111111111111";
const oldUrl = "https://fixture.invalid/old.pdf";
const newUrl = "https://fixture.invalid/new.pdf";
const missing = { success: false, error: "가이드북을 찾을 수 없습니다." };

/** 폼은 실제 입력 변환과 선택적 파일 분기를 통과합니다. */
function form(upload = false) {
  const data = new FormData();
  data.set("title", "  새 안내  ");
  if (upload) { data.set("uploadedFileUrl", newUrl); data.set("uploadedFileName", "새.pdf"); }
  return data;
}

/** 타이머 대신 저장 진입·완료 신호를 직접 제어합니다. */
function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { complete = resolve; });
  return { promise, resolve(value: T) {
    if (!complete) throw new Error("합성 신호가 필요합니다.");
    complete(value);
  } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.validate.mockResolvedValue({ url: newUrl, fileName: "새.pdf" });
  mocks.findFirst.mockResolvedValue({ id, fileUrl: oldUrl });
  mocks.insert.mockResolvedValue(undefined);
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.deleteReturning.mockResolvedValue([{ id }]);
});

const commands = [
  { name: "생성", run: () => createGuidebook(form(true)), persistence: mocks.insert,
    path: "guidebooks/create", context: { hasFile: true }, error: "가이드북 저장에 실패했습니다. 잠시 후 다시 시도해주세요." },
  { name: "수정", run: () => updateGuidebook(id, form()), persistence: mocks.returning,
    path: "guidebooks/update", context: { id, hasNewFile: false }, error: "가이드북 수정에 실패했습니다. 잠시 후 다시 시도해주세요." },
  { name: "삭제", run: () => deleteGuidebook(id), persistence: mocks.deleteReturning,
    path: "guidebooks/delete", context: { id }, error: "가이드북 삭제에 실패했습니다." },
];

it.each(commands)("$name 저장이 완료되기 전에는 경로를 재검증하지 않는다", async ({ run, persistence }) => {
  // 준비: 저장에 진입해도 완료되지 않는 합성 전송입니다.
  const entered = deferred<void>();
  const persisted = deferred<{ id: string }[]>();
  persistence.mockImplementation(() => { entered.resolve(); return persisted.promise; });
  // 실행: 저장 직전에서 정지시킵니다.
  const pending = run();
  await entered.promise;
  await Promise.resolve();
  await Promise.resolve();
  // 검증: 완료 신호 전에는 웹 후처리가 없습니다.
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  persisted.resolve([{ id }]);
  expect(await pending).toEqual({ success: true });
  expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/resources/guidebooks"], ["/resources"]]);
});

it.each(commands)("$name 재검증 예외도 같은 catch에서 고정 오류와 원래 로그로 처리한다", async ({ run, path, context, error }) => {
  // 준비: 저장 이후 웹 후처리만 실패합니다.
  const failure = new Error("합성 인프라 상세");
  mocks.revalidatePath.mockImplementation(() => { throw failure; });
  // 실행·검증: 원본 예외는 로그에만 전달됩니다.
  expect(await run()).toEqual({ success: false, error });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(path, failure, context);
});

it.each(commands)("$name DB 예외를 고정 오류로 처리한다", async ({ run, persistence, path, context, error }) => {
  // 준비: DB 전송 예외입니다.
  const failure = new Error("합성 SQL 원문");
  persistence.mockRejectedValue(failure);
  // 실행·검증: 원래 로그와 일반 메시지입니다.
  expect(await run()).toEqual({ success: false, error });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(path, failure, context);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("생성은 제목 검증 후 파일 참조 검증을 기다리고 정규화된 값만 저장한다", async () => {
  // 준비: 완료 URL과 파일명을 포함합니다.
  const data = form(true);
  // 실행: 실제 생성 액션입니다.
  expect(await createGuidebook(data)).toEqual({ success: true });
  // 검증: 업로드 검증 인자·순서·DB 값입니다.
  expect(mocks.validate).toHaveBeenCalledExactlyOnceWith("guidebooks", "admin-1", newUrl, "새.pdf");
  expect(mocks.validate.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({ title: "새 안내", fileUrl: newUrl, fileName: "새.pdf" });
});

it.each(["생성", "수정"])("%s 업로드 검증 예외도 원래 catch에서 처리한다", async name => {
  // 준비: 참조 검증 내부 예외입니다.
  const failure = new Error("합성 참조 예외");
  mocks.validate.mockRejectedValue(failure);
  // 실행: 새 파일이 있는 요청입니다.
  const result = name === "생성" ? await createGuidebook(form(true)) : await updateGuidebook(id, form(true));
  // 검증: 검증과 DB의 catch 범위를 유지합니다.
  expect(result).toEqual({ success: false, error: name === "생성"
    ? "가이드북 저장에 실패했습니다. 잠시 후 다시 시도해주세요."
    : "가이드북 수정에 실패했습니다. 잠시 후 다시 시도해주세요." });
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(name === "생성" ? "guidebooks/create" : "guidebooks/update",
    failure, name === "생성" ? { hasFile: true } : { id, hasNewFile: false });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it("수정은 ID·제목 검증 뒤 대상 존재를 확인하고 구형 파일을 거부한다", async () => {
  // 준비: 구형 File과 새 업로드 참조를 함께 보냅니다.
  const data = form(true);
  data.set("file", new File(["PDF"], "구형.pdf"));
  // 실행: 원래 대상 조회가 먼저 일어납니다.
  expect(await updateGuidebook(id, data)).toEqual({ success: false, error: "파일을 다시 업로드해주세요." });
  // 검증: 대상 조회 뒤 파일 거부에서 멈춥니다.
  expect(mocks.findFirst).toHaveBeenCalledOnce();
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.set).not.toHaveBeenCalled();
});

it("수정 대상이 없으면 구형 파일 거부보다 누락 결과가 우선이다", async () => {
  // 준비: 대상 부재와 구형 파일이 겹칩니다.
  mocks.findFirst.mockResolvedValue(undefined);
  const data = form(true);
  data.set("file", new File(["PDF"], "구형.pdf"));
  // 실행·검증: 누락 결과가 먼저 반환됩니다.
  expect(await updateGuidebook(id, data)).toEqual(missing);
  expect(mocks.validate).not.toHaveBeenCalled();
});

it("파일 교체는 이전 URL까지 조건으로 비교하고 0행을 경합으로 구분한다", async () => {
  // 준비: 다른 요청이 먼저 파일을 교체한 상황입니다.
  mocks.returning.mockResolvedValue([]);
  // 실행: 검증한 참조로 교체합니다.
  expect(await updateGuidebook(id, form(true))).toEqual({ success: false,
    error: "가이드북 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." });
  // 검증: 낙관적 조건과 저장값입니다.
  const where: SQL = mocks.where.mock.calls[0][0];
  expect(new PgDialect().sqlToQuery(where)).toEqual({ sql: '("guidebooks"."id" = $1 and "guidebooks"."file_url" = $2)', params: [id, oldUrl], typings: ["uuid", "none"] });
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith({ title: "새 안내", fileUrl: newUrl, fileName: "새.pdf" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("제목만 수정한 0행은 누락이고 파일 필드는 갱신하지 않는다", async () => {
  // 준비: 조회 이후 삭제 경합입니다.
  mocks.returning.mockResolvedValue([]);
  // 실행·검증: 제목만 저장하고 누락을 보고합니다.
  expect(await updateGuidebook(id, form())).toEqual(missing);
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith({ title: "새 안내" });
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it.each([false, true])("삭제 대상 부재·삭제 경합(%s)은 재검증 없이 누락을 반환한다", async race => {
  // 준비: 조회 전후의 누락입니다.
  if (race) mocks.deleteReturning.mockResolvedValue([]);
  else mocks.findFirst.mockResolvedValue(undefined);
  // 실행·검증: 두 경우 모두 같은 결과입니다.
  expect(await deleteGuidebook(id)).toEqual(missing);
  expect(mocks.deleteReturning).toHaveBeenCalledTimes(race ? 1 : 0);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it.each(["", "가".repeat(301)])("제목 길이 오류는 업로드·DB보다 먼저 종료한다", async title => {
  // 준비: 제목의 두 경계입니다.
  const data = form(true); data.set("title", title);
  // 실행·검증: 고정 검증 결과입니다.
  expect(await createGuidebook(data)).toEqual({ success: false, error: title ? "제목은 300자 이하여야 합니다." : "제목을 입력해주세요." });
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("잘못된 수정 ID는 제목 검증과 DB보다 먼저 종료한다", async () => {
  // 준비·실행: ID와 제목이 모두 잘못되었습니다.
  expect(await updateGuidebook("bad", new FormData())).toEqual({ success: false, error: "유효하지 않은 가이드북 ID입니다." });
  // 검증: 조회하지 않습니다.
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
