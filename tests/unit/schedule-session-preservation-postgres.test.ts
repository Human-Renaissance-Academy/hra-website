// @vitest-environment node
/**
 * 실제 일정 수정 액션의 SQL을 격리 PostgreSQL에서 실행한다.
 * 과제 FK가 있는 세션의 UUID 보존, 삭제 실패 전체 롤백, 외부 UUID 거부와
 * 신규/빈 세션 수정의 기존 동작을 운영 DB 연결 없이 검증한다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), requireAdmin: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { createScheduleEvent, updateScheduleEvent } from "@/features/schedule/actions";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const event = "50000000-0000-4000-8000-000000000001";
const otherEvent = "50000000-0000-4000-8000-000000000002";
const session = "60000000-0000-4000-8000-000000000001";
const otherSession = "60000000-0000-4000-8000-000000000002";
const assignment = "70000000-0000-4000-8000-000000000001";
const previous = {success: false, message: ""};
// 로컬 키는 DB UUID가 아니며 서버는 serverId만 영속 식별자로 검증해야 한다.
const existingSession = {id:"local-session-0",serverId:session,category:"CLASSICS",content:"새 내용",order:0};
function form(sessions: object[], eventType="CLASS") {
  const formData = new FormData();
  for (const [key,value] of Object.entries({eventDate:"2026-10-14",startTime:"09:30",title:"정정 일정",
    eventType,cohortId:cohort,sessionsJson:JSON.stringify(sessions)})) formData.set(key,value);
  return formData;
}

describe.skipIf(!bin)("기존 세션 UUID를 보존하는 일정 액션", () => {
  let root:string;
  let started=false;
  let args:string[];
  const program=(name:string)=>join(bin!,name);
  const run=(query:string)=>execFileSync(program("psql"),args,{input:query,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
  beforeAll(()=>{
    root=mkdtempSync(join(tmpdir(),"hra-schedule-preserve-"));
    execFileSync(program("initdb"),["-D",join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"],{stdio:"pipe"});
    execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55452`,"-w","start"],{stdio:"pipe"});
    started=true;
    args=["-X","-h",root,"-p","55452","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose","-Atq"];
    run(`CREATE TABLE cohorts (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE faculty (id uuid PRIMARY KEY);
      CREATE TYPE schedule_event_type AS ENUM ('CLASS','EVENT');
      CREATE TYPE session_category AS ENUM ('CLASSICS','ENGLISH','SPEECH','SPECIAL_LECTURE','CASE_STUDY');
      CREATE TABLE schedule_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_date timestamp NOT NULL,
        end_time varchar(5),event_type schedule_event_type NOT NULL,title varchar(200) NOT NULL,
        cohort_id uuid REFERENCES cohorts(id),week_number integer,description text,is_public boolean NOT NULL DEFAULT true,
        created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE schedule_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_event_id uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
        category session_category NOT NULL,faculty_id uuid REFERENCES faculty(id),content text,report_category varchar(50),
        sub_title text,sub_description text,"order" integer NOT NULL DEFAULT 0);
      INSERT INTO users VALUES ('${actor}'); INSERT INTO cohorts VALUES ('${cohort}');`);
    run(readFileSync("scripts/migrate-academic-students.sql","utf8"));
    run(readFileSync("scripts/migrate-academic-assignments.sql","utf8"));
  },30000);
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    mocks.redirect.mockImplementation((path:string)=>{throw new Error(`REDIRECT:${path}`);});
    mocks.execute.mockImplementation(async (statement)=>{
      const query=new PgDialect().sqlToQuery(statement);
      const params=query.params.map(value=>value===null ? "NULL" : typeof value==="boolean" ? String(value) : `'${String(value).replaceAll("'","''")}'`).join(",");
      try {
        const response=run(`PREPARE schedule_write AS ${query.sql}; EXECUTE schedule_write(${params});`);
        const [exists,valid]=response.split("|");
        return {rows:[{event_exists:exists==="t",sessions_valid:valid==="t"}]};
      } catch(error) {
        const stderr=error instanceof Error && "stderr" in error ? String(error.stderr) : "";
        // 실제 DB의 SQLSTATE와 제약명만 드라이버 호환 오류로 변환한다.
        const code=/ERROR:\s+([A-Z0-9]{5}):/.exec(stderr)?.[1];
        const constraint=/constraint "([^"]+)"/.exec(stderr)?.[1];
        throw {code,constraint,cause:error};
      }
    });
    run(`TRUNCATE assignment_targets,assignments,cohort_enrollments,academic_students,schedule_sessions,schedule_events;
      INSERT INTO schedule_events (id,event_date,event_type,title,cohort_id) VALUES
        ('${event}','2026-10-14','CLASS','기존 일정','${cohort}'),('${otherEvent}','2026-10-15','CLASS','다른 일정','${cohort}');
      INSERT INTO schedule_sessions (id,schedule_event_id,category,content) VALUES
        ('${session}','${event}','CLASSICS','기존 내용'),('${otherSession}','${otherEvent}','ENGLISH','다른 내용');`);
  });
  afterAll(()=>{
    try {if(started) execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"],{stdio:"pipe"});}
    finally {if(root) rmSync(root,{recursive:true,force:true});}
  });

  const linkPublishedAssignment=()=>run(`INSERT INTO assignments (id,cohort_id,schedule_event_id,schedule_session_id,title,due_at,created_by_user_id)
    VALUES ('${assignment}','${cohort}','${event}','${session}','참조 과제',clock_timestamp()+interval '1 day','${actor}');
    SELECT id FROM publish_academic_assignment('${assignment}','${actor}');`);

  it("공개 과제의 세션 UUID를 보존하며 일정 제목과 기존 세션 내용을 수정한다",async()=>{
    linkPublishedAssignment();
    await expect(updateScheduleEvent(event,previous,form([existingSession]))).rejects.toThrow("REDIRECT:/admin/schedule");
    expect(run(`SELECT title FROM schedule_events WHERE id='${event}';`)).toBe("정정 일정");
    expect(run(`SELECT id||':'||content FROM schedule_sessions WHERE schedule_event_id='${event}';`)).toBe(`${session}:새 내용`);
    expect(run("SELECT schedule_session_id FROM assignments;")).toBe(session);
  });

  it("참조 세션 제거는 안전한 오류를 반환하고 일정 변경·새 세션 생성까지 전부 롤백한다",async()=>{
    linkPublishedAssignment();
    const result=await updateScheduleEvent(event,previous,form([{category:"ENGLISH",content:"신규 내용",order:0}]));
    expect(result).toEqual({success:false,message:"과제에 연결된 세션은 삭제할 수 없습니다. 해당 세션을 유지한 뒤 다시 저장해주세요."});
    expect(JSON.stringify(result)).not.toMatch(/SELECT|DELETE|INSERT|schedule_sessions|70000000/);
    expect(run(`SELECT title FROM schedule_events WHERE id='${event}';`)).toBe("기존 일정");
    expect(run(`SELECT id||':'||content FROM schedule_sessions WHERE schedule_event_id='${event}';`)).toBe(`${session}:기존 내용`);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("다른 일정의 세션 UUID 주입과 없는 UUID는 기존 데이터 쓰기 없이 거부한다",async()=>{
    for(const id of [otherSession,"60000000-0000-4000-8000-000000000099"]){
      const result=await updateScheduleEvent(event,previous,form([{...existingSession,serverId:id}]));
      expect(result.success).toBe(false);expect(result.message).toContain("다른 일정의 세션");
      expect(run(`SELECT title FROM schedule_events WHERE id='${event}';`)).toBe("기존 일정");
      expect(run(`SELECT content FROM schedule_sessions WHERE id='${otherSession}';`)).toBe("다른 내용");
    }
  });

  it("중복 UUID·잘못된 JSON은 DB 호출 전에 거부하고 없는 일정도 수정하지 않는다",async()=>{
    const duplicate=await updateScheduleEvent(event,previous,form([existingSession,existingSession]));
    expect(duplicate.success).toBe(false);expect(duplicate.fieldErrors?.sessions).toContain("중복");
    const invalid=form([]);invalid.set("sessionsJson","{");
    expect((await updateScheduleEvent(event,previous,invalid)).success).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
    const missing=await updateScheduleEvent("50000000-0000-4000-8000-000000000099",previous,form([{category:"CLASSICS"}]));
    expect(missing.success).toBe(false);expect(missing.message).toContain("찾을 수 없습니다");
    expect(run("SELECT count(*) FROM schedule_events;")).toBe("2");
    expect(run("SELECT count(*) FROM schedule_sessions;")).toBe("2");
  });

  it("유지 UUID는 업데이트하고 제거한 세션만 삭제하며 신규 세션은 UUID를 발급한다",async()=>{
    run(`INSERT INTO schedule_sessions (schedule_event_id,category) VALUES ('${event}','SPEECH');`);
    await expect(updateScheduleEvent(event,previous,form([existingSession,{category:"ENGLISH",content:"추가 세션",order:1}]))).rejects.toThrow("REDIRECT:/admin/schedule");
    expect(run(`SELECT count(*) FROM schedule_sessions WHERE schedule_event_id='${event}';`)).toBe("2");
    expect(run(`SELECT count(*) FROM schedule_sessions WHERE id='${session}';`)).toBe("1");
    expect(run(`SELECT content FROM schedule_sessions WHERE schedule_event_id='${event}' AND id<>'${session}';`)).toBe("추가 세션");
  });

  it("세션 저장의 FK 오류는 기존 세션 수정과 일정 변경까지 전부 롤백한다",async()=>{
    const invalidFaculty="10000000-0000-4000-8000-000000000099";
    const result=await updateScheduleEvent(event,previous,form([existingSession,{category:"ENGLISH",facultyId:invalidFaculty}]));
    expect(result.success).toBe(false);
    expect(run(`SELECT title FROM schedule_events WHERE id='${event}';`)).toBe("기존 일정");
    expect(run(`SELECT content FROM schedule_sessions WHERE id='${session}';`)).toBe("기존 내용");
    expect(run(`SELECT count(*) FROM schedule_sessions WHERE schedule_event_id='${event}';`)).toBe("1");
  });

  it("빈 세션 수업 수정과 행사 전환은 참조가 없으면 기존 세션을 제거한다",async()=>{
    await expect(updateScheduleEvent(event,previous,form([]))).rejects.toThrow("REDIRECT:/admin/schedule");
    expect(run(`SELECT count(*) FROM schedule_sessions WHERE schedule_event_id='${event}';`)).toBe("0");
    await expect(updateScheduleEvent(event,previous,form([]))).rejects.toThrow("REDIRECT:/admin/schedule");
    await expect(updateScheduleEvent(otherEvent,previous,form([{serverId:otherSession,category:"ENGLISH"}],"EVENT"))).rejects.toThrow("REDIRECT:/admin/schedule");
    expect(run(`SELECT count(*) FROM schedule_sessions WHERE schedule_event_id='${otherEvent}';`)).toBe("0");
  });

  it("새 일정의 세션 생성은 유지하고 기존 UUID 전달은 거부한다",async()=>{
    await expect(createScheduleEvent(previous,form([{id:"local-new",category:"CLASSICS",content:"신규 수업"}]))).rejects.toThrow("REDIRECT:/admin/schedule");
    expect(run("SELECT count(*) FROM schedule_events;")).toBe("3");
    expect(run("SELECT count(*) FROM schedule_sessions WHERE content='신규 수업';")).toBe("1");
    const result=await createScheduleEvent(previous,form([existingSession]));
    expect(result.success).toBe(false);expect(result.message).toContain("기존 세션");
    expect(run("SELECT count(*) FROM schedule_events;")).toBe("3");
  });
});
