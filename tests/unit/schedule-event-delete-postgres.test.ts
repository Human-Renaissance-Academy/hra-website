// @vitest-environment node
/**
 * 일정 삭제 액션의 참조 오류 처리와 실제 PostgreSQL 데이터 보존을 검증한다.
 * 운영 DB 대신 임시 Unix 소켓 서버에서 실제 Drizzle DELETE를 실행하며,
 * 알려진 과제 FK만 안내하고 성공한 삭제에서만 캐시를 갱신하는지 확인한다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), requireAdmin: vi.fn(), revalidatePath: vi.fn(), log: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", async () => {
  // 쿼리 빌더는 실제 구현을 쓰고 전송 경로만 격리 PostgreSQL로 교체한다.
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle((query, params) => mocks.query(query, params)) };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { deleteScheduleEvent } from "@/features/schedule/actions";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const event = "50000000-0000-4000-8000-000000000001";
const missingEvent = "50000000-0000-4000-8000-000000000099";
const session = "60000000-0000-4000-8000-000000000001";
const assignment = "70000000-0000-4000-8000-000000000001";
const eventConstraint = "assignments_schedule_event_id_schedule_events_id_fk";
const sessionConstraint = "assignments_schedule_session_id_schedule_sessions_id_fk";
const referenceMessage = "과제에 연결된 일정이나 세션은 삭제할 수 없습니다. 연결된 과제를 확인해주세요.";
const failureMessage = "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
});

// 실패 응답은 원본 SQL·제약명·테스트 개인정보를 포함하지 않아야 한다.
function expectSafeFailure(result: Awaited<ReturnType<typeof deleteScheduleEvent>>) {
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/DELETE|SELECT|schedule_events|assignments_|23503|23001|private@example\.test|원본 DB 오류/);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
}

describe("일정 삭제 오류의 제한적인 분류", () => {
  it.each(["23503", "23001"].flatMap(code =>
    [eventConstraint, sessionConstraint].map(constraint => ({ code, constraint }))
  ))("$code와 $constraint가 함께 일치하면 참조 안내를 반환한다", async (error) => {
    mocks.query.mockRejectedValueOnce({ ...error, message: "원본 DB 오류 private@example.test DELETE FROM schedule_events" });
    const result = await deleteScheduleEvent(event);
    expect(result).toEqual({ success: false, message: referenceMessage });
    expectSafeFailure(result);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it.each([
    { code: "23503", constraint: "unrelated_reference_fk" },
    { code: "23001", constraint: "unrelated_reference_fk" },
    { code: "23505", constraint: eventConstraint },
    { code: "42P01", constraint: sessionConstraint },
    { code: "23503" },
  ])("알려진 조합이 아닌 $code 오류는 일반 실패로 기록한다", async (error) => {
    mocks.query.mockRejectedValueOnce({ ...error, message: "원본 DB 오류 private@example.test DELETE FROM schedule_events" });
    const result = await deleteScheduleEvent(event);
    expect(result).toEqual({ success: false, message: failureMessage });
    expectSafeFailure(result);
    expect(mocks.log).toHaveBeenCalledWith("schedule/delete", expect.anything(), { eventId: event });
  });
});

describe.skipIf(!bin)("격리 PostgreSQL에서 일정 삭제", () => {
  let root: string;
  let started = false;
  let args: string[];
  const observedErrors: { code?: string; constraint?: string }[] = [];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-schedule-delete-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55453`, "-w", "start"], { stdio: "pipe" });
    started = true;
    args = ["-X", "-h", root, "-p", "55453", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-Atq"];
    run(`CREATE TABLE cohorts (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE faculty (id uuid PRIMARY KEY);
      CREATE TYPE schedule_event_type AS ENUM ('CLASS','EVENT');
      CREATE TYPE session_category AS ENUM ('CLASSICS','ENGLISH','SPEECH','SPECIAL_LECTURE','CASE_STUDY');
      CREATE TABLE schedule_events (id uuid PRIMARY KEY, event_date timestamp NOT NULL,
        event_type schedule_event_type NOT NULL, title varchar(200) NOT NULL, cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions (id uuid PRIMARY KEY,
        schedule_event_id uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
        category session_category NOT NULL);
      INSERT INTO users VALUES ('${actor}'); INSERT INTO cohorts VALUES ('${cohort}');`);
    // 과제의 실제 마이그레이션으로 RESTRICT FK와 쓰기 계약을 그대로 설치한다.
    run(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    run(readFileSync("scripts/migrate-academic-assignments.sql", "utf8"));
  }, 30000);

  beforeEach(() => {
    observedErrors.length = 0;
    mocks.query.mockImplementation(async (query: string, values: unknown[]) => {
      // PREPARE의 값은 SQL 리터럴로 이스케이프하며 실제 앱 연결 문자열은 사용하지 않는다.
      const params = values.map(value => value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`).join(",");
      try {
        const response = run(`PREPARE schedule_delete AS ${query}; EXECUTE schedule_delete(${params});`);
        return { rows: response ? response.split("\n").map(row => row.split("|")) : [] };
      } catch (error) {
        const stderr = error instanceof Error && "stderr" in error ? String(error.stderr) : "";
        const violation = {
          code: /ERROR:\s+([A-Z0-9]{5}):/.exec(stderr)?.[1],
          constraint: /constraint "([^"]+)"/.exec(stderr)?.[1],
        };
        observedErrors.push(violation);
        // 실제 SQLSTATE·제약명을 Drizzle의 cause 체인을 통해 액션까지 전달한다.
        throw { ...violation, cause: error };
      }
    });
    run(`TRUNCATE assignment_targets, assignments, cohort_enrollments, academic_students, schedule_sessions, schedule_events;
      INSERT INTO schedule_events VALUES ('${event}', '2026-10-14', 'CLASS', '보존할 일정', '${cohort}');
      INSERT INTO schedule_sessions VALUES ('${session}', '${event}', 'CLASSICS');`);
  });

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  // 일정 직접 참조와 세션 참조 모두 실제 과제 쓰기 계약을 통과한 행으로 만든다.
  const linkAssignment = (withSession: boolean) => run(`
    INSERT INTO assignments (id, cohort_id, schedule_event_id, schedule_session_id, title, created_by_user_id)
    VALUES ('${assignment}', '${cohort}', '${event}', ${withSession ? `'${session}'` : "NULL"}, '보존할 과제', '${actor}');`);

  function expectPreserved(withAssignment: boolean) {
    expect(run(`SELECT title FROM schedule_events WHERE id='${event}';`)).toBe("보존할 일정");
    expect(run(`SELECT schedule_event_id FROM schedule_sessions WHERE id='${session}';`)).toBe(event);
    expect(run("SELECT count(*) FROM assignments;")).toBe(withAssignment ? "1" : "0");
    if (withAssignment) expect(run(`SELECT title FROM assignments WHERE id='${assignment}';`)).toBe("보존할 과제");
  }

  it.each([false, true])("과제의 세션 참조 여부 %s에서 삭제를 거부하고 모든 기록을 보존한다", async (withSession) => {
    linkAssignment(withSession);
    const before = run("SELECT row_to_json(a) FROM assignments a;");
    const result = await deleteScheduleEvent(event);
    expect(result).toEqual({ success: false, message: referenceMessage });
    expectSafeFailure(result);
    expectPreserved(true);
    expect(run("SELECT row_to_json(a) FROM assignments a;")).toBe(before);
    expect(observedErrors).toEqual([{ code: expect.stringMatching(/^(23503|23001)$/), constraint: eventConstraint }]);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("CASCADE 중 세션 FK가 삭제를 거부해도 일정·세션·과제를 모두 보존한다", async () => {
    linkAssignment(true);
    // PostgreSQL 14는 직접 일정 FK를 먼저 보고하므로 테스트 DB에서만 해당 FK를
    // 잠시 제거해, 함께 존재하는 세션 RESTRICT의 실제 오류 경로도 독립 검증한다.
    run(`ALTER TABLE assignments DROP CONSTRAINT ${eventConstraint};`);
    try {
      const before = run("SELECT row_to_json(a) FROM assignments a;");
      const result = await deleteScheduleEvent(event);
      expect(result).toEqual({ success: false, message: referenceMessage });
      expectSafeFailure(result);
      expectPreserved(true);
      expect(run("SELECT row_to_json(a) FROM assignments a;")).toBe(before);
      expect(observedErrors).toEqual([{ code: expect.stringMatching(/^(23503|23001)$/), constraint: sessionConstraint }]);
      expect(mocks.log).not.toHaveBeenCalled();
    } finally {
      run(`ALTER TABLE assignments ADD CONSTRAINT ${eventConstraint}
        FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id) ON DELETE RESTRICT;`);
    }
  });

  it("참조가 없으면 일정과 세션을 삭제하고 성공용 캐시를 갱신한다", async () => {
    expect(await deleteScheduleEvent(event)).toEqual({ success: true, message: "일정이 삭제되었습니다." });
    expect(run("SELECT count(*) FROM schedule_events;")).toBe("0");
    expect(run("SELECT count(*) FROM schedule_sessions;")).toBe("0");
    expect(mocks.revalidatePath.mock.calls).toEqual([["/"], ["/admin/schedule"]]);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("없는 대상은 성공으로 오인하지 않고 캐시를 갱신하지 않는다", async () => {
    const result = await deleteScheduleEvent(missingEvent);
    expect(result).toEqual({ success: false, message: "일정을 찾을 수 없습니다. 목록을 새로고침해주세요." });
    expectSafeFailure(result);
    expectPreserved(false);
  });

  it("잘못된 ID는 DB에 전달하지 않고 기존 기록을 보존한다", async () => {
    const result = await deleteScheduleEvent("private@example.test DELETE FROM schedule_events");
    expect(result).toEqual({ success: false, message: "유효하지 않은 ID입니다." });
    expectSafeFailure(result);
    expect(mocks.query).not.toHaveBeenCalled();
    expectPreserved(false);
  });

  it("다른 실제 SQL 오류는 참조 오류로 분류하지 않고 안전한 일반 실패를 반환한다", async () => {
    // 알려지지 않은 RESTRICT FK도 명시적인 과제 안내로 뭉개지 않는지 검사한다.
    run(`CREATE TABLE unrelated_links (event_id uuid CONSTRAINT unrelated_reference_fk REFERENCES schedule_events(id) ON DELETE RESTRICT);
      INSERT INTO unrelated_links VALUES ('${event}');`);
    try {
      const result = await deleteScheduleEvent(event);
      expect(result).toEqual({ success: false, message: failureMessage });
      expectSafeFailure(result);
      expectPreserved(false);
      expect(observedErrors).toEqual([{ code: expect.stringMatching(/^(23503|23001)$/), constraint: "unrelated_reference_fk" }]);
      expect(mocks.log).toHaveBeenCalledWith("schedule/delete", expect.anything(), { eventId: event });
    } finally {
      run("DROP TABLE unrelated_links;");
    }
  });
});
