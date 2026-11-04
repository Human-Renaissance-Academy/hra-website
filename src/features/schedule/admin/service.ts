/**
 * 관리자 일정의 업무 규칙과 재인가를 소유하는 Application Service입니다.
 * 세션 유지·과제 참조 거부와 최소 DTO를 제공하며 웹 캐시·이동·로그는 어댑터에 맡깁니다.
 */
import "server-only";
import { z } from "zod/v4";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import * as repository from "./repository";
import type { ScheduleEventInput } from "./repository";

export type ScheduleActor = { userId: string; role: string };
export type { ScheduleEventInput } from "./repository";
type ScheduleResult = { readonly success: boolean; readonly message: string };

/** Web 이외의 호출에서도 홈페이지 관리자만 업무를 수행하도록 다시 확인합니다. */
function assertAdmin(actor: ScheduleActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("SCHEDULE_ADMIN_REQUIRED");
  }
}

/** 내부 관계 메타데이터를 제외하고 관리자 화면에서 사용하는 값만 제공합니다. */
function eventDto(event: NonNullable<Awaited<ReturnType<typeof repository.findEvent>>>) {
  return {
    id: event.id, eventDate: event.eventDate, endTime: event.endTime,
    eventType: event.eventType, title: event.title, cohortId: event.cohortId,
    weekNumber: event.weekNumber, description: event.description, isPublic: event.isPublic,
    cohort: event.cohort ? { id: event.cohort.id, name: event.cohort.name } : null,
    sessions: event.sessions.map(s => ({ id: s.id, category: s.category, facultyId: s.facultyId,
      content: s.content, reportCategory: s.reportCategory, subTitle: s.subTitle,
      subDescription: s.subDescription, order: s.order,
      faculty: s.faculty ? { id: s.faculty.id, name: s.faculty.name } : null })),
  };
}

/** 두 페이지의 선택 조회 순서를 교수 다음 기수로 유지합니다. */
export async function getAdminChoices(actor: ScheduleActor) {
  assertAdmin(actor);
  const faculties = await repository.listFacultyChoices();
  const cohorts = await repository.listCohortChoices();
  return { faculties: faculties.map(f => ({ id: f.id, name: f.name, category: f.category })),
    cohorts: cohorts.map(c => ({ id: c.id, name: c.name })) };
}

/** 목록은 비공개를 포함한 전체 일정의 기존 정렬 결과를 제공합니다. */
export async function listAdminEvents(actor: ScheduleActor) {
  assertAdmin(actor);
  return (await repository.listEvents()).map(eventDto);
}

/** 누락 상세는 기존 findFirst 결과인 undefined를 유지합니다. */
export async function getAdminEvent(actor: ScheduleActor, id: string) {
  assertAdmin(actor);
  const event = await repository.findEvent(id);
  return event ? eventDto(event) : undefined;
}

/** 새 일정은 기존 UUID를 채택하지 않으며 수업 세션만 함께 생성합니다. */
export async function createAdminEvent(actor: ScheduleActor, input: ScheduleEventInput): Promise<ScheduleResult | null> {
  assertAdmin(actor);
  if (input.sessions.some(session => session.serverId)) {
    return { success: false, message: "새 일정에는 기존 세션을 연결할 수 없습니다." };
  }
  if (input.eventType === "CLASS" && input.sessions.length > 0) {
    await repository.insertEventWithSessions(input);
  } else {
    await repository.insertEvent({ eventDate: input.eventDate, endTime: input.endTime,
      eventType: input.eventType, title: input.title, cohortId: input.cohortId,
      weekNumber: input.weekNumber, description: input.description, isPublic: input.isPublic });
  }
  return null;
}

/** 소유 세션 UUID의 유지·추가·제거는 저장소의 단일 원자 CTE로 수행합니다. */
export async function updateAdminEvent(actor: ScheduleActor, id: string, input: ScheduleEventInput): Promise<ScheduleResult | null> {
  assertAdmin(actor);
  // 행사 전환도 전달 UUID의 소유권부터 확인하도록 모든 세션을 전달합니다.
  const sessionPayload = input.sessions.map(session => ({
    id: session.serverId ?? null,
    category: session.category,
    faculty_id: session.facultyId ?? null,
    content: session.content ?? null,
    report_category: session.reportCategory ?? null,
    sub_title: session.subTitle ?? null,
    sub_description: session.subDescription ?? null,
    order: session.order,
  }));
  try {
    const saved = await repository.updateEvent(id, input, sessionPayload);
    const status = z.object({ event_exists: z.boolean(), sessions_valid: z.boolean() }).safeParse(saved.rows[0]);
    if (!status.success) throw new Error("일정 저장 결과를 확인할 수 없습니다.");
    if (!status.data.event_exists) return { success: false, message: "일정을 찾을 수 없습니다. 목록을 새로고침해주세요." };
    if (!status.data.sessions_valid) return { success: false, message: "다른 일정의 세션이 포함되었거나 세션이 변경되었습니다. 새로고침 후 다시 확인해주세요." };
  } catch (error) {
    // 알려진 과제 세션 RESTRICT만 처리하고 그 밖의 오류는 웹의 기존 정제 로그로 전달합니다.
    // PostgreSQL 18의 RESTRICT 위반은 23001이며, 이전 서버의 23503도 같은 정책으로 처리합니다.
    // SQLSTATE와 제약명이 함께 일치할 때만 안내로 바꿔 다른 FK 오류를 잘못 분류하지 않습니다.
    if (["23001", "23503"].some(code => isConstraintViolation(error, code, "assignments_schedule_session_id_schedule_sessions_id_fk"))) {
      return { success: false, message: "과제에 연결된 세션은 삭제할 수 없습니다. 해당 세션을 유지한 뒤 다시 저장해주세요." };
    }
    throw error;
  }
  return null;
}

/** 과제의 일정·세션 참조 거부만 고정 안내로 바꾸며 다른 오류는 숨겨 분류하지 않습니다. */
export async function deleteAdminEvent(actor: ScheduleActor, id: string): Promise<ScheduleResult> {
  assertAdmin(actor);
  try {
    const deleted = await repository.deleteEvent(id);
    if (deleted.length === 0) {
      return { success: false, message: "일정을 찾을 수 없습니다. 목록을 새로고침해주세요." };
    }
  } catch (error) {
    const assignmentConstraints = [
      "assignments_schedule_event_id_schedule_events_id_fk",
      "assignments_schedule_session_id_schedule_sessions_id_fk",
    ];
    // RESTRICT 위반은 PostgreSQL 18에서 23001, 이전 서버에서 23503이므로 두 코드를 모두 받되
    // SQLSTATE와 과제 FK 제약명이 함께 일치해야 고정 안내로 바꿉니다.
    if (["23503", "23001"].some(code => assignmentConstraints.some(constraint =>
      isConstraintViolation(error, code, constraint)
    ))) {
      return { success: false, message: "과제에 연결된 일정이나 세션은 삭제할 수 없습니다. 연결된 과제를 확인해주세요." };
    }
    throw error;
  }
  return { success: true, message: "일정이 삭제되었습니다." };
}
