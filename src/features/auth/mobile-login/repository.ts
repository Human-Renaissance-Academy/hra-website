/**
 * 모바일 인증의 갱신 예산과 세션 식별 조회를 소유하는 저장소입니다.
 * 기존 reserve_rate_limit 함수를 재사용하며 원본 IP·토큰은 저장하거나 로그하지 않습니다.
 */
import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { MobileAuthError } from "./errors";
import type { MOBILE_REFRESH_IP_POLICY, MOBILE_REFRESH_SESSION_POLICY } from "./policy";

type RefreshPolicy = typeof MOBILE_REFRESH_IP_POLICY | typeof MOBILE_REFRESH_SESSION_POLICY;
const reservationSchema = z.object({ allowed: z.boolean(), retry_after_sec: z.coerce.number().int().nonnegative() });
const sessionIdSchema = z.object({ id: z.uuid() });

/** 성공한 갱신도 삭제하지 않아 계속 회전하는 클라이언트가 예산을 초기화하지 못합니다. */
export async function reserveRefreshBudget(policy: RefreshPolicy, key: string): Promise<void> {
  const budget = await checkRefreshBudget(policy, key);
  if (!budget.allowed) throw new MobileAuthError("RATE_LIMITED", budget.retryAfterSeconds);
}

/** 세션 제한은 회전 허용 여부만 결정하며 소비 토큰의 재사용 회수를 막지 않습니다. */
export async function checkRefreshBudget(policy: RefreshPolicy, key: string) {
  const hash = createHash("sha256").update(policy.scope).update("\0").update(key).digest("hex");
  const result = await db.execute(sql`SELECT allowed, retry_after_sec FROM reserve_rate_limit(
    ARRAY[${policy.scope}]::text[], ARRAY[${hash}]::text[],
    ARRAY[${policy.maxAttempts}]::integer[], ARRAY[${policy.windowSeconds}]::integer[])`);
  const row = reservationSchema.parse(result.rows[0]);
  return { allowed: row.allowed, retryAfterSeconds: Math.max(1, Math.min(900, row.retry_after_sec)) };
}

/** 현재·직전·과거 해시 모두 동일한 세션 예산으로 연결합니다. 유효성 판정은 회전 서비스만 수행합니다. */
export async function findRefreshSessionId(hash: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT id FROM public.mobile_sessions WHERE refresh_hash=${hash}
    UNION SELECT id FROM public.mobile_sessions WHERE prev_refresh_hash=${hash}
    UNION SELECT session_id AS id FROM public.mobile_session_refresh_history WHERE refresh_hash=${hash}
    LIMIT 1`);
  return result.rows[0] ? sessionIdSchema.parse(result.rows[0]).id : null;
}
