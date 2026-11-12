/**
 * 관리자 일정 저장의 날짜·시각 입력 검증 테스트입니다 (#124).
 * 잘못된 입력은 DB 호출 전에 필드 오류로 반환되어야 합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("DB_ACCESSED"); } }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createScheduleEvent } from "@/features/schedule/actions";

function scheduleForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    eventDate: "2026-10-14",
    startTime: "09:30",
    endTime: "10:30",
    eventType: "EVENT",
    title: "일정",
    ...overrides,
  })) form.set(key, value);
  return form;
}

describe("일정 날짜·시간 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  });

  it.each(["2026-13-45", "2026-02-30", "0001-01-01", "not-a-date"])("잘못된 날짜 %s를 거부한다", async (eventDate) => {
    const result = await createScheduleEvent({ success: false, message: "" }, scheduleForm({ eventDate }));
    expect(result.fieldErrors?.eventDate).toBe("올바른 날짜를 입력해주세요.");
  });

  it.each(["25:99", "9:30", "abc"])("잘못된 시작 시각 %s를 거부한다", async (startTime) => {
    const result = await createScheduleEvent({ success: false, message: "" }, scheduleForm({ startTime }));
    expect(result.fieldErrors?.startTime).toBe("올바른 시작 시간을 입력해주세요.");
  });

  it("잘못된 종료 시각을 거부한다", async () => {
    const result = await createScheduleEvent({ success: false, message: "" }, scheduleForm({ endTime: "24:00" }));
    expect(result.fieldErrors?.endTime).toBe("올바른 종료 시간을 입력해주세요.");
  });

  it("정상 날짜와 시각은 저장 단계까지 도달한다", async () => {
    await expect(createScheduleEvent({ success: false, message: "" }, scheduleForm()))
      .rejects.toThrow("DB_ACCESSED");
  });
});
