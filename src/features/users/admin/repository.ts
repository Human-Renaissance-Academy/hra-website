/**
 * 홈페이지 관리자 회원 관리의 PostgreSQL 접근을 소유합니다.
 * 표시 열만 조회하고 마지막 관리자 보호·세션 무효화는 기존 단일 SQL 그대로 실행합니다.
 */
import "server-only";
import { desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { users, cohorts } from "@/lib/db/schema";

/** 목록에는 인증 정보 없이 기존 일곱 표시 열만 조회합니다. */
export async function listUsers() {
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    cohortId: users.cohortId,
    image: users.image,
    createdAt: users.createdAt,
  }).from(users).orderBy(desc(users.createdAt));
}

/** 상세의 비밀번호는 원문 대신 존재 여부만 SQL에서 투영합니다. */
export async function getUser(userId: string) {
  const [user] = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    cohortId: users.cohortId,
    image: users.image,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    hasPassword: isNotNull(users.passwordHash),
  }).from(users).where(eq(users.id, userId)).limit(1);
  return user;
}

/** 기수 드롭다운의 두 표시 열과 숫자 내림차순 정렬을 유지합니다. */
export async function listCohorts() {
  return db.select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts).orderBy(cohortNumberDesc(cohorts.name));
}

/** 최초 확인과 0행 경합 분류 모두 동일한 ID 단건 조회를 사용합니다. */
export async function findUserId(userId: string) {
  const [existing] = await db.select({ id: users.id })
    .from(users).where(eq(users.id, userId)).limit(1);
  return existing;
}

/** 기수 UUID 분기에서만 실제 기수 존재 여부를 확인합니다. */
export async function findCohortIds(cohortId: string) {
  return db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.id, cohortId)).limit(1);
}

/**
 * 모든 ADMIN 행을 잠근 단일 문장으로 마지막 관리자와 세션 버전을 보호합니다.
 * SET 좌변은 컬럼 식별자만 사용하고 NULL-safe 비교로 실제 변경에서만 버전을 증가시킵니다.
 * 기존 CTE·조건·CASE·RETURNING은 그대로 유지합니다.
 */
export async function updateGroup(userId: string, newRole: string, newCohortId: string | null) {
  const result = await db.execute(sql`
    WITH admin_lock AS (
      SELECT id FROM ${users} WHERE ${users.role} = 'ADMIN' FOR UPDATE
    )
    UPDATE ${users}
    SET
      ${sql.identifier(users.role.name)} = ${newRole}::user_role,
      ${sql.identifier(users.cohortId.name)} = ${newCohortId}::uuid,
      ${sql.identifier(users.sessionVersion.name)} = CASE
        WHEN ${users.role} IS DISTINCT FROM ${newRole}::user_role
          OR ${users.cohortId} IS DISTINCT FROM ${newCohortId}::uuid
        THEN ${users.sessionVersion} + 1
        ELSE ${users.sessionVersion}
      END,
      ${sql.identifier(users.updatedAt.name)} = now()
    WHERE ${users.id} = ${userId}::uuid
      AND (
        ${users.role} <> 'ADMIN'
        OR ${newRole}::user_role = 'ADMIN'
        OR (SELECT count(*) FROM admin_lock) > 1
      )
    RETURNING ${users.id};
  `);
  return result.rowCount ?? 0;
}

/**
 * 관리자 잠금·개수 검사·삭제를 한 문장으로 실행합니다.
 * 삭제된 계정의 세션 종료는 기존 인증 계층의 사용자 없음 판정이 담당합니다.
 */
export async function deleteUser(userId: string) {
  const result = await db.execute(sql`
      WITH admin_lock AS (
        SELECT id FROM ${users} WHERE ${users.role} = 'ADMIN' FOR UPDATE
      )
      DELETE FROM ${users}
      WHERE ${users.id} = ${userId}::uuid
        AND (
          ${users.role} <> 'ADMIN'
          OR (SELECT count(*) FROM admin_lock) > 1
        )
      RETURNING ${users.id};
    `);
  return result.rowCount ?? 0;
}
