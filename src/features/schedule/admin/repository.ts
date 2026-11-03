/**
 * 관리자 일정의 PostgreSQL 접근을 소유합니다.
 * 기존 조회 체인과 생성·수정 CTE의 순서 및 잠금·세션 소유권 조건을 그대로 유지합니다.
 */
import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts, faculty, scheduleEvents, scheduleSessions } from "@/lib/db/schema";

export type ScheduleSessionInput = {
  readonly serverId?: string;
  readonly category: "CLASSICS" | "ENGLISH" | "SPEECH" | "SPECIAL_LECTURE" | "CASE_STUDY";
  readonly facultyId?: string | null;
  readonly content?: string | null;
  readonly reportCategory?: string | null;
  readonly subTitle?: string | null;
  readonly subDescription?: string | null;
  readonly order: number;
};
export type ScheduleEventInput = {
  readonly eventDate: Date;
  readonly endTime?: string | null;
  readonly eventType: "CLASS" | "EVENT";
  readonly title: string;
  readonly cohortId?: string | null;
  readonly weekNumber?: number | null;
  readonly description?: string | null;
  readonly isPublic: boolean;
  readonly sessions: readonly ScheduleSessionInput[];
};
export type ScheduleSessionPayload = {
  readonly id: string | null;
  readonly category: ScheduleSessionInput["category"];
  readonly faculty_id: string | null;
  readonly content: string | null;
  readonly report_category: string | null;
  readonly sub_title: string | null;
  readonly sub_description: string | null;
  readonly order: number;
};

/** 교수 선택은 이름순이며 표시 필드 세 개만 읽습니다. */
export async function listFacultyChoices() {
  return db.select({ id: faculty.id, name: faculty.name, category: faculty.category })
    .from(faculty).orderBy(asc(faculty.name));
}

/** 기수 선택은 기존 order 오름차순을 유지합니다. */
export async function listCohortChoices() {
  return db.select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts).orderBy(asc(cohorts.order));
}

/** 관리자 조회의 전체 관계 체인을 유지하며 서비스에서 DTO를 선별합니다. */
export async function listEvents() {
  return db.query.scheduleEvents.findMany({
    with: {
      cohort: true,
      sessions: { orderBy: [asc(scheduleSessions.order)], with: { faculty: true } },
    },
    orderBy: [desc(scheduleEvents.eventDate)],
  });
}

/** 단건 조회는 UUID 동등 조건과 세션 순서를 유지합니다. */
export async function findEvent(id: string) {
  return db.query.scheduleEvents.findFirst({
    where: eq(scheduleEvents.id, id),
    with: {
      cohort: true,
      sessions: { orderBy: [asc(scheduleSessions.order)], with: { faculty: true } },
    },
  });
}

/** 세션이 없는 일정은 기존 단일 INSERT 체인을 사용합니다. */
export async function insertEvent(input: Omit<ScheduleEventInput, "sessions">): Promise<void> {
  const { endTime, ...eventData } = input;
  await db.insert(scheduleEvents).values({
    ...eventData,
    cohortId: eventData.cohortId ?? null,
    weekNumber: eventData.weekNumber ?? null,
    description: eventData.description ?? null,
    eventDate: eventData.eventDate,
    endTime: endTime ?? null,
  });
}

/**
 * 수업과 신규 세션은 기존 단일 CTE 문장으로 함께 생성합니다.
 *
 * 원자화 원칙 (#62): event insert와 sessions insert를 단일 SQL CTE로 묶어
 * PostgreSQL 문장 단위 원자성으로 일부만 반영되는 상태를 원천 차단합니다.
 * neon-http 드라이버는 db.transaction()을 지원하지 않으므로(src/lib/db/reorder.ts 참고)
 * CTE가 유일한 원자화 수단입니다.
 */
export async function insertEventWithSessions(input: ScheduleEventInput): Promise<void> {
  const { sessions, endTime, ...eventData } = input;
  const eventDateSql = eventData.eventDate.toISOString();
  // NULL 가능 값의 타입 캐스트와 VALUES 순서가 기존 SQL과 같습니다.
  const sessionValues = sessions.map(
    (s, i) => sql`(
        ${s.category}::session_category,
        ${s.facultyId ?? null}::uuid,
        ${s.content ?? null}::text,
        ${s.reportCategory ?? null}::text,
        ${s.subTitle ?? null}::text,
        ${s.subDescription ?? null}::text,
        ${s.order ?? i}::integer
      )`
  );
  await db.execute(sql`
      WITH new_event AS (
        INSERT INTO schedule_events (
          event_date, end_time, event_type, title, cohort_id, week_number, description, is_public
        ) VALUES (
          ${eventDateSql}::timestamp,
          ${endTime ?? null},
          ${eventData.eventType}::schedule_event_type,
          ${eventData.title},
          ${eventData.cohortId ?? null}::uuid,
          ${eventData.weekNumber ?? null}::integer,
          ${eventData.description ?? null},
          ${eventData.isPublic}
        )
        RETURNING id
      )
      INSERT INTO schedule_sessions (
        schedule_event_id, category, faculty_id, content, report_category, sub_title, sub_description, "order"
      )
      SELECT ne.id, s.category, s.faculty_id, s.content, s.report_category, s.sub_title, s.sub_description, s."order"
      FROM new_event ne
      CROSS JOIN (VALUES ${sql.join(sessionValues, sql`, `)})
        AS s(category, faculty_id, content, report_category, sub_title, sub_description, "order")
    `);
}

/**
 * 기존 세션 UUID를 보존하는 수정 CTE를 분리하거나 재정렬하지 않습니다.
 *
 * Neon HTTP는 대화형 트랜잭션을 지원하지 않으므로(#62) 소유권 검사·행 잠금·일정 수정·
 * 세션 UPDATE/INSERT/DELETE를 단일 SQL CTE로 묶습니다. 대상 행을 잠근 뒤 변경하므로
 * 동시 수정이 중간 상태를 보지 않습니다. 과제가 참조하는 세션을 유지하면 일반 제목/내용
 * 수정이 가능하고, 실제로 제거하면 RESTRICT FK 위반이 문장 전체를 롤백해 일정과
 * 세션 어느 쪽도 일부만 바뀌지 않습니다.
 */
export async function updateEvent(id: string, input: ScheduleEventInput, sessionPayload: readonly ScheduleSessionPayload[]) {
  const { endTime, ...eventData } = input;
  const eventDateSql = eventData.eventDate.toISOString();
  return db.execute(sql`
      WITH input_sessions AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(sessionPayload)}::jsonb)
          AS s(id uuid, category session_category, faculty_id uuid, content text,
            report_category text, sub_title text, sub_description text, "order" integer)
      ), locked_event AS MATERIALIZED (
        SELECT id FROM schedule_events WHERE id = ${id}::uuid FOR UPDATE
      ), locked_sessions AS MATERIALIZED (
        SELECT s.id FROM schedule_sessions s JOIN locked_event e ON e.id = s.schedule_event_id FOR UPDATE OF s
      ), valid_request AS MATERIALIZED (
        SELECT NOT EXISTS (
          SELECT 1 FROM input_sessions s WHERE s.id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM locked_sessions owned WHERE owned.id = s.id)
        ) AS valid
      ), requested_sessions AS MATERIALIZED (
        SELECT * FROM input_sessions WHERE ${eventData.eventType === "CLASS"}::boolean
      ), updated_event AS (
        UPDATE schedule_events SET
          event_date = ${eventDateSql}::timestamp,
          end_time = ${endTime ?? null},
          event_type = ${eventData.eventType}::schedule_event_type,
          title = ${eventData.title},
          cohort_id = ${eventData.cohortId ?? null}::uuid,
          week_number = ${eventData.weekNumber ?? null}::integer,
          description = ${eventData.description ?? null},
          is_public = ${eventData.isPublic},
          updated_at = now()
        WHERE id IN (SELECT id FROM locked_event) AND (SELECT valid FROM valid_request)
        RETURNING id
      ), updated_sessions AS (
        UPDATE schedule_sessions existing SET category = incoming.category,
          faculty_id = incoming.faculty_id, content = incoming.content,
          report_category = incoming.report_category, sub_title = incoming.sub_title,
          sub_description = incoming.sub_description, "order" = incoming."order"
        FROM requested_sessions incoming, updated_event e
        WHERE existing.id = incoming.id AND existing.schedule_event_id = e.id
        RETURNING existing.id
      ), deleted_sessions AS (
        DELETE FROM schedule_sessions existing USING updated_event e
        WHERE existing.schedule_event_id = e.id
          AND NOT EXISTS (SELECT 1 FROM requested_sessions incoming WHERE incoming.id = existing.id)
        RETURNING existing.id
      ), inserted_sessions AS (
        INSERT INTO schedule_sessions (schedule_event_id, category, faculty_id, content,
          report_category, sub_title, sub_description, "order")
        SELECT e.id, incoming.category, incoming.faculty_id, incoming.content,
          incoming.report_category, incoming.sub_title, incoming.sub_description, incoming."order"
        FROM requested_sessions incoming CROSS JOIN updated_event e WHERE incoming.id IS NULL
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM locked_event) AS event_exists,
        (SELECT valid FROM valid_request) AS sessions_valid,
        (SELECT count(*) FROM updated_sessions) AS updated_count,
        (SELECT count(*) FROM deleted_sessions) AS deleted_count,
        (SELECT count(*) FROM inserted_sessions) AS inserted_count
    `);
}

/** DELETE의 실제 반환 행으로 누락과 삭제 성공을 구분합니다. */
export async function deleteEvent(id: string) {
  return db.delete(scheduleEvents)
    .where(eq(scheduleEvents.id, id))
    .returning({ id: scheduleEvents.id });
}
