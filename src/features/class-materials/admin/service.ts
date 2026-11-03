/**
 * 관리자 강의자료 업무의 Application Service입니다.
 * 모든 진입에서 관리자 주체를 다시 확인하며 Web 후처리와 파일 입력 파싱은 호출자가 소유합니다.
 */
import "server-only";
import * as repository from "./repository";
import type { ClassMaterialTextFields } from "./repository";

export type ClassMaterialActor = { readonly userId: string; readonly role: string };

/** 다른 어댑터의 호출도 빈 주체·비관리자이면 저장소 접근 전에 거부합니다. */
function assertAdmin(actor: ClassMaterialActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("CLASS_MATERIAL_ADMIN_REQUIRED");
  }
}

/** 관리자 목록에는 표시 필드만 제공합니다. */
export async function listAdminMaterials(actor: ClassMaterialActor) {
  assertAdmin(actor);
  const rows = await repository.listMaterials();
  return rows.map((row) => ({ id: row.id, title: row.title, weekNumber: row.weekNumber,
    lectureTitle: row.lectureTitle, audience: row.audience, createdAt: row.createdAt, uploaderName: row.uploaderName }));
}

/** 편집 폼은 내부 파일 URL이나 감사 열을 받지 않습니다. */
export async function getAdminMaterial(actor: ClassMaterialActor, id: string) {
  assertAdmin(actor);
  const row = await repository.getMaterial(id);
  return row ? { title: row.title, weekNumber: row.weekNumber, lectureTitle: row.lectureTitle,
    audience: row.audience, fileName: row.fileName } : null;
}

/** 수정 전 존재 확인과 날짜·파일 참조 읽기를 같은 인가 경계로 제공합니다. */
export async function getAdminMutationTarget(actor: ClassMaterialActor, id: string) {
  assertAdmin(actor);
  const row = await repository.getMutationTarget(id);
  return row ? { fileUrl: row.fileUrl, classDate: row.classDate } : null;
}

/** 검증된 파일 교체 여부에 따라 기존 두 낙관적 쓰기 정책을 선택합니다. */
export async function updateAdminMaterial(actor: ClassMaterialActor, input: {
  readonly id: string;
  readonly textFields: ClassMaterialTextFields;
  readonly file?: { readonly url: string; readonly fileName: string; readonly previousUrl: string };
}) {
  assertAdmin(actor);
  return input.file
    ? repository.replaceMaterialFile(input.id, input.textFields, input.file)
    : repository.updateMaterialText(input.id, input.textFields);
}

/** 삭제 전 조회와 실제 삭제 결과를 모두 검사하는 기존 정책을 유지합니다. */
export async function deleteAdminMaterial(actor: ClassMaterialActor, id: string) {
  assertAdmin(actor);
  const target = await repository.getMutationTarget(id);
  if (!target) return false;
  return repository.deleteMaterial(id);
}
