/**
 * 수업일지 Web Application Service (#271).
 * 기존 공동 자료 역할 정책을 그대로 사용하고 DB 직접 접근은 repository가 담당합니다.
 */
import "server-only";

import { canReadSharedResource } from "@/features/resources/access";
import { logServerError } from "@/lib/errors";
import {
  findWebClassLogDetail,
  findWebClassLogPrintable,
  findWebClassLogTitle,
  incrementWebClassLogViewCount,
} from "./repository";

export async function getWebClassLogTitle(role: string | null | undefined, id: string) {
  if (!canReadSharedResource(role)) return null;
  return findWebClassLogTitle(id);
}

export async function getWebClassLogDetail(role: string | null | undefined, id: string) {
  if (!canReadSharedResource(role)) return null;
  return findWebClassLogDetail(id);
}

export async function getWebClassLogPrintable(role: string | null | undefined, id: string) {
  if (!canReadSharedResource(role)) return null;
  return findWebClassLogPrintable(id);
}

/**
 * 상세 페이지가 승인된 자료를 실제 반환할 때만 호출합니다.
 * 과거와 동일하게 응답을 기다리지 않는 증가이며 DB 오류는 정제된 코드/UUID만 로그로 남깁니다.
 */
export function recordWebClassLogRead(role: string | null | undefined, id: string): void {
  if (!canReadSharedResource(role)) return;
  void incrementWebClassLogViewCount(id).catch((error: unknown) => {
    logServerError("member/resources/viewCount", error, { id });
  });
}
