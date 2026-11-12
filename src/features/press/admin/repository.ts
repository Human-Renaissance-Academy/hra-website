/**
 * 언론보도 관리자 조회·저장 SQL 접근을 소유하는 PostgreSQL 저장소입니다.
 * 기존 Drizzle 체인·조건·투영 순서를 유지하며 웹 후처리는 호출자에게 맡깁니다.
 */
import "server-only";

import { asc, eq, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { pressArticles } from "@/lib/db/schema";

export type PressAdminItem = {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly publishedAt: Date;
};
export type PressArticleValues = {
  readonly title: string;
  readonly source: string;
  readonly url: string;
  readonly publishedAt: Date;
  readonly description: string | null;
  readonly imageUrl: string | null;
};

/** 목록의 네 표시 열과 순서·생성일 오름차순을 그대로 유지합니다. */
export async function listItems(): Promise<PressAdminItem[]> {
  return db
    .select({
      id: pressArticles.id,
      title: pressArticles.title,
      source: pressArticles.source,
      publishedAt: pressArticles.publishedAt,
    })
    .from(pressArticles)
    .orderBy(asc(pressArticles.order), asc(pressArticles.createdAt));
}

/** 기존 편집 조회의 전체 행 체인을 유지하고 서비스가 표시 DTO를 골라 반환합니다. */
export async function getItem(id: string): Promise<PressArticleValues | null> {
  const [article] = await db.select().from(pressArticles).where(eq(pressArticles.id, id)).limit(1);
  return article ?? null;
}

/** 생성 순서 계산에 필요한 최댓값 조회를 별도 SQL로 유지합니다. */
export async function getMaxOrder(): Promise<number | null> {
  const [{ maxOrder }] = await db.select({ maxOrder: max(pressArticles.order) }).from(pressArticles);
  return maxOrder;
}

/** 서비스가 변환한 기사 값과 계산한 순서를 기존 열 순서로 저장합니다. */
export async function insertItem(input: PressArticleValues, order: number): Promise<void> {
  await db.insert(pressArticles).values({
    title: input.title,
    source: input.source,
    url: input.url,
    publishedAt: input.publishedAt,
    description: input.description,
    imageUrl: input.imageUrl,
    order,
  });
}

/** ID 조건 UPDATE의 반환 행 수로 저장 직전 삭제를 감지합니다. */
export async function updateItem(id: string, input: PressArticleValues): Promise<boolean> {
  const updated = await db
    .update(pressArticles)
    .set({
      title: input.title,
      source: input.source,
      url: input.url,
      publishedAt: input.publishedAt,
      description: input.description,
      imageUrl: input.imageUrl,
    })
    .where(eq(pressArticles.id, id))
    .returning({ id: pressArticles.id });
  return updated.length > 0;
}

/** 입력 이미지 URL은 소유권 증거가 아니므로 기사 레코드만 멱등 삭제합니다. */
export async function deleteItem(id: string): Promise<void> {
  await db.delete(pressArticles).where(eq(pressArticles.id, id));
}

/** 기존 단일 원자 CASE 갱신과 1부터 시작하는 순서를 유지합니다. */
export async function reorderItems(ids: readonly string[]): Promise<number> {
  const { affected } = await reorderByCase({
    table: pressArticles,
    idColumn: pressArticles.id,
    targetColumn: pressArticles.order,
    assignments: ids.map((id, index) => ({ id, value: index + 1 })),
  });
  return affected;
}
