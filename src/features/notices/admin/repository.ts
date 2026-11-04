/**
 * 관리자 공지사항의 PostgreSQL 조회와 쓰기를 소유하는 저장소입니다.
 * 기존 열·호출 체인을 유지하고 반전은 저장값을 반환하는 단일 UPDATE로 실행합니다.
 */
import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

export type NoticeInput = {
  readonly title: string;
  readonly content: string;
  readonly status: "DRAFT" | "PUBLISHED";
  readonly pinned: boolean;
};
export type AdminNotice = NoticeInput & { readonly id: string; readonly createdAt: Date };

/** 초안·고정 여부로 거르지 않고 기존 작성일 내림차순 전체 목록을 읽습니다. */
export async function listNotices(): Promise<AdminNotice[]> {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      content: notices.content,
      status: notices.status,
      pinned: notices.pinned,
      createdAt: notices.createdAt,
    })
    .from(notices)
    .orderBy(desc(notices.createdAt));
}

/** 편집 폼에서 사용하는 네 열만 기존 순서로 조회합니다. */
export async function findNotice(id: string): Promise<NoticeInput | null> {
  const notice = await db.query.notices.findFirst({
    where: eq(notices.id, id),
    columns: {
      title: true,
      status: true,
      pinned: true,
      content: true,
    },
  });
  return notice ?? null;
}

/** 수정·삭제의 기존 선행 존재 확인은 ID 한 열만 읽습니다. */
export async function findNoticeTarget(id: string): Promise<{ readonly id: string } | null> {
  const target = await db.query.notices.findFirst({
    where: eq(notices.id, id),
    columns: {
      id: true,
    },
  });
  return target ?? null;
}

/** 작성자 ID와 검증된 네 필드를 기존 insert 값 순서로 저장합니다. */
export async function insertNotice(input: NoticeInput, authorId: string): Promise<void> {
  await db.insert(notices).values({
    title: input.title,
    content: input.content,
    status: input.status,
    pinned: input.pinned,
    authorId,
  });
}

/** RETURNING의 행 수로 선행 조회 뒤 삭제된 대상도 확인합니다. */
export async function updateNotice(id: string, input: NoticeInput): Promise<boolean> {
  const updatedRows = await db
    .update(notices)
    .set({
      title: input.title,
      content: input.content,
      status: input.status,
      pinned: input.pinned,
    })
    .where(eq(notices.id, id))
    .returning({ id: notices.id });
  return updatedRows.length > 0;
}

/** 선행 존재 확인 뒤의 삭제는 기존처럼 RETURNING 없이 실행합니다. */
export async function deleteNotice(id: string): Promise<void> {
  await db.delete(notices).where(eq(notices.id, id));
}

/** 행 잠금 획득 후 최신 고정값을 SQL 안에서 반전하고 그 저장값만 반환합니다. */
export async function togglePin(id: string): Promise<{ readonly pinned: boolean } | null> {
  const [updated] = await db.update(notices)
    .set({ pinned: sql`NOT ${notices.pinned}` })
    .where(eq(notices.id, id))
    .returning({ pinned: notices.pinned });
  return updated ?? null;
}

/** 게시 상태도 읽기 없이 단일 CASE UPDATE로 반전하고 저장 상태를 반환합니다. */
export async function toggleStatus(id: string): Promise<{ readonly status: NoticeInput["status"] } | null> {
  const [updated] = await db.update(notices)
    .set({ status: sql`CASE WHEN ${notices.status} = 'DRAFT'
      THEN 'PUBLISHED'::notice_status ELSE 'DRAFT'::notice_status END` })
    .where(eq(notices.id, id))
    .returning({ status: notices.status });
  return updated ?? null;
}
