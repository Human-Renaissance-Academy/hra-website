/**
 * 홈페이지 관리자 회원 관리의 인가·본인 보호·존재 확인·저장 결과 분류를 담당합니다.
 * 웹 캐시와 로그는 adapter에 남기며 삭제 오류 catch는 원본처럼 단일 삭제 문장만 감쌉니다.
 */
import "server-only";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import * as repository from "./repository";

export type UserAdminActor = { userId: string; role: string };
type UserAdminResult = { readonly success: boolean; readonly message: string };
type DeleteOutcome =
  | { readonly kind: "result"; readonly result: UserAdminResult }
  | { readonly kind: "delete-error" };

/** Web 이외 진입에서도 모든 저장소 호출 전에 관리자 주체를 다시 확인합니다. */
function assertAdmin(actor: UserAdminActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("USERS_ADMIN_REQUIRED");
  }
}

/** 목록 DTO를 일곱 표시 필드로 제한하여 추가 인증 열이 페이지에 도달하지 않게 합니다. */
export async function listAdminUsers(actor: UserAdminActor) {
  assertAdmin(actor);
  const rows = await repository.listUsers();
  return rows.map(row => ({ id: row.id, name: row.name, email: row.email, role: row.role,
    cohortId: row.cohortId, image: row.image, createdAt: row.createdAt }));
}

/** 기수 DTO도 드롭다운의 ID·이름으로 제한합니다. */
export async function listAdminCohorts(actor: UserAdminActor) {
  assertAdmin(actor);
  const rows = await repository.listCohorts();
  return rows.map(row => ({ id: row.id, name: row.name }));
}

/** 상세 DTO에는 비밀번호 원문 없이 기존 존재 여부와 표시 열만 포함합니다. */
export async function getAdminUser(actor: UserAdminActor, userId: string) {
  assertAdmin(actor);
  const row = await repository.getUser(userId);
  return row ? { id: row.id, name: row.name, email: row.email, role: row.role,
    cohortId: row.cohortId, image: row.image, createdAt: row.createdAt,
    updatedAt: row.updatedAt, hasPassword: row.hasPassword } : undefined;
}

/** 검증된 입력으로 본인 보호→사용자→기수→원자 저장→0행 분류 순서를 유지합니다. */
export async function changeAdminUserGroup(
  actor: UserAdminActor,
  input: { readonly userId: string; readonly groupValue: string },
): Promise<UserAdminResult> {
  assertAdmin(actor);
  if (actor.userId === input.userId) {
    return { success: false, message: "자기 자신의 그룹은 변경할 수 없습니다." };
  }
  const existing = await repository.findUserId(input.userId);
  if (!existing) return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
  const isFixedRole = input.groupValue === "ADMIN" || input.groupValue === "FACULTY" || input.groupValue === "PENDING";
  if (!isFixedRole) {
    const cohort = await repository.findCohortIds(input.groupValue);
    if (cohort.length === 0) return { success: false, message: "해당 기수를 찾을 수 없습니다." };
  }
  const newRole = isFixedRole ? input.groupValue : "MEMBER";
  const newCohortId = isFixedRole ? null : input.groupValue;
  const affected = await repository.updateGroup(input.userId, newRole, newCohortId);
  if (affected === 0) {
    const stillExists = await repository.findUserId(input.userId);
    if (!stillExists) return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
    return { success: false, message: "마지막 관리자입니다. 다른 관리자를 먼저 지정한 뒤 역할을 변경하세요." };
  }
  return { success: true, message: "그룹이 변경되었습니다." };
}

/** 삭제 문장만 오류를 분류하고 최초·0행 존재 조회 오류는 원본처럼 전파합니다. */
export async function deleteAdminUser(actor: UserAdminActor, userId: string): Promise<DeleteOutcome> {
  assertAdmin(actor);
  if (actor.userId === userId) {
    return { kind: "result", result: { success: false, message: "자기 자신은 삭제할 수 없습니다." } };
  }
  const existing = await repository.findUserId(userId);
  if (!existing) return { kind: "result", result: { success: false, message: "해당 사용자를 찾을 수 없습니다." } };
  let affected = 0;
  try {
    affected = await repository.deleteUser(userId);
  } catch (error) {
    // 알려진 RESTRICT 이름과 두 SQLSTATE만 분류하고 원문은 Web 로그에도 반환하지 않습니다.
    const protectedReferences = [
      "academic_students_user_id_users_id_fk",
      "cohort_enrollments_created_by_user_id_users_id_fk",
      "academic_enrollment_link_batches_actor_user_id_users_id_fk",
    ];
    if (protectedReferences.some(constraint =>
      ["23001", "23503"].some(code => isConstraintViolation(error, code, constraint)))) {
      return { kind: "result", result: { success: false, message: "학적 정보나 학사 운영 이력이 연결된 회원은 삭제할 수 없습니다." } };
    }
    return { kind: "delete-error" };
  }
  if (affected === 0) {
    const stillExists = await repository.findUserId(userId);
    if (!stillExists) return { kind: "result", result: { success: false, message: "해당 사용자를 찾을 수 없습니다." } };
    return { kind: "result", result: { success: false, message: "마지막 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 지정하세요." } };
  }
  return { kind: "result", result: { success: true, message: "회원이 삭제되었습니다." } };
}
