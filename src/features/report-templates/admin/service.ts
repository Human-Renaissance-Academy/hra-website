/**
 * 보고서 양식 관리자 Application Service입니다.
 * 관리자 재인가·중복 판단·비공개 정책을 소유하고 Web 후처리와 오류 catch는 어댑터에 남깁니다.
 */
import "server-only";
import * as repository from "./repository";
import type { TemplateEditItem, TemplateInput, TemplateListItem } from "./repository";
export type { TemplateEditItem, TemplateInput, TemplateListItem } from "./repository";

export type TemplateActor = { userId: string; role: string };

/** FAQ와 동일하게 다른 어댑터의 직접 호출도 관리자 권한을 다시 확인합니다. */
function assertAdmin(actor: TemplateActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("TEMPLATE_ADMIN_REQUIRED");
  }
}

/** 목록에는 표시용 아홉 필드만 반환합니다. */
export async function listAdminTemplates(actor: TemplateActor): Promise<TemplateListItem[]> {
  assertAdmin(actor);
  return (await repository.listTemplates()).map(row => ({
    id: row.id, slug: row.slug, title: row.title, category: row.category,
    reportCategory: row.reportCategory, version: row.version, published: row.published,
    order: row.order, updatedAt: row.updatedAt,
  }));
}

/** 편집에는 ID와 폼 초기값만 반환하며 DB 메타데이터는 노출하지 않습니다. */
export async function getAdminTemplate(actor: TemplateActor, id: string): Promise<TemplateEditItem | null> {
  assertAdmin(actor);
  const row = await repository.findById(id);
  return row ? {
    id: row.id, slug: row.slug, title: row.title, category: row.category,
    reportCategory: row.reportCategory, description: row.description, version: row.version,
    body: row.body, published: row.published, order: row.order,
  } : null;
}

/** 생성 사전 조회는 어댑터의 기존 catch 바깥에서 호출합니다. */
export async function hasDuplicateSlug(actor: TemplateActor, slug: string): Promise<boolean> {
  assertAdmin(actor);
  return Boolean(await repository.findBySlug(slug));
}

export type TemplateUpdatePreparation =
  | { readonly kind: "duplicate" }
  | { readonly kind: "missing" }
  | { readonly kind: "ready"; readonly oldSlug: string };

/** 중복 조회 다음 이전 slug 조회를 수행해 HEAD의 순서와 오류 전파 범위를 유지합니다. */
export async function prepareTemplateUpdate(
  actor: TemplateActor, id: string, slug: string,
): Promise<TemplateUpdatePreparation> {
  assertAdmin(actor);
  const existing = await repository.findBySlug(slug);
  if (existing && existing.id !== id) return { kind: "duplicate" };
  const previous = await repository.findById(id);
  if (!previous) return { kind: "missing" };
  return { kind: "ready", oldSlug: previous.slug };
}

/** 사전 조회와 쓰기를 나눠 생성 어댑터의 catch 범위를 바꾸지 않습니다. */
export async function createAdminTemplate(actor: TemplateActor, input: TemplateInput): Promise<void> {
  assertAdmin(actor);
  await repository.insertTemplate(input);
}

/** 실제 갱신 결과로 조회 후 삭제 경합을 기존 누락 결과로 전달합니다. */
export async function updateAdminTemplate(actor: TemplateActor, id: string, input: TemplateInput): Promise<boolean> {
  assertAdmin(actor);
  return repository.updateTemplate(id, input);
}

/** 비공개는 조회 후 published만 바꾸며 Blob과 내장 기본본에는 손대지 않습니다. */
export async function unpublishAdminTemplate(actor: TemplateActor, id: string): Promise<{ slug: string } | null> {
  assertAdmin(actor);
  const target = await repository.findById(id);
  if (!target) return null;
  await repository.unpublishTemplate(id);
  return { slug: target.slug };
}
