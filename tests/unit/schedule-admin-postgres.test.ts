// @vitest-environment node
/**
 * 관리자 일정 조회의 실제 PostgreSQL 정렬·관계·선택 목록을 검증합니다.
 * 기존 쓰기 PG 테스트와 겹치지 않으며 소유 격리 클러스터만 사용합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";
import { exportQaSchemaSql } from "../support/qa-schema-export.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { getAdminChoices, getAdminEvent, listAdminEvents } from "@/features/schedule/admin/service";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = { userId: "admin-1", role: "ADMIN" };
const id = "50000000-0000-4000-8000-000000000001";
const newer = "50000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const faculty = "30000000-0000-4000-8000-000000000001";

describe.skipIf(!bin)("관리자 일정 실제 PostgreSQL 조회", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(exportQaSchemaSql());
    cluster.sql(`
      INSERT INTO cohorts(id,name,"order",google_sheet_id) VALUES
        ('${cohort}','합성 이전 기수',5,'내부 시트'),
        ('20000000-0000-4000-8000-000000000002','합성 새 기수',0,'내부 시트');
      INSERT INTO faculty(id,name,category,current_position) VALUES
        ('${faculty}','나 교수','CLASSICS','내부 약력'),
        ('30000000-0000-4000-8000-000000000002','가 교수','BUSINESS','내부 약력');
      INSERT INTO schedule_events(id,event_date,event_type,title,cohort_id,is_public) VALUES
        ('${id}','2026-10-31 23:30','CLASS','합성 수업','${cohort}',false),
        ('${newer}','2026-11-01 00:00','EVENT','합성 행사',NULL,true);
      INSERT INTO schedule_sessions(id,schedule_event_id,category,faculty_id,content,"order") VALUES
        ('60000000-0000-4000-8000-000000000002','${id}','ENGLISH',NULL,'두 번째',2),
        ('60000000-0000-4000-8000-000000000001','${id}','CLASSICS','${faculty}','첫 번째',1);
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
          new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 전송 차단");
      }
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 60_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("목록은 월·공개 제한 없이 날짜 역순과 세션 순서를 유지한다", async () => {
    // 준비: 서로 다른 월과 공개 상태의 실제 합성 행입니다.
    // 실행: 관리자 목록 서비스를 실제 저장소와 연결합니다.
    const rows = await listAdminEvents(actor);
    // 검증: 역순·비공개 포함·관계 정렬을 확인합니다.
    expect(rows.map(row => row.id)).toEqual([newer, id]);
    expect(rows[1].isPublic).toBe(false);
    expect(rows[1].sessions.map(s => s.content)).toEqual(["첫 번째", "두 번째"]);
    expect(rows[1].cohort).toEqual({ id: cohort, name: "합성 이전 기수" });
    expect(rows[1].sessions[0].faculty).toEqual({ id: faculty, name: "나 교수" });
    expect(JSON.stringify(rows)).not.toMatch(/googleSheetId|currentPosition|createdAt|scheduleEventId/);
  });

  it("단건은 UUID를 선택하고 월말 벽시계와 nullable 관계를 유지한다", async () => {
    // 준비: 10월 말 비공개 수업을 선택합니다.
    // 실행: 단건 서비스를 호출합니다.
    const row = await getAdminEvent(actor, id);
    // 검증: 실제 DB 날짜를 +9 변환하지 않습니다.
    expect(row?.id).toBe(id);
    expect(row?.eventDate.toISOString()).toBe("2026-10-31T23:30:00.000Z");
    expect(row?.sessions[1].faculty).toBeNull();
  });

  it("선택 목록은 교수 이름순·기수 order순이며 최소 필드만 반환한다", async () => {
    // 준비: 삽입 순서와 표시 순서가 다른 교수·기수입니다.
    // 실행: 실제 선택 조회를 호출합니다.
    const choices = await getAdminChoices(actor);
    // 검증: 정렬과 DTO를 값 전체로 고정합니다.
    expect(choices).toEqual({ faculties: [
      { id: "30000000-0000-4000-8000-000000000002", name: "가 교수", category: "BUSINESS" },
      { id: faculty, name: "나 교수", category: "CLASSICS" },
    ], cohorts: [
      { id: "20000000-0000-4000-8000-000000000002", name: "합성 새 기수" },
      { id: cohort, name: "합성 이전 기수" },
    ] });
  });

  it("없는 상세는 기존 undefined 결과를 유지한다", async () => {
    // 준비: 존재하지 않는 유효 UUID입니다.
    // 실행: 실제 조회 서비스를 호출합니다.
    const row = await getAdminEvent(actor, "50000000-0000-4000-8000-000000000099");
    // 검증: 누락을 다른 이벤트로 대체하지 않습니다.
    expect(row).toBeUndefined();
  });
});
