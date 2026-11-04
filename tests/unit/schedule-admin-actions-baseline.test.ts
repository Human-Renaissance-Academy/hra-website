/**
 * 일정 쓰기 액션의 미고정 결과와 웹 후처리를 구조 이동 전에 검증합니다.
 * 실제 입력 검증을 실행하고 DB 전송만 대체해 메시지·로그·이동 순서를 보존합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), execute: vi.fn(), insert: vi.fn(), values: vi.fn(),
  revalidate: vi.fn(), redirect: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute, insert: mocks.insert } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { createScheduleEvent, updateScheduleEvent } from "@/features/schedule/actions";
const id = "50000000-0000-4000-8000-000000000001";
const previous = { success: false, message: "" };

/** 정상 입력은 웹 FormData에서 그대로 검증하게 합니다. */
function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ eventDate: "2026-10-31", startTime: "23:30",
    eventType: "EVENT", title: "합성 일정", sessionsJson: "[]", ...overrides })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.execute.mockResolvedValue({ rows: [{ event_exists: true, sessions_valid: true }] });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

it.each(["생성", "수정"])("%s 성공은 두 캐시 경로 순서 다음에 목록으로 이동한다", async (kind) => {
  // 준비: 저장에 성공하는 합성 DB입니다.
  // 실행: 실제 쓰기 액션을 호출합니다.
  await expect(kind === "생성" ? createScheduleEvent(previous, form()) : updateScheduleEvent(id, previous, form()))
    .rejects.toThrow("REDIRECT:/admin/schedule");
  // 검증: 경로와 순서를 모두 고정합니다.
  expect(mocks.revalidate.mock.calls).toEqual([["/"], ["/admin/schedule"]]);
  expect(mocks.redirect.mock.calls).toEqual([["/admin/schedule"]]);
  expect(mocks.revalidate.mock.invocationCallOrder[1]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
});

it.each(["생성", "수정"])("%s 제목 오류는 고정 결과를 반환하고 저장·캐시·이동을 하지 않는다", async (kind) => {
  // 준비: 나머지 값은 정상이며 제목만 공백입니다.
  const data = form({ title: " " });
  // 실행: 생성 또는 수정 입력을 검증합니다.
  const result = kind === "생성" ? await createScheduleEvent(previous, data) : await updateScheduleEvent(id, previous, data);
  // 검증: 첫 필드 오류와 공통 안내를 보존합니다.
  expect(result).toEqual({ success: false, message: "입력값을 확인해주세요.", fieldErrors: { title: "제목을 입력해주세요." } });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([
  [{ event_exists: false, sessions_valid: true }, "일정을 찾을 수 없습니다. 목록을 새로고침해주세요."],
  [{ event_exists: true, sessions_valid: false }, "다른 일정의 세션이 포함되었거나 세션이 변경되었습니다. 새로고침 후 다시 확인해주세요."],
] as const)("수정 상태 %j는 기존 실패 메시지와 웹 후처리 차단을 유지한다", async (status, message) => {
  // 준비: DB가 누락 또는 세션 소유권 실패를 반환합니다.
  mocks.execute.mockResolvedValue({ rows: [status] });
  // 실행: 수정 액션을 호출합니다.
  const result = await updateScheduleEvent(id, previous, form());
  // 검증: 알려진 실패는 기록하거나 이동하지 않습니다.
  expect(result).toEqual({ success: false, message });
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
});

it("수정의 해석 불가 DB 응답은 동일한 정제 로그와 일반 실패로 처리한다", async () => {
  // 준비: 드라이버 응답 상태가 계약을 위반합니다.
  mocks.execute.mockResolvedValue({ rows: [{}] });
  // 실행: 실제 오류 처리 경로를 호출합니다.
  const result = await updateScheduleEvent(id, previous, form());
  // 검증: 기존 로그 문맥과 결과를 고정합니다.
  expect(result).toEqual({ success: false, message: "일정을 저장하지 못했습니다. 연결된 기록과 입력값을 확인한 뒤 다시 시도해주세요." });
  expect(mocks.log).toHaveBeenCalledWith("schedule/update", expect.objectContaining({ message: "일정 저장 결과를 확인할 수 없습니다." }),
    { eventId: id, sessionCount: 0 });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("잘못된 수정 ID는 폼 검증보다 먼저 기존 ID 오류를 반환한다", async () => {
  // 준비: ID와 폼 모두 잘못되었습니다.
  // 실행: 수정 액션을 호출합니다.
  const result = await updateScheduleEvent("invalid", previous, new FormData());
  // 검증: 검증 순서와 DB 차단을 고정합니다.
  expect(result).toEqual({ success: false, message: "유효하지 않은 ID입니다." });
  expect(mocks.execute).not.toHaveBeenCalled();
});
