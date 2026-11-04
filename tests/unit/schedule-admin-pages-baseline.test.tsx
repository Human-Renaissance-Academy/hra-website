/**
 * 구조 이동 전 실제 일정 페이지와 관리자 조회 액션의 경계를 고정합니다.
 * 조회 조건·정렬·선택 투영과 잘못된 경로의 DB 접근 차단을 합성 자료로 검증합니다.
 */
import { isValidElement, type ComponentProps } from "react";
import { PgDialect, type AnyPgColumn, type PgTable } from "drizzle-orm/pg-core";
import { getTableName, type SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, query: { scheduleEvents: {
  findMany: mocks.findMany, findFirst: mocks.findFirst,
} } } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import NewPage from "@/app/(admin)/admin/schedule/new/page";
import EditPage from "@/app/(admin)/admin/schedule/[id]/page";
import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";
import { getAllScheduleEvents, getScheduleEvent } from "@/features/schedule/actions";

const id = "50000000-0000-4000-8000-000000000001";
const event = { id, eventDate: new Date("2026-10-31T23:30:00.000Z"), endTime: null,
  eventType: "CLASS", title: "합성 일정", cohortId: null, weekNumber: null,
  description: null, isPublic: false, cohort: null, sessions: [] };
const selections: { fields: string[]; table: string; order: string }[] = [];

/** 실제 폼 요소를 검사하므로 페이지가 다른 props를 전달하면 실패합니다. */
function propsOf(element: Awaited<ReturnType<typeof NewPage>>) {
  if (!isValidElement<ComponentProps<typeof ScheduleForm>>(element) || element.type !== ScheduleForm) {
    throw new Error("일정 폼이 없습니다.");
  }
  return element.props;
}

beforeEach(() => {
  vi.resetAllMocks();
  selections.length = 0;
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.findFirst.mockResolvedValue(event);
  mocks.findMany.mockResolvedValue([event]);
  mocks.select.mockImplementation((fields: Record<string, AnyPgColumn>) => ({ from: (table: PgTable) => ({
    orderBy: async (order: SQL) => {
      selections.push({ fields: Object.keys(fields), table: getTableName(table), order: new PgDialect().sqlToQuery(order).sql });
      return [];
    },
  }) }));
});

it.each(["등록", "수정"])("%s 페이지는 교수 다음 기수 조회와 정확한 선택 필드를 유지한다", async (kind) => {
  // 준비: 두 페이지 모두 빈 선택 목록을 반환하는 저장소를 사용합니다.
  // 실행: 실제 페이지 함수를 호출합니다.
  const element = kind === "등록" ? await NewPage() : await EditPage({ params: Promise.resolve({ id }) });
  // 검증: 정렬과 호출 순서를 바꾸거나 필드를 추가하면 실패합니다.
  expect(selections).toEqual([
    { fields: ["id", "name", "category"], table: "faculty", order: '"faculty"."name" asc' },
    { fields: ["id", "name"], table: "cohorts", order: '"cohorts"."order" asc' },
  ]);
  expect(propsOf(element)).toMatchObject({ title: kind === "등록" ? "새 일정 등록" : "일정 수정",
    submitLabel: kind === "등록" ? "등록" : "저장", faculties: [], cohorts: [] });
});

it("수정 페이지는 월말 벽시계와 빈 세션 배열을 그대로 전달한다", async () => {
  // 준비: 23:30의 세션 없는 수업입니다.
  // 실행: 수정 페이지를 호출합니다.
  const element = await EditPage({ params: Promise.resolve({ id }) });
  // 검증: 시간대 보정이나 기본 세션 추가를 검출합니다.
  expect(propsOf(element).defaultValues).toEqual({ eventDate: "2026-10-31", startTime: "23:30",
    endTime: null, eventType: "CLASS", title: "합성 일정", cohortId: null, weekNumber: null,
    description: null, isPublic: false, sessions: [] });
});

it("잘못된 페이지 UUID는 어떤 DB 접근보다 먼저 notFound로 끝난다", async () => {
  // 준비: UUID가 아닌 합성 경로입니다.
  // 실행: 실제 경로 진입을 검사합니다.
  await expect(EditPage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("NOT_FOUND");
  // 검증: 선택 목록뿐 아니라 일정 조회도 시작되지 않습니다.
  expect(mocks.findFirst).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
});

it("관리자 목록은 비공개를 포함한 전체 일정 역순과 세션 오름차순을 유지한다", async () => {
  // 준비: 비공개 합성 일정이 조회됩니다.
  // 실행: 목록 액션을 호출합니다.
  const rows = await getAllScheduleEvents();
  // 검증: 월·공개 조건이나 제한이 추가되면 실패합니다.
  const options = mocks.findMany.mock.calls[0][0];
  expect(options.where).toBeUndefined();
  expect(options.limit).toBeUndefined();
  expect(new PgDialect().sqlToQuery(options.orderBy[0]).sql).toBe('"schedule_events"."event_date" desc');
  expect(new PgDialect().sqlToQuery(options.with.sessions.orderBy[0]).sql).toBe('"schedule_sessions"."order" asc');
  expect(rows[0]).toMatchObject({ id, isPublic: false });
});

it("상세 액션은 UUID 동등 조건과 세션 순서를 유지한다", async () => {
  // 준비: 유효한 UUID의 합성 일정입니다.
  // 실행: 상세 조회 액션을 호출합니다.
  await getScheduleEvent(id);
  // 검증: 조건과 정렬이 동일한지 실제 SQL을 검사합니다.
  const options = mocks.findFirst.mock.calls[0][0];
  expect(new PgDialect().sqlToQuery(options.where)).toMatchObject({ sql: '"schedule_events"."id" = $1', params: [id] });
  expect(new PgDialect().sqlToQuery(options.with.sessions.orderBy[0]).sql).toBe('"schedule_sessions"."order" asc');
});
