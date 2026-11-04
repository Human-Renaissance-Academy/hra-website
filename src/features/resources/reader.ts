/**
 * 공동 자료 API(강의자료·주차별 텍스트·가이드북 파일)의 현재 계정·역할 확인 경계입니다.
 *
 * 역할:
 * - Web 세션(향후 #273 Bearer)에서 변환한 주체를 현재 사용자 행과 다시 대조합니다.
 * - 승인 대기(PENDING)는 프로필 조회를 포함한 DB 접근 전에 거부합니다.
 * - 목록 페이지 인자를 PostgreSQL LIMIT/OFFSET 범위 안의 정수로만 허용합니다.
 *
 * 사용 위치: `src/features/{class-materials,weekly-texts}/member`, `src/features/guidebooks/file-download`
 */
import "server-only";

import { API_V1_MAX_PAGE_SIZE } from "@hra/contracts/api-v1";
import { canReadSharedResource } from "@/features/resources/access";
import type { ApprovedResourceRole } from "@/features/resources/overview/repository";
import { getCurrentProfile, type MePrincipal } from "@/features/users/me/service";
import { toKstDateInput } from "@/lib/date-time";

/** 현재 DB 행으로 확인한 승인 회원입니다. 기수는 표시·후속 정책 판단용으로만 전달합니다. */
export type SharedResourceReader = { id: string; role: ApprovedResourceRole; cohortId: string | null };

export type SharedResourceReaderResult =
  | { kind: "ok"; reader: SharedResourceReader }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/** 삭제·역할 변경 계정은 인증 실패로, 승인 대기는 권한 없음으로 구분합니다. */
export async function verifySharedResourceReader(principal: MePrincipal): Promise<SharedResourceReaderResult> {
  // 승인 대기 세션은 현재 계정 조회 전에 차단합니다. 다른 잘못된 주체는 getCurrentProfile이 null로 거부합니다.
  if (principal && typeof principal === "object" && principal.role === "PENDING") return { kind: "forbidden" };

  const profile = await getCurrentProfile(principal);
  if (!profile) return { kind: "unauthenticated" };
  const role = profile.role;
  if (!canReadSharedResource(role) || role === "PENDING") return { kind: "forbidden" };
  return { kind: "ok", reader: { id: profile.id, role, cohortId: profile.cohortId } };
}

/** 잘못된 페이지 인자는 인증·DB 조회보다 먼저 차단하며 Route가 400으로 매핑할 수 있습니다. */
export class ResourcePaginationError extends Error {
  readonly code = "RESOURCE_PAGINATION_INVALID";

  constructor() {
    super("RESOURCE_PAGINATION_INVALID");
    this.name = "ResourcePaginationError";
  }
}

/** PostgreSQL LIMIT/OFFSET에 전달할 정수 범위를 사전에 고정합니다. */
export function resourceListOffset(page: number, pageSize: number): number {
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > API_V1_MAX_PAGE_SIZE) {
    throw new ResourcePaginationError();
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset) || offset > 2_147_483_647) throw new ResourcePaginationError();
  return offset;
}

/**
 * 시간대 없는 수업일 열을 한국 달력 날짜(YYYY-MM-DD)로 바꿉니다.
 * Web 자료 화면·관리자 수정 폼과 같은 KST 날짜 변환(`toKstDateInput`)을 사용해 화면과 API의 날짜가 어긋나지 않게 합니다.
 */
export function toResourceCalendarDate(value: Date | null): string | null {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return toKstDateInput(value);
}
