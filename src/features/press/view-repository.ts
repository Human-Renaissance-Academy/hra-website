/**
 * 공개 언론보도 클릭의 조회수 SQL만 소유하는 PostgreSQL 저장소입니다.
 * 관리자 저장소와 독립적으로 기존 단일 증가 UPDATE 체인을 유지합니다.
 */
import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

/** 검증된 기사 ID의 조회수를 원자적으로 한 번 증가시킵니다. */
export async function incrementViewCount(id: string): Promise<void> {
  await db
    .update(pressArticles)
    .set({ viewCount: sql`${pressArticles.viewCount} + 1` })
    .where(eq(pressArticles.id, id));
}
