/**
 * 공개 sitemap에 넣을 동적 콘텐츠 ID·수정 시각의 PostgreSQL 조회를 소유합니다.
 *
 * - 공지사항: 게시(PUBLISHED) 상태만 읽습니다. 초안은 절대 포함하지 않습니다.
 * - 수료생 이야기·갤러리: 별도 공개 상태가 없고 공개 목록·상세가 모든 행을 노출하므로 같은 범위를 사용합니다.
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
