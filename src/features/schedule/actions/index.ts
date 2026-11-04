/**
 * 일정 관리 웹 서버 액션입니다.
 * FormData·KST 벽시계 입력과 웹 세션을 서비스에 전달하고 캐시·이동·정제 로그를 처리합니다.
 * 관리자 일정 폼 및 공개 월별 캘린더에서 사용합니다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { logServerError } from "@/lib/errors";
import { parseCalendarMonth } from "@/lib/query-params";
import { listPublicScheduleMonth, serializePublicScheduleEvents } from "@/features/schedule/public/service";
import { createAdminEvent, deleteAdminEvent, getAdminEvent, listAdminEvents, updateAdminEvent } from "@/features/schedule/admin/service";

// 세션 슬롯 하나에 대한 유효성 검사
const sessionSchema = z.object({
  // 폼의 로컬 키와 구분해 기존 세션의 영속 UUID만 받는다.
  serverId: z.string().uuid().transform(value => value.toLowerCase()).optional(),
  category: z.enum(["CLASSICS", "ENGLISH", "SPEECH", "SPECIAL_LECTURE", "CASE_STUDY"]),
  facultyId: z.string().uuid().optional().nullable(),
  content: z.string().trim().max(500).optional().nullable(),
  reportCategory: z.string().trim().max(50).optional().nullable(), // 케이스스터디 분야
  subTitle: z.string().trim().max(300).optional().nullable(),       // 케이스스터디 제목
  subDescription: z.string().trim().optional().nullable(),          // 케이스스터디 설명
  order: z.number().int().default(0),
});

// 이벤트 폼 전체 유효성 검사
const scheduleEventFormSchema = z.object({
  // Date.UTC는 00~99년을 1900년대로 해석하므로 운영 가능한 연도도 제한한다.
  eventDate: z.iso.date("올바른 날짜를 입력해주세요.")
    .refine((value) => Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100,
      "올바른 날짜를 입력해주세요."),
  startTime: z.iso.time({ precision: -1, error: "올바른 시작 시간을 입력해주세요." }), // "HH:MM"
  endTime: z.iso.time({ precision: -1, error: "올바른 종료 시간을 입력해주세요." }).optional().nullable(),
  eventType: z.enum(["CLASS", "EVENT"]),
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  cohortId: z.string().uuid().optional().nullable(),
  weekNumber: z.number().int().positive().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  isPublic: z.boolean().default(true),
  sessions: z.array(sessionSchema).default([]).superRefine((sessions, context) => {
    const ids = new Set<string>();
    for (const [index, session] of sessions.entries()) {
      if (!session.serverId) continue;
      if (ids.has(session.serverId)) context.addIssue({ code: "custom", path: [index, "serverId"], message: "같은 세션을 중복해서 저장할 수 없습니다." });
      ids.add(session.serverId);
    }
  }),
});

// 액션 반환 타입
export type ScheduleActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

function normalizeText(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * "YYYY-MM-DD" + "HH:MM" → UTC Date 변환
 * Date.UTC() 사용으로 서버 타임존(dev=KST, prod=UTC) 차이를 없애고
 * 항상 동일한 UTC 값을 저장한다.
 * 관리자가 입력한 날짜/시간은 한국 달력 기준이므로 날짜 단위로만 UTC에 고정한다.
 */
function buildEventDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function parseWeekNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

// 잘못된 JSON을 빈 배열로 해석하면 기존 세션이 삭제될 수 있어 검증 오류로 돌린다.
function parseSessions(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
}

function parseFormData(formData: FormData) {
  return scheduleEventFormSchema.safeParse({
    eventDate: normalizeText(formData.get("eventDate")),
    startTime: normalizeText(formData.get("startTime")),
    endTime: normalizeText(formData.get("endTime")) || null,
    eventType: normalizeText(formData.get("eventType")),
    title: normalizeText(formData.get("title")),
    cohortId: normalizeText(formData.get("cohortId")) || null,
    weekNumber: parseWeekNumber(formData.get("weekNumber")),
    description: normalizeText(formData.get("description")) || null,
    isPublic: parseBoolean(formData.get("isPublic")),
    sessions: parseSessions(formData.get("sessionsJson")),
  });
}

/** 특정 연월의 공개 일정 + 세션 목록 조회 (인증 불필요) */
export async function getScheduleEvents(year: number, month: number) {
  // 서버 액션은 클라이언트에서 직접 호출할 수 있으므로 조회 인자도 범위 검증한다.
  const valid = parseCalendarMonth(year, month);
  return listPublicScheduleMonth(valid.year, valid.month);
}

/** 클라이언트 컴포넌트용 월별 공개 일정 ISO 직렬화 */
export async function getSerializedScheduleEvents(year: number, month: number) {
  const events = await getScheduleEvents(year, month);
  return serializePublicScheduleEvents(events);
}

/** 전체 일정 목록 조회 (관리자 페이지 목록 화면용) */
export async function getAllScheduleEvents() {
  const session = await requireAdmin();
  return listAdminEvents({ userId: session.user.id, role: session.user.role });
}

/** 단일 이벤트 상세 조회 (관리자 수정 폼용) */
export async function getScheduleEvent(id: string) {
  const session = await requireAdmin();
  // UUID 오류가 DB의 cast 오류 및 원본 ID 로그로 이어지지 않도록 사전 검증합니다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return null;
  return getAdminEvent({ userId: session.user.id, role: session.user.role }, parsedId.data);
}

/** 일정 생성 입력을 검증하고 저장 후 기존 캐시 순서와 이동 경로를 유지합니다. */
export async function createScheduleEvent(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const session = await requireAdmin();
  const result = parseFormData(formData);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, message: "입력값을 확인해주세요.", fieldErrors };
  }

  const { sessions, startTime, endTime, ...eventData } = result.data;
  const eventDate = buildEventDate(eventData.eventDate, startTime);
  const failure = await createAdminEvent({ userId: session.user.id, role: session.user.role },
    { ...eventData, eventDate, endTime, sessions });
  if (failure) return failure;

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  redirect("/admin/schedule");
}

/** 일정 수정의 입력과 웹 후처리를 담당하고 세션 보존은 서비스에 맡깁니다. */
export async function updateScheduleEvent(
  id: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  const session = await requireAdmin();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { success: false, message: "유효하지 않은 ID입니다." };

  const result = parseFormData(formData);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, message: "입력값을 확인해주세요.", fieldErrors };
  }

  const { sessions, startTime, endTime, ...eventData } = result.data;
  const eventDate = buildEventDate(eventData.eventDate, startTime);
  try {
    const failure = await updateAdminEvent({ userId: session.user.id, role: session.user.role }, parsedId.data,
      { ...eventData, eventDate, endTime, sessions });
    if (failure) return failure;
  } catch (error) {
    // SQL 본문과 입력값은 반환하지 않으며, 서버 로그 역시 기존 정제 헬퍼를 사용한다.
    logServerError("schedule/update", error, { eventId: parsedId.data, sessionCount: sessions.length });
    return { success: false, message: "일정을 저장하지 못했습니다. 연결된 기록과 입력값을 확인한 뒤 다시 시도해주세요." };
  }

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  redirect("/admin/schedule");
}

/** 일정 삭제 결과와 일반 오류 로그를 처리하며 성공시에만 캐시를 갱신합니다. */
export async function deleteScheduleEvent(id: string): Promise<ScheduleActionState> {
  const session = await requireAdmin();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "유효하지 않은 ID입니다." };
  }

  let result: ScheduleActionState;
  try {
    result = await deleteAdminEvent({ userId: session.user.id, role: session.user.role }, parsedId.data);
    if (!result.success) return result;
  } catch (error) {
    // 다른 오류를 참조 오류로 오인하지 않으며 SQL·입력값은 정제 로그로만 기록한다.
    logServerError("schedule/delete", error, { eventId: parsedId.data });
    return { success: false, message: "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  return result;
}
