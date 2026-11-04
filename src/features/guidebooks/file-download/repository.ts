/**
 * 가이드북 파일 메타데이터의 PostgreSQL 조회를 소유합니다.
 * HTTP 계층에 Drizzle과 비공개 저장 위치 조회를 노출하지 않으며, 승인 회원 확인 뒤 서비스에서만 호출합니다.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

/** 다운로드에 필요한 저장 위치와 원본 파일명 두 열만 읽습니다. */
export async function findGuidebookFile(id: string): Promise<{ fileUrl: string; fileName: string } | null> {
  const [file] = await db
    .select({ fileUrl: guidebooks.fileUrl, fileName: guidebooks.fileName })
    .from(guidebooks)
    .where(eq(guidebooks.id, id))
    .limit(1);
  return file ?? null;
}
