/**
 * 관리자 가이드북의 재인가·저장 결과 판단·최소 DTO를 제공하는 Application Service입니다.
 * 웹 입력 변환·업로드 참조 검증·캐시 후처리·예외 응답은 웹 어댑터에 남깁니다.
 */
import "server-only";

import * as repository from "./repository";
import type { GuidebookInput, GuidebookReplacement } from "./repository";

export type GuidebookActor = { userId: string; role: string };
export type GuidebookListItem = {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly createdAt: Date;
};
type GuidebookResult = { readonly success: boolean; readonly error?: string };

/** 웹 외의 호출자도 홈페이지 관리자 역할과 유효한 주체를 먼저 확인합니다. */
function assertAdmin(actor: GuidebookActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("GUIDEBOOK_ADMIN_REQUIRED");
  }
}

/** 목록 화면에는 표시 필드만 반환하고 비공개 원본 URL을 전달하지 않습니다. */
export async function listAdminGuidebooks(actor: GuidebookActor): Promise<GuidebookListItem[]> {
  assertAdmin(actor);
  const rows = await repository.listGuidebooks();
  return rows.map(row => ({ id: row.id, title: row.title, fileName: row.fileName, createdAt: row.createdAt }));
}

/** 편집 폼에는 제목·파일명만 제공하며 대상 부재는 웹이 404로 변환합니다. */
export async function getAdminGuidebook(actor: GuidebookActor, id: string) {
  assertAdmin(actor);
  const row = await repository.findGuidebook(id);
  return row ? { title: row.title, fileName: row.fileName } : null;
}

/** 파일 검증 전에 대상을 조회해 기존 검증 순서와 낙관적 비교용 URL을 유지합니다. */
export async function getGuidebookUpdateTarget(actor: GuidebookActor, id: string) {
  assertAdmin(actor);
  const row = await repository.findGuidebook(id);
  return row ? { fileUrl: row.fileUrl } : null;
}

/** 참조 검증을 마친 파일과 제목의 저장 완료를 기다립니다. */
export async function createAdminGuidebook(actor: GuidebookActor, input: GuidebookInput): Promise<void> {
  assertAdmin(actor);
  await repository.insertGuidebook(input);
}

/** 이전 URL이 달라졌거나 대상이 없어졌으면 원래 파일 교체 경합 결과를 반환합니다. */
export async function replaceAdminGuidebookFile(actor: GuidebookActor, id: string, input: GuidebookReplacement): Promise<GuidebookResult> {
  assertAdmin(actor);
  if (!(await repository.replaceGuidebookFile(id, input))) {
    return { success: false, error: "가이드북 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
  }
  return { success: true };
}

/** 제목 갱신의 0행 결과는 파일 경합이 아니라 누락 대상으로 처리합니다. */
export async function updateAdminGuidebookTitle(actor: GuidebookActor, id: string, title: string): Promise<GuidebookResult> {
  assertAdmin(actor);
  if (!(await repository.updateGuidebookTitle(id, title))) {
    return { success: false, error: "가이드북을 찾을 수 없습니다." };
  }
  return { success: true };
}

/** 기존 대상 조회 후 삭제하며 조회 전후의 부재를 같은 결과로 처리합니다. */
export async function deleteAdminGuidebook(actor: GuidebookActor, id: string): Promise<GuidebookResult> {
  assertAdmin(actor);
  const target = await repository.findGuidebook(id);
  if (!target || !(await repository.deleteGuidebook(id))) {
    return { success: false, error: "가이드북을 찾을 수 없습니다." };
  }
  return { success: true };
}
