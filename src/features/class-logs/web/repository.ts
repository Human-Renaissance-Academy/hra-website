/**
 * 승인 회원 수업일지 Web 상세·인쇄·메타데이터 DB 조회 경계 (#271).
 * 이미지 원본 URL·소유자 계정 ID·Blob 자격 증명을 Page에 전달하지 않습니다.
 * 이미지 실물은 기존 인증 다운로드 API에서만 제공합니다.
 */
import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { classLogImages, classLogs, users } from "@/lib/db/schema";

export type WebClassLogDetail = {
  log: {
    id: string;
    title: string;
    content: string;
    classDate: Date;
    viewCount: number;
    authorName: string | null;
  };
  images: Array<{ id: string; alt: string | null; order: number }>;
};

export type WebClassLogPrintable = {
  id: string;
  title: string;
  content: string;
  classDate: Date;
  authorName: string | null;
};

/** 메타데이터는 본문·이미지·작성자 없이 제목만 읽습니다. */
export async function findWebClassLogTitle(id: string): Promise<string | null> {
  const [row] = await db.select({ title: classLogs.title })
    .from(classLogs).where(eq(classLogs.id, id)).limit(1);
  return row?.title ?? null;
}

/** 기존 상세 화면과 같은 작성자 표시·조회수·수업일과 본문을 조회합니다. */
export async function findWebClassLogDetail(id: string): Promise<WebClassLogDetail | null> {
  const [log] = await db.select({
    id: classLogs.id,
    title: classLogs.title,
    content: classLogs.content,
    classDate: classLogs.classDate,
    viewCount: classLogs.viewCount,
    authorName: users.name,
  })
    .from(classLogs)
    .leftJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, id))
    .limit(1);
  if (!log) return null;

  const images = await db.select({
    id: classLogImages.id,
    alt: classLogImages.alt,
    order: classLogImages.order,
  })
    .from(classLogImages)
    .where(eq(classLogImages.classLogId, id))
    .orderBy(asc(classLogImages.order), asc(classLogImages.createdAt));
  return { log, images };
}

/** 인쇄 화면은 조회수와 이미지·원본 파일 경로를 읽지 않습니다. */
export async function findWebClassLogPrintable(id: string): Promise<WebClassLogPrintable | null> {
  const [log] = await db.select({
    id: classLogs.id,
    title: classLogs.title,
    content: classLogs.content,
    classDate: classLogs.classDate,
    authorName: users.name,
  })
    .from(classLogs)
    .leftJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, id))
    .limit(1);
  return log ?? null;
}

/** 과거처럼 실제 승인 상세 열람 뒤에만 원자 증가하며 성공 본문 반환을 기다리게 하지 않습니다. */
export async function incrementWebClassLogViewCount(id: string): Promise<void> {
  await db.update(classLogs)
    .set({ viewCount: sql`${classLogs.viewCount} + 1` })
    .where(eq(classLogs.id, id));
}
