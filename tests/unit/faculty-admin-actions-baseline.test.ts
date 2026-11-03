// @vitest-environment node
/** 교수진 액션의 검증 결과·업로드 순서·저장 후 웹 효과를 이동 전에 고정합니다. */
import { beforeEach, expect, it, vi } from "vitest";
import { syntheticPng } from "../support/synthetic-image";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), existing: vi.fn(), insert: vi.fn(), set: vi.fn(),
  returning: vi.fn(), remove: vi.fn(), upload: vi.fn(), reference: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(), events: Array<string>(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server-upload-intent", () => ({ uploadWithOwnedIntent: mocks.upload }));
vi.mock("@/lib/faculty-upload-server", () => ({ validateFacultyImageReference: mocks.reference }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select,
  insert: () => ({ values: mocks.insert }),
  update: () => ({ set: mocks.set }),
  delete: () => ({ where: mocks.remove }),
} }));

import { createFaculty, updateFaculty, deleteFaculty } from "@/features/faculty/actions";
const id = "81000000-0000-4000-8000-000000000001";
/** 공백 정규화와 기본 순서를 함께 확인할 합성 입력입니다. */
function form() {
  const data = new FormData();
  data.set("name", " 합성 교수 "); data.set("category", "CLASSICS");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.events = [];
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.existing }) });
  mocks.existing.mockImplementation(async () => { mocks.events.push("read"); return [{ imageUrl: null }]; });
  mocks.set.mockReturnValue({ where: () => ({ returning: mocks.returning }) });
  mocks.returning.mockImplementation(async () => { mocks.events.push("update"); return [{ id }]; });
  mocks.insert.mockImplementation(async () => { mocks.events.push("insert"); });
  mocks.reference.mockImplementation(async () => { mocks.events.push("reference"); return true; });
  mocks.upload.mockImplementation(async () => { mocks.events.push("upload"); return "https://fixture.invalid/new.png"; });
  mocks.revalidate.mockImplementation(path => { mocks.events.push(`revalidate:${path}`); });
  mocks.redirect.mockImplementation(path => { mocks.events.push(`redirect:${path}`); throw new Error("REDIRECT"); });
});

it.each([createFaculty, (data: FormData) => updateFaculty(id, data)])("빈 이름은 같은 첫 메시지와 필드 오류를 돌려준다", async run => {
  // 준비: 이름이 없는 유효 분류 입력입니다.
  const data = form(); data.set("name", " ");
  // 실행·확인: 검증이 저장과 업로드를 차단합니다.
  expect(await run(data)).toEqual({ success: false, message: "이름을 입력해주세요.", fieldErrors: { name: "이름을 입력해주세요." } });
  expect(mocks.events).toEqual([]);
});

it.each([
  ["name", "가".repeat(101), "이름은 100자 이하여야 합니다."],
  ["currentPosition", "가".repeat(501), "현직은 500자 이하여야 합니다."],
  ["formerPosition", "가".repeat(501), "전직은 500자 이하여야 합니다."],
  ["order", "숫자 아님", "순서는 숫자여야 합니다."],
  ["order", "1.5", "순서는 정수여야 합니다."],
])("%s 입력 오류 메시지를 유지한다", async (field, value, message) => {
  // 준비: 한 필드만 계약을 어긴 입력입니다.
  const data = form(); data.set(field, value);
  // 실행·확인: 해당 필드의 첫 오류만 반환합니다.
  expect(await createFaculty(data)).toEqual({ success: false, message, fieldErrors: { [field]: message } });
  expect(mocks.events).toEqual([]);
});

it("잘못된 수정 ID는 입력 검증·조회 없이 같은 메시지를 반환한다", async () => {
  // 준비·실행·확인: 잘못된 식별자는 DB에 도달하지 않습니다.
  expect(await updateFaculty("잘못된-ID", new FormData())).toEqual({ success: false, message: "잘못된 교수진 ID입니다." });
  expect(mocks.events).toEqual([]);
});

it("생성은 정규화·기본값과 저장 이후 재검증·이동 순서를 유지한다", async () => {
  // 준비·실행: 이미지 없는 생성입니다.
  await expect(createFaculty(form())).rejects.toThrow("REDIRECT");
  // 확인: 기본값과 웹 후처리는 원래 순서입니다.
  expect(mocks.insert).toHaveBeenCalledWith({ name: "합성 교수", category: "CLASSICS", currentPosition: null,
    formerPosition: null, imageUrl: null, order: 0 });
  expect(mocks.events).toEqual(["insert", "revalidate:/admin/faculty", "revalidate:/faculty", "redirect:/admin/faculty"]);
});

it("직접 사진 수정은 참조 확인·조회·조건부 저장 뒤 이동한다", async () => {
  // 준비: 완료 URL과 같은 대상 ID입니다.
  const data = form(); data.set("uploadedImageUrl", "https://fixture.invalid/direct.png"); data.set("uploadTargetId", id);
  // 실행: 성공한 수정입니다.
  await expect(updateFaculty(id, data)).rejects.toThrow("REDIRECT");
  // 확인: 참조 확인이 조회보다 앞서고 서버 업로드는 생략합니다.
  expect(mocks.events).toEqual(["reference", "read", "update", "revalidate:/admin/faculty", "revalidate:/faculty", "redirect:/admin/faculty"]);
  expect(mocks.reference).toHaveBeenCalledWith(id, "admin-1", "https://fixture.invalid/direct.png");
});

it("서버 사진 수정은 기존 행 조회 뒤 업로드하고 저장한다", async () => {
  // 준비: 실제 합성 PNG입니다.
  const data = form(); const image = new File([syntheticPng()], "사진.png", { type: "image/png" }); data.set("image", image);
  // 실행: 업로드가 필요한 수정입니다.
  await expect(updateFaculty(id, data)).rejects.toThrow("REDIRECT");
  // 확인: 조회 이전 업로드나 저장 이전 이동은 실패합니다.
  expect(mocks.events).toEqual(["read", "upload", "update", "revalidate:/admin/faculty", "revalidate:/faculty", "redirect:/admin/faculty"]);
  expect(mocks.upload).toHaveBeenCalledWith({ namespace: "faculty", extension: "png", body: image,
    contentType: "image/png", uploadedById: "admin-1" });
});

it("없는 교수는 업로드·수정·재검증 없이 같은 결과를 반환한다", async () => {
  // 준비: 기존 행이 없습니다.
  mocks.existing.mockResolvedValueOnce([]);
  // 실행·확인: 누락 메시지를 반환합니다.
  expect(await updateFaculty(id, form())).toEqual({ success: false, message: "교수진을 찾을 수 없습니다." });
  expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("조건부 수정 0행은 충돌 메시지를 반환하고 재검증하지 않는다", async () => {
  // 준비: 동시 변경으로 조건이 맞지 않습니다.
  mocks.returning.mockResolvedValueOnce([]);
  // 실행·확인: 충돌을 성공으로 바꾸지 않습니다.
  expect(await updateFaculty(id, form())).toEqual({ success: false, message: "교수진 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." });
  expect(mocks.revalidate).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it("잘못된 삭제 ID는 멱등하게 종료하고 재검증하지 않는다", async () => {
  // 준비·실행·확인: 잘못된 입력은 아무 부작용이 없습니다.
  expect(await deleteFaculty("잘못된-ID")).toBeUndefined();
  expect(mocks.remove).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
});
