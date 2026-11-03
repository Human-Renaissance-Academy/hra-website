/**
 * 보고서 양식 관리자 PostgreSQL 저장소입니다.
 * 기존 Drizzle 호출 순서·조회 범위·갱신 조건을 그대로 소유합니다.
 */
import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";

export type TemplateInput = {
  readonly slug: string;
  readonly title: string;
  readonly category: "template" | "guide";
  readonly reportCategory: "management-book" | "classic-book" | "business-practice" | null;
  readonly description: string | null;
  readonly version: string;
  readonly body: string;
  readonly published: boolean;
  readonly order: number;
};
export type TemplateListItem = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly category: "template" | "guide";
  readonly reportCategory: string | null;
  readonly version: string;
  readonly published: boolean;
  readonly order: number;
  readonly updatedAt: Date;
};
export type TemplateEditItem = Omit<TemplateInput, "reportCategory"> & {
  readonly id: string;
  readonly reportCategory: string | null;
};

/** 관리자 목록은 기존 아홉 필드와 순서 오름차순·수정일 내림차순을 유지합니다. */
export async function listTemplates(): Promise<TemplateListItem[]> {
  return db
    .select({
      id: reportTemplates.id,
      slug: reportTemplates.slug,
      title: reportTemplates.title,
      category: reportTemplates.category,
      reportCategory: reportTemplates.reportCategory,
      version: reportTemplates.version,
      published: reportTemplates.published,
      order: reportTemplates.order,
      updatedAt: reportTemplates.updatedAt,
    })
    .from(reportTemplates)
    .orderBy(asc(reportTemplates.order), desc(reportTemplates.updatedAt));
}

/** 사전 중복 조회는 기존 관계형 조회 체인을 변경하지 않습니다. */
export async function findBySlug(slug: string) {
  return db.query.reportTemplates.findFirst({
    where: eq(reportTemplates.slug, slug),
  });
}

/** 편집·비공개 처리의 기존 단건 조회이며 service에서 DTO를 제한합니다. */
export async function findById(id: string) {
  return db.query.reportTemplates.findFirst({
    where: eq(reportTemplates.id, id),
  });
}

/** 검증된 폼 필드를 기존 순서대로 저장합니다. */
export async function insertTemplate(input: TemplateInput): Promise<void> {
  await db.insert(reportTemplates).values({
    slug: input.slug,
    title: input.title,
    category: input.category,
    reportCategory: input.reportCategory,
    description: input.description,
    version: input.version,
    body: input.body,
    published: input.published,
    order: input.order,
  });
}

/** 실제 returning 0행을 누락으로 판단하며 ID 조건만 사용하는 HEAD 동작을 유지합니다. */
export async function updateTemplate(id: string, input: TemplateInput): Promise<boolean> {
  const updated = await db
    .update(reportTemplates)
    .set({
      slug: input.slug,
      title: input.title,
      category: input.category,
      reportCategory: input.reportCategory,
      description: input.description,
      version: input.version,
      body: input.body,
      published: input.published,
      order: input.order,
    })
    .where(eq(reportTemplates.id, id))
    .returning({ id: reportTemplates.id });
  return updated.length > 0;
}

/** 행을 삭제하지 않아 비공개 항목의 내장 기본본 차단을 유지합니다. */
export async function unpublishTemplate(id: string): Promise<void> {
  await db
    .update(reportTemplates)
    .set({ published: false })
    .where(eq(reportTemplates.id, id));
}
