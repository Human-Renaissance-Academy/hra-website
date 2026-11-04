/**
 * 공지 Web 액션의 입력 오류, 저장 필드와 캐시·이동 순서를 이동 전부터 검증합니다.
 * SQL 경합은 별도 PostgreSQL 테스트에서 실제 행 잠금으로 검증합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), insert: vi.fn(), values: vi.fn(), find: vi.fn(),
  update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(),
  delete: vi.fn(), deleteWhere: vi.fn(), cache: vi.fn(), redirect: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: {
  insert: mocks.insert, update: mocks.update, delete: mocks.delete,
  query: { notices: { findFirst: mocks.find } },
} }));
import { createNotice, updateNotice, deleteNotice, togglePin, toggleStatus } from "@/features/notices/actions";

const id = "10000000-0000-4000-8000-000000000001";
const input = { title: "합성 제목", content: "합성 본문", status: "PUBLISHED", pinned: true };

/** 입력 정규화를 확인할 수 있도록 문자열 주변 공백을 포함합니다. */
function form(pinned = "on") {
  const data = new FormData();
  data.set("title", `  ${input.title}  `);
  data.set("content", `  ${input.content}  `);
  data.set("status", " PUBLISHED ");
  data.set("pinned", pinned);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.find.mockResolvedValue({ id });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

it.each([createNotice, (data: FormData) => updateNotice(id, data)])("본문 검증 오류는 저장과 캐시를 시작하지 않는다", async action => {
  // 준비: 제목은 유효하지만 공백 본문입니다.
  const data = form(); data.set("content", " ");
  // 실행: 생성 또는 수정 액션을 호출합니다.
  const result = await action(data);
  // 확인: 기존 필드 오류와 안내를 보존합니다.
  expect(result).toEqual({ success: false, message: "내용을 입력해주세요.", fieldErrors: { content: "내용을 입력해주세요." } });
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.cache).not.toHaveBeenCalled();
});

it.each([createNotice, (data: FormData) => updateNotice(id, data)])("제목 길이 오류를 동일하게 반환한다", async action => {
  // 준비: 최대 길이를 초과한 제목입니다.
  const data = form(); data.set("title", "가".repeat(301));
  // 실행: 폼 검증을 수행합니다.
  const result = await action(data);
  // 확인: 쓰기 없이 기존 오류를 반환합니다.
  expect(result).toEqual({ success: false, message: "제목은 300자 이하여야 합니다.", fieldErrors: { title: "제목은 300자 이하여야 합니다." } });
  expect(mocks.cache).not.toHaveBeenCalled();
});

it("빈 제목의 첫 오류와 상태 enum 오류를 순서대로 보존한다", async () => {
  // 준비: 제목·본문·상태가 모두 비어 있습니다.
  const data = new FormData();
  // 실행: 생성 폼을 검증합니다.
  const result = await createNotice(data);
  // 확인: Zod v4의 기존 enum 오류도 그대로 유지합니다.
  expect(result).toEqual({ success: false, message: "제목을 입력해주세요.", fieldErrors: {
    title: "제목을 입력해주세요.", content: "내용을 입력해주세요.",
    status: 'Invalid option: expected one of "DRAFT"|"PUBLISHED"',
  } });
  expect(mocks.insert).not.toHaveBeenCalled();
});

it.each(["on", "true", "false", "off", ""])("생성 시 pinned=%s의 정규화와 작성자·이동 순서를 유지한다", async pinned => {
  // 준비: 정규화 대상의 합성 폼입니다.
  const data = form(pinned);
  // 실행: 생성 후 redirect 예외까지 관찰합니다.
  await expect(createNotice(data)).rejects.toThrow("REDIRECT:/admin/notices");
  // 확인: 기존 insert 값과 Web 후처리 순서입니다.
  expect(mocks.values).toHaveBeenCalledExactlyOnceWith({ ...input, pinned: pinned === "on" || pinned === "true", authorId: "admin-1" });
  expect(mocks.cache.mock.calls).toEqual([["/admin/notices"], ["/notices"]]);
  expect(mocks.cache.mock.invocationCallOrder[1]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});

it("수정은 네 필드만 저장하고 캐시 뒤 동일 목록으로 이동한다", async () => {
  // 준비: 존재하는 행과 유효한 폼입니다.
  // 실행: 실제 수정 액션입니다.
  await expect(updateNotice(id, form())).rejects.toThrow("REDIRECT:/admin/notices");
  // 확인: 작성자를 덮어쓰지 않습니다.
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(input);
  expect(mocks.find.mock.calls[0][0].columns).toEqual({ id: true });
  expect(mocks.cache.mock.calls).toEqual([["/admin/notices"], ["/notices"]]);
  expect(mocks.cache.mock.invocationCallOrder[1]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});

it.each(["조회 누락", "수정 직전 삭제"])("수정 %s는 성공 후처리를 실행하지 않는다", async kind => {
  // 준비: 조회 누락 또는 UPDATE의 빈 RETURNING입니다.
  if (kind === "조회 누락") mocks.find.mockResolvedValue(undefined);
  else mocks.returning.mockResolvedValue([]);
  // 실행: 수정 명령입니다.
  const result = await updateNotice(id, form());
  // 확인: 두 실패 경로의 동일 안내와 캐시 생략입니다.
  expect(result).toEqual({ success: false, message: "공지사항을 찾을 수 없습니다." });
  expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  if (kind === "조회 누락") expect(mocks.update).not.toHaveBeenCalled();
});

it.each([deleteNotice, togglePin, toggleStatus, (value: string) => updateNotice(value, new FormData())])("잘못된 ID는 폼·SQL보다 먼저 거부한다", async action => {
  // 준비: UUID가 아닌 경로값입니다.
  // 실행: 각 ID 액션을 호출합니다.
  const result = await action("bad-id");
  // 확인: 기존 안내와 DB 미접근입니다.
  expect(result).toEqual({ success: false, message: "잘못된 공지사항 ID입니다." });
  expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});

it("삭제는 기존 성공 문구와 캐시 순서를 유지하고 이동하지 않는다", async () => {
  // 준비: 존재하는 행입니다.
  // 실행: 삭제 명령입니다.
  const result = await deleteNotice(id);
  // 확인: 삭제의 고정 결과입니다.
  expect(result).toEqual({ success: true, message: "공지사항이 삭제되었습니다." });
  expect(mocks.deleteWhere).toHaveBeenCalledOnce();
  expect(mocks.cache.mock.calls).toEqual([["/admin/notices"], ["/notices"]]);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("누락 삭제는 삭제 SQL과 캐시를 실행하지 않는다", async () => {
  // 준비: 존재 확인이 실패합니다.
  mocks.find.mockResolvedValue(undefined);
  // 실행: 삭제 명령입니다.
  const result = await deleteNotice(id);
  // 확인: 기존 실패 안내입니다.
  expect(result).toEqual({ success: false, message: "공지사항을 찾을 수 없습니다." });
  expect(mocks.delete).not.toHaveBeenCalled(); expect(mocks.cache).not.toHaveBeenCalled();
});

it.each([
  { action: togglePin, saved: { pinned: true }, message: "공지사항을 고정했습니다." },
  { action: togglePin, saved: { pinned: false }, message: "공지사항 고정을 해제했습니다." },
  { action: toggleStatus, saved: { status: "PUBLISHED" }, message: "공지사항을 게시했습니다." },
  { action: toggleStatus, saved: { status: "DRAFT" }, message: "공지사항을 임시저장 상태로 변경했습니다." },
])("반전은 저장된 $message 결과와 캐시 순서를 유지한다", async ({ action, saved, message }) => {
  // 준비: UPDATE RETURNING이 반환한 저장값입니다.
  mocks.returning.mockResolvedValue([saved]);
  // 실행: 실제 반전 Web 액션입니다.
  const result = await action(id);
  // 확인: 저장값 기반 안내와 후처리 순서입니다.
  expect(result).toEqual({ success: true, message });
  expect(mocks.cache.mock.calls).toEqual([["/admin/notices"], ["/notices"]]);
  expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([togglePin, toggleStatus])("누락 반전은 안내만 반환하고 캐시를 생략한다", async action => {
  // 준비: 빈 RETURNING입니다.
  mocks.returning.mockResolvedValue([]);
  // 실행: 반전 액션입니다.
  const result = await action(id);
  // 확인: 누락 안내와 후처리 생략입니다.
  expect(result).toEqual({ success: false, message: "공지사항을 찾을 수 없습니다." });
  expect(mocks.cache).not.toHaveBeenCalled();
});
