/**
 * 웹 주차별 텍스트 상세·인쇄 조회에 필요한 DB 열을 이 Repository가 소유합니다 (#271).
 * 실제 Blob URL·이미지 원본 URL은 Page props로 반환하지 않습니다.
 * 기수 간 공동 열람 정책(#100)은 서비스에서 검사하며, 이 조회는 기수별 제약을 새로 만들지 않습니다.
 */
import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts, weeklyTextImages, weeklyTexts } from "@/lib/db/schema";

export type WebWeeklyTextDetail = {
  id: string;
  title: string;
  body: string | null;
  hasFile: boolean;
  fileName: string | null;
  cohortName: string | null;
  textType: string | null;
  createdAt: Date;
  images: Array<{ id: string; alt: string | null; order: number }>;
};

export type WebWeeklyTextPrintable = {
  id: string;
  title: string;
  body: string | null;
  createdAt: Date;
  cohortName: string | null;
  textType: string | null;
};

/** 메타데이터 요청은 승인 역할을 통과한 뒤 제목 한 열만 읽습니다. */
export async function findWebWeeklyTextTitle(id: string): Promise<string | null> {
  const [row] = await db.select({ title: weeklyTexts.title })
    .from(weeklyTexts)
    .where(eq(weeklyTexts.id, id))
    .limit(1);
  return row?.title ?? null;
}

/** 본문/첨부 여부/사진 ID만 반환합니다. 다운로드는 기존 별도 인증 API가 수행합니다. */
export async function findWebWeeklyTextDetail(id: string): Promise<WebWeeklyTextDetail | null> {
  const [text] = await db.select({
    id: weeklyTexts.id,
    title: weeklyTexts.title,
    body: weeklyTexts.body,
    hasFile: sql<boolean>`coalesce(${weeklyTexts.fileUrl} <> '', false)`,
    fileName: weeklyTexts.fileName,
    cohortName: cohorts.name,
    textType: weeklyTexts.textType,
    createdAt: weeklyTexts.createdAt,
  })
    .from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .where(eq(weeklyTexts.id, id))
    .limit(1);
  if (!text) return null;

  const images = await db.select({
    id: weeklyTextImages.id,
    alt: weeklyTextImages.alt,
    order: weeklyTextImages.order,
  })
    .from(weeklyTextImages)
    .where(eq(weeklyTextImages.weeklyTextId, id))
    .orderBy(asc(weeklyTextImages.order), asc(weeklyTextImages.createdAt));

  return { ...text, images };
}

/** 인쇄에는 이미지·파일 URL을 조회하지 않고 본문 표시 열만 읽습니다. */
export async function findWebWeeklyTextPrintable(id: string): Promise<WebWeeklyTextPrintable | null> {
  const [text] = await db.select({
    id: weeklyTexts.id,
    title: weeklyTexts.title,
    body: weeklyTexts.body,
    createdAt: weeklyTexts.createdAt,
    cohortName: cohorts.name,
    textType: weeklyTexts.textType,
  })
    .from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .where(eq(weeklyTexts.id, id))
    .limit(1);
  return text ?? null;
}
