/**
 * 관리자 기수 관리의 PostgreSQL 접근을 소유하는 저장소입니다.
 * 기존 Drizzle 호출 순서와 제출 보존 제약 검사를 유지하고 화면용 필드만 조회합니다.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationForms, applicationSubmissions, cohorts, legacyApplications } from "@/lib/db/schema";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import { hasSubmissionDeleteGuards } from "@/lib/db/submission-delete-guards";

export type CohortInput = {
  readonly name: string;
  readonly description: string | null;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly isActive: boolean;
};
export type CohortListItem = CohortInput & { readonly id: string };
export type CohortEditItem = CohortInput & { readonly imageUrl: string | null };
export type CohortWriteInput = CohortEditItem & { readonly order?: number };

/** 목록은 기수명 숫자 내림차순으로 기존 여섯 필드를 조회합니다. */
export async function listCohorts(): Promise<CohortListItem[]> {
  return db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      description: cohorts.description,
      isActive: cohorts.isActive,
      startDate: cohorts.startDate,
      endDate: cohorts.endDate,
    })
    .from(cohorts)
    .orderBy(cohortNumberDesc(cohorts.name));
}

/** 편집 화면에는 실제 폼에 전달하는 여섯 필드만 조회합니다. */
export async function getCohort(id: string): Promise<CohortEditItem | undefined> {
  const [cohort] = await db
    .select({
      name: cohorts.name,
      description: cohorts.description,
      imageUrl: cohorts.imageUrl,
      startDate: cohorts.startDate,
      endDate: cohorts.endDate,
      isActive: cohorts.isActive,
    })
    .from(cohorts)
    .where(eq(cohorts.id, id))
    .limit(1);
  return cohort;
}

/** 수정 업로드 전에 대상 존재와 현재 이미지를 기존 단일 열 조회로 확인합니다. */
export async function getCohortImage(id: string): Promise<{ imageUrl: string | null } | undefined> {
  const [existingCohort] = await db
    .select({ imageUrl: cohorts.imageUrl })
    .from(cohorts)
    .where(eq(cohorts.id, id))
    .limit(1);
  return existingCohort;
}

/** 생성은 업로드 완료 후 기존 insert·values 체인으로 저장합니다. */
export async function insertCohort(input: CohortWriteInput): Promise<void> {
  await db.insert(cohorts).values(input);
}

/** 수정은 기존 ID 조건만 유지하며 별도 낙관적 조건이나 returning을 추가하지 않습니다. */
export async function updateCohort(id: string, input: CohortWriteInput): Promise<void> {
  await db.update(cohorts).set(input).where(eq(cohorts.id, id));
}

/** 운영 보호 제약이 설치되어 있는지 기존 인프라 헬퍼로 확인합니다. */
export async function hasDeleteGuards(): Promise<boolean> {
  return hasSubmissionDeleteGuards();
}

/** 사전 검사는 안내용이며 검사 뒤 경합은 RESTRICT 외래키가 최종 차단합니다. */
export async function getDeletionReferences(id: string): Promise<boolean> {
  const [legacy, submission] = await Promise.all([
    db.select({ id: legacyApplications.id }).from(legacyApplications)
      .where(eq(legacyApplications.cohortId, id)).limit(1),
    db.select({ id: applicationSubmissions.id }).from(applicationSubmissions)
      .innerJoin(applicationForms, eq(applicationSubmissions.formId, applicationForms.id))
      .where(eq(applicationForms.cohortId, id)).limit(1),
  ]);
  return legacy.length > 0 || submission.length > 0;
}

/** 실제 삭제된 행으로 누락 대상을 구분합니다. */
export async function deleteCohort(id: string): Promise<boolean> {
  const [deleted] = await db.delete(cohorts).where(eq(cohorts.id, id))
    .returning({ id: cohorts.id });
  return Boolean(deleted);
}

/** DB 오류 원문은 변환하지 않고 기존 두 외래키 이름만 분류합니다. */
export function isSubmissionReferenceError(error: unknown): boolean {
  return isConstraintViolation(error, "23503", "applications_cohort_id_cohorts_id_fk") ||
    isConstraintViolation(error, "23503", "application_submissions_form_id_application_forms_id_fk");
}
