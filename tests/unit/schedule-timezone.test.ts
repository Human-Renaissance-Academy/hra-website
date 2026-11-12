/**
 * 일정 raw SQL 저장 경로가 서버 로컬 시간대와 무관하게 같은 KST 벽시계를 저장하는지 검증합니다 (#125).
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  requireAdmin: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createScheduleEvent, updateScheduleEvent } from "@/features/schedule/actions";

const previous = { success: false, message: "" };
const id = "11111111-1111-4111-8111-111111111111";

function scheduleForm(withSession: boolean) {
  const form = new FormData();
  form.set("eventDate", "2026-10-14");
  form.set("startTime", "09:30");
  form.set("eventType", withSession ? "CLASS" : "EVENT");
  form.set("title", "일정");
  form.set("sessionsJson", withSession ? JSON.stringify([{ category: "CLASSICS", order: 0 }]) : "[]");
  return form;
}

describe("일정 raw SQL 시간대", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.execute.mockResolvedValue({ rows: [{ event_exists: true, sessions_valid: true }] });
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  });

  it.each([
    ["세션 있는 생성", () => createScheduleEvent(previous, scheduleForm(true))],
    ["세션 없는 수정", () => updateScheduleEvent(id, previous, scheduleForm(false))],
    ["세션 있는 수정", () => updateScheduleEvent(id, previous, scheduleForm(true))],
  ] as const)("%s 경로에서 시각을 ISO 문자열로 전달한다", async (_label, action) => {
    await expect(action()).rejects.toThrow("REDIRECT:/admin/schedule");
    const [statement] = mocks.execute.mock.calls[0];
    const query = new PgDialect().sqlToQuery(statement);
    expect(query.params).toContain("2026-10-14T09:30:00.000Z");
    expect(query.params.some((param) => param instanceof Date)).toBe(false);
    expect(query.sql).toContain("::timestamp");
  });
});
