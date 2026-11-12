/**
 * 자료실 파일·메타데이터 조회의 사용자별 빈도 제한 공용 경계입니다 (#444).
 *
 * 역할:
 * - 인증과 현재 역할 확인을 통과한 사용자 id 하나만 기존 PostgreSQL 원자 예약(`reserve_rate_limit`)에 기록합니다.
 *   무인증(401)·승인 대기(403) 요청은 이 함수까지 오지 않으므로 계산되지 않습니다.
 * - Web 쿠키와 모바일 Bearer 주체, Web 다운로드(`/api/resources/[kind]/[id]/download`)와
 *   `/api/v1/resources/*` 가 같은 사용자 키와 같은 정책(`RESOURCE_READ_*_RATE_LIMIT`)을 공유합니다.
 *
 * 저장소 장애 정책 — fail-closed:
 * - 기존 요청 제한(`src/lib/rate-limit.ts` 의 `reserve`)은 DB 오류 시 항상 차단하며,
 *   모바일 로그인은 이를 429 가 아닌 503 으로 구분합니다. 이 경계도 같은 선례를 따라 장애 시 자료를 제공하지 않고
 *   `ResourceReadLimitUnavailableError` 를 던져 Route 가 503 으로 응답하게 합니다.
 * - 제한 저장소와 자료 메타데이터가 같은 PostgreSQL 에 있으므로, 제한 저장소 장애 시 자료 조회도 대부분 실패합니다.
 *   fail-open 으로 얻는 가용성이 거의 없고 제한 우회 위험만 생기므로 닫힌 쪽을 택했습니다.
 */
import "server-only";

import { reserveResourceRead } from "@/lib/rate-limit";
import { RESOURCE_READ_HOURLY_RATE_LIMIT } from "@/lib/rate-limit-core";

/** Retry-After 상한은 가장 긴 제한 창(1시간)입니다. 공용 오류 계약의 86400초 상한 안에 있습니다. */
const MAX_RETRY_AFTER_SECONDS = RESOURCE_READ_HOURLY_RATE_LIMIT.windowMs / 1000;

/** 사용자별 조회 예산을 초과했습니다. Route 는 429 RATE_LIMITED 와 `Retry-After` 로 바꿉니다. */
export class ResourceReadRateLimitError extends Error {
  readonly code = "RATE_LIMITED";

  constructor(readonly retryAfterSeconds: number) {
    super("RESOURCE_READ_RATE_LIMITED");
    this.name = "ResourceReadRateLimitError";
  }
}

/** 제한 저장소를 확인할 수 없습니다(fail-closed). Route 는 원문 없는 503 으로 바꿉니다. */
export class ResourceReadLimitUnavailableError extends Error {
  constructor() {
    super("RESOURCE_READ_LIMIT_UNAVAILABLE");
    this.name = "ResourceReadLimitUnavailableError";
  }
}

/**
 * 검증된 사용자의 자료 조회 한 건을 예약합니다.
 * 허용이면 그대로 반환하고, 초과면 `ResourceReadRateLimitError`, 저장소 장애면 `ResourceReadLimitUnavailableError` 를 던집니다.
 */
export async function enforceResourceReadLimit(userId: string): Promise<void> {
  const reservation = await reserveResourceRead(userId);
  // 장애도 blocked=true 이므로 unavailable 을 먼저 확인해 429 로 오인하지 않게 합니다.
  if (reservation.unavailable) throw new ResourceReadLimitUnavailableError();
  if (reservation.blocked) {
    // DB 함수는 차단 시 1초 이상을 반환하지만, 헤더·계약 범위(1~3600초 정수)를 한 번 더 고정합니다.
    const seconds = Math.ceil(reservation.retryAfterSec);
    const retryAfterSeconds = Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, 1), MAX_RETRY_AFTER_SECONDS)
      : MAX_RETRY_AFTER_SECONDS;
    throw new ResourceReadRateLimitError(retryAfterSeconds);
  }
}
