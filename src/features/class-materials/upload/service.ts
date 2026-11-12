/**
 * 교수진·관리자 공용 강의자료 생성 서비스입니다.
 * 생성은 관리자 전용 업무와 분리하여 기존 FACULTY 업로드 권한을 유지합니다.
 */
import "server-only";
import { insertMaterial, type ClassMaterialUpload } from "./repository";

/** 파일 참조 검증을 마친 입력만 받으며 저장 전에 업로드 역할을 다시 확인합니다. */
export async function createUploadedMaterial(actor: { readonly userId: string; readonly role: string }, input: ClassMaterialUpload) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId ||
      (actor.role !== "ADMIN" && actor.role !== "FACULTY")) {
    throw new Error("CLASS_MATERIAL_UPLOAD_REQUIRED");
  }
  await insertMaterial(input, actor.userId);
}
