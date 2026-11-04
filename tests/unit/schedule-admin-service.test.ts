/**
 * 관리자 일정 서비스의 재인가와 DTO 허용 목록을 검증합니다.
 * Web 액션을 우회한 호출에서도 저장소 접근을 막고 내부 관계 메타데이터를 제외합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({ listFacultyChoices: vi.fn(), listCohortChoices: vi.fn(),
  listEvents: vi.fn(), findEvent: vi.fn(), insertEvent: vi.fn(), insertEventWithSessions: vi.fn(),
  updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock("@/features/schedule/admin/repository", () => repository);
import * as service from "@/features/schedule/admin/service";
import type { ScheduleActor, ScheduleEventInput } from "@/features/schedule/admin/service";

const actor = { userId: "admin-1", role: "ADMIN" };
const id = "50000000-0000-4000-8000-000000000001";
const input: ScheduleEventInput = { eventDate: new Date("2026-10-31T23:30:00.000Z"),
  eventType: "CLASS", title: "합성 일정", isPublic: false, sessions: [] };
const dto = { id, eventDate: input.eventDate, endTime: null, eventType: "CLASS", title: "합성 일정",
  cohortId: "cohort-1", weekNumber: 3, description: null, isPublic: false,
  cohort: { id: "cohort-1", name: "합성 기수" }, sessions: [{ id: "session-1", category: "CLASSICS",
    facultyId: "faculty-1", content: "합성 내용", reportCategory: null, subTitle: null,
    subDescription: null, order: 2, faculty: { id: "faculty-1", name: "합성 교수" } }] };

beforeEach(() => vi.resetAllMocks());

const calls = [
  ["getAdminChoices", (a: ScheduleActor) => service.getAdminChoices(a)],
  ["listAdminEvents", (a: ScheduleActor) => service.listAdminEvents(a)],
  ["getAdminEvent", (a: ScheduleActor) => service.getAdminEvent(a, id)],
  ["createAdminEvent", (a: ScheduleActor) => service.createAdminEvent(a, input)],
  ["updateAdminEvent", (a: ScheduleActor) => service.updateAdminEvent(a, id, input)],
  ["deleteAdminEvent", (a: ScheduleActor) => service.deleteAdminEvent(a, id)],
] as const;
const deniedActors = [
  { userId: "member-1", role: "MEMBER" }, { userId: "faculty-1", role: "FACULTY" },
  { userId: "pending-1", role: "PENDING" }, { userId: "", role: "ADMIN" }, { userId: "", role: "" },
] as const;

for (const [name, call] of calls) {
  it.each(deniedActors)(`${name}는 $role/$userId 주체를 저장소 접근 전에 거부한다`, async (denied) => {
    // 준비: Web 세션을 거치지 않은 비관리자 또는 빈 주체입니다.
    // 실행: 모든 공개 서비스 함수에 동일한 거부 조건을 적용합니다.
    await expect(call(denied)).rejects.toThrow("SCHEDULE_ADMIN_REQUIRED");
    // 검증: 어느 저장소 함수도 호출하지 않습니다.
    for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled();
  });
}

it("재인가 목록은 모든 런타임 서비스 export를 포함한다", () => {
  // 준비: 공개 서비스 함수의 검사 목록입니다.
  // 실행: 런타임 export 목록을 읽습니다.
  const names = Object.keys(service).sort();
  // 검증: 새 함수를 인가 검사에서 누락하면 실패합니다.
  expect(names).toEqual(calls.map(([name]) => name).sort());
});

it.each(["목록", "상세"])("%s DTO는 일정·기수·세션·교수 내부 필드를 제외한다", async (kind) => {
  // 준비: 저장소가 허용 값 외에 내부 정보를 반환합니다.
  const row = { ...dto, createdAt: new Date(), internalSentinel: "내부 일정",
    cohort: { ...dto.cohort, googleSheetId: "내부 시트" },
    sessions: dto.sessions.map(s => ({ ...s, scheduleEventId: id,
      faculty: { ...s.faculty, currentPosition: "내부 약력" } })) };
  repository.listEvents.mockResolvedValue([row]);
  repository.findEvent.mockResolvedValue(row);
  // 실행: 관리자 조회 서비스를 호출합니다.
  const result = kind === "목록" ? (await service.listAdminEvents(actor))[0] : await service.getAdminEvent(actor, id);
  // 검증: 값 전체 비교로 허용 목록과 중첩 누출을 동시에 검사합니다.
  expect(result).toEqual(dto);
});

it("선택 DTO는 정렬된 표시 값만 교수 다음 기수 순서로 반환한다", async () => {
  // 준비: 내부 필드가 포함된 합성 선택 행입니다.
  repository.listFacultyChoices.mockResolvedValue([{ id: "faculty-1", name: "합성 교수", category: "CLASSICS", biography: "내부" }]);
  repository.listCohortChoices.mockResolvedValue([{ id: "cohort-1", name: "합성 기수", googleSheetId: "내부" }]);
  // 실행: 선택 목록 서비스를 호출합니다.
  const result = await service.getAdminChoices(actor);
  // 검증: 표시 필드와 순서를 고정합니다.
  expect(result).toEqual({ faculties: [{ id: "faculty-1", name: "합성 교수", category: "CLASSICS" }],
    cohorts: [{ id: "cohort-1", name: "합성 기수" }] });
  expect(repository.listFacultyChoices.mock.invocationCallOrder[0]).toBeLessThan(repository.listCohortChoices.mock.invocationCallOrder[0]);
});

it("신규 일정의 기존 세션 UUID는 어떤 쓰기보다 먼저 거부한다", async () => {
  // 준비: 다른 일정의 영속 세션 UUID를 신규 입력에 전달합니다.
  const request = { ...input, sessions: [{ serverId: id, category: "CLASSICS" as const, order: 0 }] };
  // 실행: 생성 서비스를 직접 호출합니다.
  const result = await service.createAdminEvent(actor, request);
  // 검증: 업무 규칙은 Web 어댑터 없이도 유지됩니다.
  expect(result).toEqual({ success: false, message: "새 일정에는 기존 세션을 연결할 수 없습니다." });
  expect(repository.insertEvent).not.toHaveBeenCalled();
  expect(repository.insertEventWithSessions).not.toHaveBeenCalled();
});

it("알려진 참조가 아닌 삭제 오류는 원본 오류 그대로 Web 로그 경계로 전달한다", async () => {
  // 준비: 과제 FK가 아닌 실제 오류 객체입니다.
  const error = new Error("합성 DB 장애");
  repository.deleteEvent.mockRejectedValue(error);
  // 실행: 삭제 서비스를 직접 호출합니다.
  const result = service.deleteAdminEvent(actor, id);
  // 검증: 알려진 참조 안내로 오인하거나 오류 객체를 바꾸지 않습니다.
  await expect(result).rejects.toBe(error);
});
