/**
 * 공개 sitemap에 넣을 동적 콘텐츠 ID·수정 시각의 PostgreSQL 조회를 소유합니다.
 *
 * - 공지사항: 게시(PUBLISHED) 상태만 읽습니다. 초안은 절대 포함하지 않습니다.
 * - 수료생 이야기·갤러리: 현재 스키마에 게시/공개 여부 열이 없고, 공개 목록·상세 조회
 *   (src/features/alumni/public-list, src/features/gallery/public-list 등)도 모든 행을 노출하므로 같은 범위를 사용합니다.
 *   주의: 두 테이블에 게시 상태·공개 여부 열이 추가되면, 공개 목록·상세 쿼리와 "같은 필터"를
 *   여기에도 반드시 적용해야 합니다. 그렇지 않으면 비공개 항목의 URL이 sitemap에 노출됩니다.
 *   (tests/unit/seo-robots-sitemap.test.ts 가 현재 무조건 조회임을 고정하므로, 열 추가 시 함께 실패해 알려 줍니다.)
 * - ID와 수정 시각만 투영하고 본문·작성자 등 내부 열은 읽지 않습니다.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { alumniStories, galleries, notices } from "@/lib/db/schema";

/** sitemap 항목 생성에 필요한 최소 행입니다. */
export type SitemapContentRow = {
  id: string;
  updatedAt: Date;
};

/** 게시된 공지만 최근 수정순으로 최대 limit건 읽습니다. */
export async function listPublishedNoticeSitemapRows(limit: number): Promise<SitemapContentRow[]> {
  return db
    .select({ id: notices.id, updatedAt: notices.updatedAt })
    .from(notices)
    .where(eq(notices.status, "PUBLISHED"))
    .orderBy(desc(notices.updatedAt), desc(notices.id))
    .limit(limit);
}

/** 공개 수료생 이야기를 최근 수정순으로 최대 limit건 읽습니다. */
export async function listAlumniStorySitemapRows(limit: number): Promise<SitemapContentRow[]> {
  return db
    .select({ id: alumniStories.id, updatedAt: alumniStories.updatedAt })
    .from(alumniStories)
    .orderBy(desc(alumniStories.updatedAt), desc(alumniStories.id))
    .limit(limit);
}

/** 공개 갤러리 앨범을 최근 수정순으로 최대 limit건 읽습니다. */
export async function listGallerySitemapRows(limit: number): Promise<SitemapContentRow[]> {
  return db
    .select({ id: galleries.id, updatedAt: galleries.updatedAt })
    .from(galleries)
    .orderBy(desc(galleries.updatedAt), desc(galleries.id))
    .limit(limit);
}
