// @vitest-environment node
/** 회원 관리자 액션의 원본 분기 순서·오류 범위·저장 완료 후 캐시 처리를 고정합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { cohorts, users } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), select: vi.fn(),
  execute: vi.fn<(statement: SQL) => Promise<{ rowCount?: number }>>(), cache: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, execute: mocks.execute } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { deleteUser, updateUserGroup } from "@/features/users/actions";

const actor = "10000000-0000-4000-8000-000000000001";
const target = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const dialect = new PgDialect();
const missing = { success: false, message: "해당 사용자를 찾을 수 없습니다." };

/** 실행 경계의 SQL 객체를 렌더링하여 식별자와 매개변수 순서를 함께 검사합니다. */
function executedQuery() {
  expect(mocks.execute).toHaveBeenCalledOnce();
  const [statement] = mocks.execute.mock.calls[0] ?? [];
  if (!statement) throw new Error("원자 SQL이 실행되지 않았습니다.");
  const { sql, params } = dialect.sqlToQuery(statement);
  return { sql: sql.replace(/\s+/g, " ").trim(), params };
}

/** 실제 쿼리 체인·식별자·조건·제한을 기록하면서 합성 결과만 반환합니다. */
function selectRows(rows: { id: string }[], table: typeof users | typeof cohorts = users, id = target) {
  mocks.select.mockImplementationOnce((projection) => {
    expect(Object.keys(projection)).toEqual(["id"]);
    expect(projection.id).toBe(table.id);
    return { from: (actual: unknown) => {
      expect(actual).toBe(table);
      return { where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        expect(dialect.sqlToQuery(condition).params).toEqual([id]);
        return { limit: (limit: number) => {
          expect(limit).toBe(1);
          return Promise.resolve(rows);
        } };
      } };
    } };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
  mocks.execute.mockResolvedValue({ rowCount: 1 });
});

describe("회원 관리자 액션 원본 계약", () => {
  it.each([
    { value: "FACULTY", params: ["FACULTY", null, "FACULTY", null, "10000000-0000-4000-8000-000000000002", "FACULTY"] },
    { value: cohort, params: ["MEMBER", "20000000-0000-4000-8000-000000000001", "MEMBER",
      "20000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "MEMBER"] },
  ])("그룹 $value 원자 SQL 식별자·보호 조건·매개변수는 원본 골든과 같다", async ({ value, params }) => {
    // 준비: 역할 전환과 기수 전환의 입력값을 서로 다르게 설정합니다.
    selectRows([{ id: target }]);
    if (value === cohort) selectRows([{ id: cohort }], cohorts, cohort);
    // 실행: 원본 또는 추출된 액션의 실제 DB 실행 경계까지 호출합니다.
    await updateUserGroup(target, value);
    // 검증: 원본 액션 실행에서 얻은 전체 SQL과 순서가 고정된 바인딩을 비교합니다.
    expect(executedQuery()).toEqual({
      sql: `WITH admin_lock AS ( SELECT id FROM "users" WHERE "users"."role" = 'ADMIN' FOR UPDATE ) UPDATE "users" SET "role" = $1::user_role, "cohort_id" = $2::uuid, "session_version" = CASE WHEN "users"."role" IS DISTINCT FROM $3::user_role OR "users"."cohort_id" IS DISTINCT FROM $4::uuid THEN "users"."session_version" + 1 ELSE "users"."session_version" END, "updated_at" = now() WHERE "users"."id" = $5::uuid AND ( "users"."role" <> 'ADMIN' OR $6::user_role = 'ADMIN' OR (SELECT count(*) FROM admin_lock) > 1 ) RETURNING "users"."id";`,
      params,
    });
  });

  it("삭제의 원자 SQL 식별자·마지막 관리자 조건·대상 바인딩은 원본 골든과 같다", async () => {
    // 준비: 삭제 대상은 현재 관리자 주체와 다른 합성 UUID입니다.
    selectRows([{ id: target }]);
    // 실행: 실제 삭제 SQL 객체를 DB 실행 경계에서 수집합니다.
    await deleteUser(target);
    // 검증: 원본 액션 실행에서 얻은 전체 SQL과 대상 UUID 바인딩을 비교합니다.
    expect(executedQuery()).toEqual({
      sql: `WITH admin_lock AS ( SELECT id FROM "users" WHERE "users"."role" = 'ADMIN' FOR UPDATE ) DELETE FROM "users" WHERE "users"."id" = $1::uuid AND ( "users"."role" <> 'ADMIN' OR (SELECT count(*) FROM admin_lock) > 1 ) RETURNING "users"."id";`,
      params: ["10000000-0000-4000-8000-000000000002"],
    });
  });

  it.each(["update", "delete"])("%s는 입력 검증보다 먼저 세션을 확인한다", async kind => {
    // 준비: 인증 실패와 잘못된 입력을 동시에 제공합니다.
    mocks.admin.mockRejectedValueOnce(new Error("인증 거부"));
    // 실행·검증: 입력 오류로 인증 실패를 가리지 않습니다.
    await expect(kind === "update" ? updateUserGroup("bad", "bad") : deleteUser("bad")).rejects.toThrow("인증 거부");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    ["bad", "bad", "올바른 사용자 ID가 필요합니다."],
    [actor, "bad", "올바른 기수 ID가 아닙니다."],
    [actor, "FACULTY", "자기 자신의 그룹은 변경할 수 없습니다."],
  ])("그룹 변경 %s/%s는 첫 오류를 반환하고 조회하지 않는다", async (id, value, message) => {
    // 준비·실행: 입력 오류가 본인 변경보다 우선합니다.
    const result = await updateUserGroup(id, value);
    // 검증: 메시지와 조회 없는 종료를 고정합니다.
    expect(result).toEqual({ success: false, message });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each([["bad", "올바른 사용자 ID가 필요합니다."], [actor, "자기 자신은 삭제할 수 없습니다."]])(
    "삭제 %s는 조회 전에 거부한다", async (id, message) => {
      // 준비·실행: 유효성 또는 본인 보호 분기를 실행합니다.
      const result = await deleteUser(id);
      // 검증: 저장소와 캐시가 시작되지 않습니다.
      expect(result).toEqual({ success: false, message });
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.cache).not.toHaveBeenCalled();
    });

  it.each(["update", "delete"])("%s는 없는 사용자에서 추가 조회·저장을 하지 않는다", async kind => {
    // 준비: 사용자 없음은 기수 없음보다 먼저 확인합니다.
    selectRows([]);
    // 실행·검증: 최초 존재 조회만 수행합니다.
    expect(await (kind === "update" ? updateUserGroup(target, cohort) : deleteUser(target))).toEqual(missing);
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it("없는 기수는 사용자 존재 확인 뒤 저장 전에 거부한다", async () => {
    // 준비: 사용자는 있으나 요청 기수는 없습니다.
    selectRows([{ id: target }]);
    selectRows([], cohorts, cohort);
    // 실행·검증: 기수 오류 결과를 그대로 반환합니다.
    expect(await updateUserGroup(target, cohort)).toEqual({ success: false, message: "해당 기수를 찾을 수 없습니다." });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "FACULTY", "PENDING", cohort])("그룹 %s 저장은 완료를 기다린 뒤 두 경로를 재검증한다", async value => {
    // 준비: 저장 완료는 테스트가 명시적으로 해제합니다.
    selectRows([{ id: target }]);
    if (value === cohort) selectRows([{ id: cohort }], cohorts, cohort);
    let finish: (value: { rowCount: number }) => void = () => { throw new Error("저장 준비 전"); };
    const persistence = new Promise<{ rowCount: number }>(resolve => { finish = resolve; });
    let started: () => void = () => { throw new Error("신호 준비 전"); };
    const entered = new Promise<void>(resolve => { started = resolve; });
    mocks.execute.mockImplementationOnce(() => { started(); return persistence; });
    // 실행: 미완료 저장은 캐시를 변경하지 않습니다.
    const pending = updateUserGroup(target, value);
    await entered;
    // 서비스·adapter의 연속 promise 반응을 진행해 누락된 await도 캐시 호출로 드러나게 합니다.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.cache).not.toHaveBeenCalled();
    finish({ rowCount: 1 });
    // 검증: 성공 메시지·단일 SQL·캐시 순서를 고정합니다.
    expect(await pending).toEqual({ success: true, message: "그룹이 변경되었습니다." });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.cache.mock.calls).toEqual([["/admin/users"], [`/admin/users/${target}`]]);
    expect(mocks.select).toHaveBeenCalledTimes(value === cohort ? 2 : 1);
  });

  it("삭제도 저장 완료 전에는 목록 캐시를 재검증하지 않는다", async () => {
    // 준비: 삭제 완료와 시작 신호를 분리합니다.
    selectRows([{ id: target }]);
    let finish: (value: { rowCount: number }) => void = () => { throw new Error("삭제 준비 전"); };
    const persistence = new Promise<{ rowCount: number }>(resolve => { finish = resolve; });
    let started: () => void = () => { throw new Error("신호 준비 전"); };
    const entered = new Promise<void>(resolve => { started = resolve; });
    mocks.execute.mockImplementationOnce(() => { started(); return persistence; });
    // 실행: 저장을 해제하기 전 캐시 호출 여부를 확인합니다.
    const pending = deleteUser(target);
    await entered;
    // 저장이 보류된 상태에서 서비스·adapter의 promise 반응만 진행합니다.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(mocks.cache).not.toHaveBeenCalled();
    finish({ rowCount: 1 });
    // 검증: 삭제 성공은 목록 한 곳만 재검증합니다.
    expect(await pending).toEqual({ success: true, message: "회원이 삭제되었습니다." });
    expect(mocks.cache.mock.calls).toEqual([["/admin/users"]]);
  });

  it.each(["update", "delete"])("%s의 0행 결과는 재조회로 소실과 마지막 관리자를 구분한다", async kind => {
    // 준비: 쓰기 직전 있던 사용자가 사라졌습니다.
    selectRows([{ id: target }]);
    selectRows([]);
    mocks.execute.mockResolvedValueOnce({ rowCount: 0 });
    // 실행·검증: 마지막 관리자 오류로 바꾸지 않습니다.
    expect(await (kind === "update" ? updateUserGroup(target, "FACULTY") : deleteUser(target))).toEqual(missing);
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each([
    ["update", "마지막 관리자입니다. 다른 관리자를 먼저 지정한 뒤 역할을 변경하세요."],
    ["delete", "마지막 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 지정하세요."],
  ])("%s의 마지막 관리자 메시지를 보존한다", async (kind, message) => {
    // 준비: 변경 0행이어도 사용자는 남아 있습니다.
    selectRows([{ id: target }]);
    selectRows([{ id: target }]);
    mocks.execute.mockResolvedValueOnce({});
    // 실행·검증: 캐시 없이 정확한 실패 결과를 반환합니다.
    expect(await (kind === "update" ? updateUserGroup(target, "PENDING") : deleteUser(target))).toEqual({ success: false, message });
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each(["update", "delete"])("%s의 캐시 오류는 삭제 DB catch에 들어가지 않는다", async kind => {
    // 준비: 저장은 성공했지만 웹 후처리가 실패합니다.
    selectRows([{ id: target }]);
    mocks.cache.mockImplementationOnce(() => { throw new Error("캐시 오류"); });
    // 실행·검증: 원본처럼 예외가 전파되고 삭제 실패 로그는 없습니다.
    await expect(kind === "update" ? updateUserGroup(target, "FACULTY") : deleteUser(target)).rejects.toThrow("캐시 오류");
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.cache.mock.calls).toEqual([["/admin/users"]]);
  });

  it.each(["initial", "after-zero"])("삭제 %s 존재 조회 오류는 try 밖에서 전파한다", async stage => {
    // 준비: 최초 조회 또는 0행 재조회만 실패시킵니다.
    if (stage === "after-zero") { selectRows([{ id: target }]); mocks.execute.mockResolvedValueOnce({ rowCount: 0 }); }
    mocks.select.mockImplementationOnce(() => { throw new Error("조회 오류"); });
    // 실행·검증: 일반 삭제 오류 결과로 삼키지 않습니다.
    await expect(deleteUser(target)).rejects.toThrow("조회 오류");
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each([
    "academic_students_user_id_users_id_fk",
    "cohort_enrollments_created_by_user_id_users_id_fk",
    "academic_enrollment_link_batches_actor_user_id_users_id_fk",
  ])("보호 FK %s의 두 SQLSTATE만 학사 이력 오류로 분류한다", async constraint => {
    // 준비·실행·검증: 원본 cause 탐색과 정확한 메시지를 확인합니다.
    for (const code of ["23001", "23503"]) {
      selectRows([{ id: target }]);
      mocks.execute.mockRejectedValueOnce({ cause: { code, constraint } });
      expect(await deleteUser(target)).toEqual({ success: false, message: "학적 정보나 학사 운영 이력이 연결된 회원은 삭제할 수 없습니다." });
    }
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled();
  });

  it.each([
    { code: "P0001", constraint: "academic_students_user_id_users_id_fk" },
    { code: "23503", constraint: "other_fk" },
  ])("알 수 없는 삭제 오류는 원문 없는 고정 로그와 실패 결과를 반환한다: %j", async error => {
    // 준비: 보호 대상과 코드가 모두 맞지 않는 오류입니다.
    selectRows([{ id: target }]);
    mocks.execute.mockRejectedValueOnce(error);
    // 실행·검증: 로거에 원문 객체를 전달하지 않습니다.
    expect(await deleteUser(target)).toEqual({ success: false, message: "회원 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
    expect(mocks.log.mock.calls).toEqual([["users/delete", new Error("회원 삭제 처리 실패"), { userId: target }]]);
    expect(mocks.log.mock.calls[0]?.[1]).not.toBe(error);
    expect(mocks.cache).not.toHaveBeenCalled();
  });
});
