/**
 * 언론보도 관리자 Application Service입니다.
 * 모든 진입에서 관리자 주체를 다시 확인하고 최소 DTO·생성 순서·저장 결과를 제공합니다.
 */
import "server-only";

import * as pressRepository from "./repository";
import type { PressAdminItem, PressArticleValues } from "./repository";

export type PressActor = { userId: string; role: string };
export type PressArticleInput = {
  readonly title: string;
  readonly source: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly description?: string;
  readonly imageUrl?: string;
};

/** FAQ와 같은 계약으로 웹 외 호출에서도 홈페이지 관리자 권한을 확인합니다. */
function assertAdmin(actor: PressActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("PRESS_ADMIN_REQUIRED");
  }
}

/** 검증된 날짜와 선택 문자열을 기존 저장 형식으로 변환합니다. */
function articleValues(input: PressArticleInput): PressArticleValues {
  return {
    title: input.title,
    source: input.source,
    url: input.url,
    publishedAt: new Date(input.publishedAt),
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
  };
}

/** 관리자 목록에는 정렬된 네 표시 필드만 제공합니다. */
export async function listAdminItems(actor: PressActor): Promise<PressAdminItem[]> {
  assertAdmin(actor);
  const rows = await pressRepository.listItems();
  return rows.map(row => ({ id: row.id, title: row.title, source: row.source, publishedAt: row.publishedAt }));
}

/** 편집 화면에는 여섯 입력 필드만 제공하고 없는 행은 null로 반환합니다. */
export async function getAdminItem(actor: PressActor, id: string): Promise<PressArticleValues | null> {
  assertAdmin(actor);
  const row = await pressRepository.getItem(id);
  return row ? {
    title: row.title, source: row.source, url: row.url, publishedAt: row.publishedAt,
    description: row.description, imageUrl: row.imageUrl,
  } : null;
}

/** 기존 별도 최댓값 조회 다음 삽입을 유지하여 새 기사를 목록 끝에 둡니다. */
export async function createItem(actor: PressActor, input: PressArticleInput): Promise<void> {
  assertAdmin(actor);
  const nextOrder = (await pressRepository.getMaxOrder() ?? 0) + 1;
  await pressRepository.insertItem(articleValues(input), nextOrder);
}

/** 실제 갱신 행이 없으면 웹 adapter가 기존 누락 응답을 반환하도록 알립니다. */
export async function updateItem(actor: PressActor, id: string, input: PressArticleInput): Promise<boolean> {
  assertAdmin(actor);
  return pressRepository.updateItem(id, articleValues(input));
}

/** 참조 파일은 삭제하지 않고 기사 레코드만 삭제합니다. */
export async function deleteItem(actor: PressActor, id: string): Promise<void> {
  assertAdmin(actor);
  await pressRepository.deleteItem(id);
}

/** 원자 갱신 건수와 요청 건수를 비교하고 웹 오류 기록용 실제 건수를 제공합니다. */
export async function reorderItems(actor: PressActor, ids: readonly string[]): Promise<{ matched: boolean; affected: number }> {
  assertAdmin(actor);
  const affected = await pressRepository.reorderItems(ids);
  return { matched: affected === ids.length, affected };
}
