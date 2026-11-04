/**
 * 승인 회원용 주차별 텍스트 목록·상세·파일의 PostgreSQL 조회를 소유합니다.
 *
 * - 주차별 텍스트는 공동 자료 정책(#100)에 따라 승인 회원이 기수와 무관하게 열람합니다.
 *   Web 통합 자료실 목록·상세·기존 다운로드 경로와 같은 범위이며, 역할 확인은 서비스가 먼저 수행합니다.
 * - 목록은 본문·원본 파일 URL을 읽지 않고 존재 여부만 DB에서 계산합니다.
 * - 첨부 사진(weekly_text_images)은 이 저장소에서 조회하지 않습니다.
 */
import "server-only";

import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts, weeklyTexts } from "@/lib/db/schema";

export type WeeklyTextRecord = {
  id: string;
  title: string;
  textType: string | null;
  classDate: Date | null;
  cohortId: string | null;
  cohortName: string | null;
  hasBody: boolean;
  hasFile: boolean;
};

// 본문·파일 URL은 결과에 싣지 않고 기존 Web 목록과 같은 truthy 분기만 DB에서 계산합니다.
const summaryColumns = {
  id: weeklyTexts.id,
  title: weeklyTexts.title,
  textType: weeklyTexts.textType,
  classDate: weeklyTexts.classDate,
  cohortId: cohorts.id,
  cohortName: cohorts.name,
  hasBody: sql<boolean>`coalesce(${weeklyTexts.body} <> '', false)`,
  hasFile: sql<boolean>`coalesce(${weeklyTexts.fileUrl} <> '', false)`,
};

/** 전체 주차별 텍스트 수를 셉니다. 초안 상태가 없으므로 모든 행이 대상입니다. */
export async function countWeeklyTexts(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(weeklyTexts);
  return total;
}

/** Web 통합 목록과 같은 수업일 역순(NULL 마지막)·작성 시각 역순에 ID를 더해 안정된 페이지를 읽습니다. */
export async function listWeeklyTexts(pageSize: number, offset: number): Promise<WeeklyTextRecord[]> {
  return db.select(summaryColumns).from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .orderBy(sql`${weeklyTexts.classDate} DESC NULLS LAST`, desc(weeklyTexts.createdAt), desc(weeklyTexts.id))
    .limit(pageSize)
    .offset(offset);
}

/** 상세는 Markdown 본문과 첨부 표시용 파일명을 추가로 읽고 저장 위치는 읽지 않습니다. */
export async function findWeeklyText(
  id: string,
): Promise<(WeeklyTextRecord & { body: string | null; fileName: string | null }) | null> {
  const [row] = await db.select({ ...summaryColumns, body: weeklyTexts.body, fileName: weeklyTexts.fileName })
    .from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .where(eq(weeklyTexts.id, id))
    .limit(1);
  return row ?? null;
}

/** 다운로드에 필요한 저장 위치와 원본 파일명만 읽습니다. 본문만 있는 텍스트는 빈 URL입니다. */
export async function findWeeklyTextFile(id: string): Promise<{ fileUrl: string; fileName: string | null } | null> {
  const [row] = await db.select({ fileUrl: weeklyTexts.fileUrl, fileName: weeklyTexts.fileName })
    .from(weeklyTexts)
    .where(eq(weeklyTexts.id, id))
    .limit(1);
  return row ?? null;
}
