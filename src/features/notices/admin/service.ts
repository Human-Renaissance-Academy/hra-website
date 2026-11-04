/**
 * 관리자 공지사항의 재인가와 존재·저장 결과 규칙을 제공하는 Application Service입니다.
 * Web 세션·FormData·캐시·이동은 adapter에 남기고 최소 DTO만 반환합니다.
 */
import "server-only";

import * as repository from "./repository";
import type { AdminNotice, NoticeInput } from "./repository";

export type { AdminNotice, NoticeInput } from "./repository";
export type NoticeActor = { userId: string; role: string };

/** 다른 adapter에서 직접 호출해도 홈페이지 관리자 권한을 다시 확인합니다. */
function assertAdmin(actor: NoticeActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("NOTICE_ADMIN_REQUIRED");
  }
}

/** 전체 목록은 화면 표시 여섯 필드만 제공해 내부 열의 유출을 차단합니다. */
export async function listAdminNotices(actor: NoticeActor): Promise<AdminNotice[]> {
  assertAdmin(actor);
  const rows = await repository.listNotices();
  return rows.map(row => ({
    id: row.id, title: row.title, content: row.content,
    status: row.status, pinned: row.pinned, createdAt: row.createdAt,
  }));
}

/** 편집 대상이 없으면 null, 있으면 폼의 네 필드만 반환합니다. */
export async function getAdminNotice(actor: NoticeActor, id: string): Promise<NoticeInput | null> {
  assertAdmin(actor);
  const row = await repository.findNotice(id);
  return row ? { title: row.title, content: row.content, status: row.status, pinned: row.pinned } : null;
}

/** 현재 관리자를 작성자로 저장하며 Web 입력 변환은 호출자가 수행합니다. */
export async function createNotice(actor: NoticeActor, input: NoticeInput): Promise<void> {
  assertAdmin(actor);
  await repository.insertNotice(input, actor.userId);
}

/** 기존 선행 존재 확인과 실제 UPDATE 결과 확인을 모두 유지합니다. */
export async function updateNotice(actor: NoticeActor, id: string, input: NoticeInput): Promise<boolean> {
  assertAdmin(actor);
  // 본문 URL은 파일 소유권 증명이 아니므로 조회하거나 삭제에 사용하지 않습니다.
  if (!(await repository.findNoticeTarget(id))) return false;
  return repository.updateNotice(id, input);
}

/** 없는 대상은 실패로 보고하고 선행 확인 뒤 삭제 경합의 기존 의미는 유지합니다. */
export async function deleteNotice(actor: NoticeActor, id: string): Promise<boolean> {
  assertAdmin(actor);
  if (!(await repository.findNoticeTarget(id))) return false;
  await repository.deleteNotice(id);
  return true;
}

/** 요청마다 실행한 반전 명령의 저장값만 반환하며 재전송도 별도 반전입니다. */
export async function togglePin(actor: NoticeActor, id: string): Promise<{ readonly pinned: boolean } | null> {
  assertAdmin(actor);
  const row = await repository.togglePin(id);
  return row ? { pinned: row.pinned } : null;
}

/** 게시 반전 명령이 저장한 상태만 반환하고 후속 요청의 상태는 재조회하지 않습니다. */
export async function toggleStatus(actor: NoticeActor, id: string): Promise<{ readonly status: NoticeInput["status"] } | null> {
  assertAdmin(actor);
  const row = await repository.toggleStatus(id);
  return row ? { status: row.status } : null;
}
