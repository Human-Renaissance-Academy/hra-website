/**
 * 승인 회원에게만 가이드북 목록을 제공하는 Application Service입니다.
 * 현재 사용자 행의 역할을 재확인하고, 파일 원본 정보 없이 페이지 메타데이터만 반환합니다.
 */
import "server-only";

import { API_V1_MAX_PAGE_SIZE } from "@hra/contracts/api-v1";
import { canReadSharedResource } from "@/features/resources/access";
import { enforceResourceReadLimit } from "@/features/resources/read-limit";
import { getCurrentProfile, type MePrincipal } from "@/features/users/me/service";
import { countGuidebooks, listGuidebooks } from "./repository";

export type GuidebookListItem = { id: string; title: string };

export type MemberGuidebookListResult =
  | { kind: "ok"; items: readonly GuidebookListItem[]; totalCount: number }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/** 잘못된 페이지 인자는 인증·DB 조회보다 먼저 차단하며 Route가 400으로 매핑할 수 있습니다. */
export class GuidebookPaginationError extends Error {
  readonly code = "GUIDEBOOK_PAGINATION_INVALID";

  constructor() {
    super("GUIDEBOOK_PAGINATION_INVALID");
  }
}

/** PostgreSQL LIMIT/OFFSET에 전달할 정수 범위를 사전에 고정합니다. */
function safeOffset(page: number, pageSize: number): number {
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > API_V1_MAX_PAGE_SIZE) {
    throw new GuidebookPaginationError();
  }

  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > 2_147_483_647) {
    throw new GuidebookPaginationError();
  }
  return offset;
}

/** 현재 계정·역할을 검증한 뒤 승인 회원에게만 공개 메타데이터 페이지를 반환합니다. */
export async function listGuidebooksForMember(input: {
  principal: MePrincipal;
  page: number;
  pageSize: number;
}): Promise<MemberGuidebookListResult> {
  if (!input || typeof input !== "object") throw new GuidebookPaginationError();
  const offset = safeOffset(input.page, input.pageSize);

  const profile = await getCurrentProfile(input.principal);
  if (!profile) return { kind: "unauthenticated" };
  if (!canReadSharedResource(profile.role)) return { kind: "forbidden" };
  // 401/403 판단 뒤 승인 회원만 자료 조회 예산에 기록합니다(#444). 초과·장애는 오류로 전파되어 Route 가 429/503 으로 바꿉니다.
  await enforceResourceReadLimit(profile.id);

  const totalCount = await countGuidebooks();
  if (offset >= totalCount) return { kind: "ok", items: [], totalCount };

  const rows = await listGuidebooks(input.pageSize, offset);
  // 저장소 mock이나 향후 구현 변경에도 URL·파일명·작성 시각이 응답으로 넘어가지 않게 재투영합니다.
  const items = rows.map((row) => ({ id: row.id, title: row.title }));
  return { kind: "ok", items, totalCount };
}
