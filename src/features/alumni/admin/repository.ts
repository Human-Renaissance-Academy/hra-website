/**
 * 관리자 수료생 이야기의 PostgreSQL 접근을 소유합니다.
 * 기존 조회·조건부 갱신·첨부 배치·단일 반전 SQL 체인을 유지합니다.
 */
import "server-only";
import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { alumniStories, alumniStoryImages } from "@/lib/db/schema";

export type AlumniAdminItem = {
  readonly id: string; readonly name: string; readonly quote: string;
  readonly content: string; readonly pinned: boolean;
};
export type AlumniStoryInput = {
  readonly name: string; readonly title?: string; readonly quote: string;
  readonly content: string; readonly imageUrl?: string; readonly isFeatured: boolean;
};
export type AlumniAdminStory = {
  readonly name: string; readonly title: string | null; readonly quote: string;
  readonly content: string; readonly imageUrl: string | null; readonly isFeatured: boolean;
};
export type AlumniStoryWrite = {
  readonly id: string; readonly story: AlumniStoryInput; readonly uploadedUrls: readonly string[];
};

/** 목록의 다섯 표시 열을 고정·작성일 역순으로 읽습니다. */
export async function listAdminItems(): Promise<AlumniAdminItem[]> {
  return db.select({
    id: alumniStories.id,
    name: alumniStories.name,
    quote: alumniStories.quote,
    content: alumniStories.content,
    pinned: alumniStories.pinned,
  }).from(alumniStories).orderBy(desc(alumniStories.pinned), desc(alumniStories.createdAt));
}

/** 편집 폼의 여섯 열만 기존 관계형 조회 체인으로 읽습니다. */
export async function getAdminStory(id: string): Promise<AlumniAdminStory | null> {
  const story = await db.query.alumniStories.findFirst({
    where: eq(alumniStories.id, id),
    columns: { name: true, title: true, quote: true, content: true, imageUrl: true, isFeatured: true },
  });
  return story ?? null;
}

/** 생성 전과 커밋 응답 유실 확인에 같은 요청 키 조회를 사용합니다. */
export async function findCreatedStory(id: string) {
  const [story] = await db.select({ id: alumniStories.id }).from(alumniStories).where(eq(alumniStories.id, id)).limit(1);
  return story;
}

/** 신규 순서 결정에 필요한 최댓값만 읽습니다. */
export async function getMaxOrder() {
  const [{ maxOrder }] = await db.select({ maxOrder: max(alumniStories.order) }).from(alumniStories);
  return maxOrder;
}

/** 첨부가 있으면 글과 이미지 메타를 기존 하나의 배치로 저장합니다. */
export async function insertStory(input: AlumniStoryWrite, nextOrder: number): Promise<void> {
  const { id, story, uploadedUrls } = input;
  const insertStory = db.insert(alumniStories).values({
    id,
    name: story.name,
    title: story.title ?? null,
    quote: story.quote,
    content: story.content,
    imageUrl: story.imageUrl || uploadedUrls[0] || null,
    isFeatured: story.isFeatured,
    order: nextOrder,
  });
  if (uploadedUrls.length > 0) {
    await db.batch([
      insertStory,
      db.insert(alumniStoryImages).values(uploadedUrls.map((url, index) => ({
        alumniStoryId: id,
        url,
        order: index,
      }))),
    ]);
  } else {
    await insertStory;
  }
}

/** 커밋된 첨부 URL로 미참조 업로드를 구분합니다. */
export async function listReferencedImages(id: string) {
  return db.select({ url: alumniStoryImages.url }).from(alumniStoryImages).where(eq(alumniStoryImages.alumniStoryId, id));
}

/** 업로드 전에 기존 대표 이미지와 대상 존재를 확인합니다. */
export async function getExistingImage(id: string) {
  const [existing] = await db.select({ imageUrl: alumniStories.imageUrl }).from(alumniStories).where(eq(alumniStories.id, id));
  return existing;
}

/** 대표 이미지 이전 값 조건으로 동시 변경을 덮어쓰지 않습니다. */
export async function updateStory(input: AlumniStoryWrite, existingImageUrl: string | null): Promise<boolean> {
  const { id, story, uploadedUrls } = input;
  const [updated] = await db.update(alumniStories).set({
    name: story.name,
    title: story.title ?? null,
    quote: story.quote,
    content: story.content,
    imageUrl: uploadedUrls[0] || story.imageUrl || existingImageUrl,
    isFeatured: story.isFeatured,
  }).where(and(
    eq(alumniStories.id, id),
    existingImageUrl ? eq(alumniStories.imageUrl, existingImageUrl) : isNull(alumniStories.imageUrl),
  )).returning({ id: alumniStories.id });
  return Boolean(updated);
}

/** 수정 성공 이후 기존 첨부 삽입 체인을 실행합니다. */
export async function insertImages(id: string, uploadedUrls: readonly string[]): Promise<void> {
  await db.insert(alumniStoryImages).values(uploadedUrls.map((url, index) => ({
    alumniStoryId: id,
    url,
    order: index,
  })));
}

/** 현재 저장값을 한 UPDATE 문으로 반전합니다. */
export async function togglePin(id: string) {
  const [updated] = await db.update(alumniStories)
    .set({ pinned: sql`NOT ${alumniStories.pinned}` })
    .where(eq(alumniStories.id, id))
    .returning({ pinned: alumniStories.pinned });
  return updated;
}

/** 1부터 시작하는 순서 전체를 단일 CASE 갱신으로 저장합니다. */
export async function reorderStories(validIds: readonly string[]) {
  return reorderByCase({
    table: alumniStories,
    idColumn: alumniStories.id,
    targetColumn: alumniStories.order,
    assignments: validIds.map((id, index) => ({ id, value: index + 1 })),
  });
}

/** 파일 소유권을 추정하지 않고 글 행만 멱등 삭제합니다. */
export async function deleteStory(id: string): Promise<void> {
  await db.delete(alumniStories).where(eq(alumniStories.id, id));
}
