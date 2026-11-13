/**
 * 주차별 텍스트 Web adapter의 Application Service 경계입니다 (#271).
 * 인증·기수 간 공동 열람(#100) 정책은 유지하고 읽기 쿼리를 Repository에 위임합니다.
 * 현재 Web 열람 정책은 API v1 메타데이터의 추가 읽기 예산과 별개이므로
 * Page로 이동할 때 갑자기 API read-limit을 추가하지 않습니다.
 */
import "server-only";

import { canReadSharedResource } from "@/features/resources/access";
import {
  findWebWeeklyTextDetail,
  findWebWeeklyTextPrintable,
  findWebWeeklyTextTitle,
} from "./repository";

export async function getWebWeeklyTextTitle(
  role: string | null | undefined,
  id: string,
): Promise<string | null> {
  if (!canReadSharedResource(role)) return null;
  return findWebWeeklyTextTitle(id);
}

/** 이 서비스는 승인된 역할만 받아들이고 실제 DB 쿼리는 Repository가 수행합니다. */
export async function getWebWeeklyTextDetail(role: string | null | undefined, id: string) {
  if (!canReadSharedResource(role)) return null;
  return findWebWeeklyTextDetail(id);
}

export async function getWebWeeklyTextPrintable(role: string | null | undefined, id: string) {
  if (!canReadSharedResource(role)) return null;
  return findWebWeeklyTextPrintable(id);
}
