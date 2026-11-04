/**
 * 교수진 관리자 조회·저장의 Application Service입니다.
 * 관리자 재인가, 표시 DTO 투영과 기존 조회·업로드·조건부 저장 순서를 소유합니다.
 */
import "server-only";

import * as repository from "./repository";
import type { FacultyEditItem, FacultyInput, FacultyListItem, FacultyUpdateValues } from "./repository";
import type { ValidatedAdminImage } from "@/lib/admin-image-validation";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";

export type FacultyActor = { userId: string; role: string };
export type { FacultyEditItem, FacultyInput, FacultyListItem } from "./repository";
export type FacultySaveInput = FacultyInput & {
  readonly directImageUrl: string | null;
  readonly image: ValidatedAdminImage | undefined;
};

/** Web adapter를 우회한 호출에서도 홈페이지 관리자 주체를 다시 확인합니다. */
function assertAdmin(actor: FacultyActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("FACULTY_ADMIN_REQUIRED");
  }
}

/** 관리자 목록에는 내부 메타데이터를 제외한 표시 필드만 새 객체로 전달합니다. */
export async function listAdminFaculty(actor: FacultyActor): Promise<FacultyListItem[]> {
  assertAdmin(actor);
  const rows = await repository.listFacultyRows();
  return rows.map(row => ({ id: row.id, name: row.name, category: row.category,
    currentPosition: row.currentPosition, formerPosition: row.formerPosition }));
}

/** 편집 폼에 필요한 필드만 반환하며 누락 행은 adapter가 notFound로 처리합니다. */
export async function getAdminFaculty(actor: FacultyActor, id: string): Promise<FacultyEditItem | null> {
  assertAdmin(actor);
  const row = await repository.getFacultyRow(id);
  return row ? { id: row.id, name: row.name, category: row.category,
    currentPosition: row.currentPosition, formerPosition: row.formerPosition,
    imageUrl: row.imageUrl, order: row.order } : null;
}

/** 검증된 사진을 기존 UUID 경로·원장 예약 인자로 업로드합니다. */
async function uploadFacultyImage(image: ValidatedAdminImage, uploadedById: string) {
  return uploadWithOwnedIntent({
    namespace: "faculty",
    extension: image.extension,
    body: image.file,
    contentType: image.contentType,
    uploadedById,
  });
}

/** 직접 URL을 우선 사용하고 서버 사진은 삽입 전에 업로드합니다. */
export async function createAdminFaculty(actor: FacultyActor, input: FacultySaveInput): Promise<void> {
  assertAdmin(actor);
  const imageUrl = input.directImageUrl ?? (input.image ? await uploadFacultyImage(input.image, actor.userId) : null);
  await repository.insertFaculty(input, imageUrl);
}

/** 기존 행 조회 후 사진을 업로드하며 0행 수정은 기존 충돌 결과로 반환합니다. */
export async function updateAdminFaculty(
  actor: FacultyActor, id: string, input: FacultySaveInput,
): Promise<{ success: boolean; message: string }> {
  assertAdmin(actor);
  const existingFaculty = await repository.getExistingImage(id);
  if (!existingFaculty) {
    return { success: false, message: "교수진을 찾을 수 없습니다." };
  }

  // 사진이 없는 요청에서는 imageUrl을 SET에 넣지 않는 기존 동작을 유지합니다.
  const updateValues: FacultyUpdateValues = {
    name: input.name,
    category: input.category,
    currentPosition: input.currentPosition ?? null,
    formerPosition: input.formerPosition ?? null,
    order: input.order,
  };
  if (input.directImageUrl) {
    updateValues.imageUrl = input.directImageUrl;
  } else if (input.image) {
    updateValues.imageUrl = await uploadFacultyImage(input.image, actor.userId);
  }

  // 기존 파일은 업로드 소유권이 확인되지 않아 여기서 즉시 삭제하지 않습니다.
  const updated = await repository.updateFacultyRow(id, updateValues, existingFaculty.imageUrl);
  if (!updated) {
    return { success: false, message: "교수진 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
  }
  return { success: true, message: "" };
}

/** 삭제 대상이 없어도 기존처럼 오류 없이 종료합니다. */
export async function deleteAdminFaculty(actor: FacultyActor, id: string): Promise<void> {
  assertAdmin(actor);
  await repository.deleteFacultyRow(id);
}
