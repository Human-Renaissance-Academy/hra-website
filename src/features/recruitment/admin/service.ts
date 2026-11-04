/**
 * 관리자 기수 관리의 Application Service입니다.
 * 관리자 재인가와 이미지 선택·제출 보존 규칙을 소유하며 Web 후처리는 호출자에게 맡깁니다.
 */
import "server-only";
import * as repository from "./repository";
import type { CohortEditItem, CohortInput, CohortListItem, CohortWriteInput } from "./repository";
export type { CohortEditItem, CohortInput, CohortListItem } from "./repository";
// Web 후처리 오류도 동일하게 분류하며 외래키 이름은 저장소 한 곳에서만 정의합니다.
export { isSubmissionReferenceError as isCohortReferenceViolation } from "./repository";

export type CohortActor = { userId: string; role: string };
type CohortResult = { readonly success: boolean; readonly message: string; readonly fieldErrors?: Record<string, string> };
type CohortUpload = { readonly imageUrl: string | null; readonly error: string | null };
export type CohortUpdateInput = CohortInput & {
  readonly order?: number;
  readonly shouldRemoveImage: boolean;
  readonly uploadImage: () => Promise<CohortUpload>;
};

/** Web 외의 호출에서도 관리자 역할과 로그인 식별자를 다시 확인합니다. */
function assertAdmin(actor: CohortActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("COHORT_ADMIN_REQUIRED");
  }
}

/** 관리자 목록의 표시값만 반환해 내부 열의 혼입을 막습니다. */
export async function listAdminCohorts(actor: CohortActor): Promise<CohortListItem[]> {
  assertAdmin(actor);
  return (await repository.listCohorts()).map(row => ({
    id: row.id, name: row.name, description: row.description, isActive: row.isActive,
    startDate: row.startDate, endDate: row.endDate,
  }));
}

/** 편집 화면의 입력값만 반환하고 누락 시 기존 undefined를 유지합니다. */
export async function getAdminCohort(actor: CohortActor, id: string): Promise<CohortEditItem | undefined> {
  assertAdmin(actor);
  const row = await repository.getCohort(id);
  return row ? { name: row.name, description: row.description, imageUrl: row.imageUrl,
    startDate: row.startDate, endDate: row.endDate, isActive: row.isActive } : undefined;
}

/** 입력 검증과 소유권 선예약 업로드 뒤 생성 완료까지 기다립니다. */
export async function createAdminCohort(actor: CohortActor, input: CohortWriteInput): Promise<void> {
  assertAdmin(actor);
  await repository.insertCohort(input);
}

/** 대상 확인→Web 이미지 검증·업로드→이미지 선택→저장의 기존 순서를 유지합니다. */
export async function updateAdminCohort(actor: CohortActor, id: string, input: CohortUpdateInput): Promise<CohortResult> {
  assertAdmin(actor);
  const existingCohort = await repository.getCohortImage(id);
  if (!existingCohort) return { success: false, message: "기수를 찾을 수 없습니다." };
  const uploadedImage = await input.uploadImage();
  if (uploadedImage.error) return { success: false, message: uploadedImage.error, fieldErrors: { image: uploadedImage.error } };
  let nextImageUrl = existingCohort.imageUrl;
  if (uploadedImage.imageUrl) {
    nextImageUrl = uploadedImage.imageUrl;
  } else if (input.shouldRemoveImage) {
    nextImageUrl = null;
  }
  await repository.updateCohort(id, {
    name: input.name,
    description: input.description,
    startDate: input.startDate,
    endDate: input.endDate,
    isActive: input.isActive,
    // 기수 폼에는 정렬 순서 입력이 없다. 값이 넘어온 경우에만 갱신해 기존 순서를 0 으로 덮어쓰지 않는다 (#115).
    ...(input.order !== undefined ? { order: input.order } : {}),
    imageUrl: nextImageUrl,
  });
  return { success: true, message: "" };
}

/** 제출 보호 설정과 참조를 확인하고 경합의 알려진 외래키 거절도 같은 안내로 변환합니다. */
export async function deleteAdminCohort(actor: CohortActor, id: string): Promise<CohortResult> {
  assertAdmin(actor);
  try {
    if (!await repository.hasDeleteGuards()) {
      return { success: false, message: "제출 보존 설정을 확인할 수 없어 기수를 삭제할 수 없습니다." };
    }
    if (await repository.getDeletionReferences(id)) {
      return { success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." };
    }
    if (!await repository.deleteCohort(id)) return { success: false, message: "기수를 찾을 수 없습니다." };
    return { success: true, message: "기수가 삭제되었습니다." };
  } catch (error) {
    if (repository.isSubmissionReferenceError(error)) {
      return { success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." };
    }
    // 알 수 없는 오류 원문은 Web 어댑터의 기존 로그 호출에 그대로 전달합니다.
    throw error;
  }
}
