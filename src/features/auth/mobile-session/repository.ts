/**
 * 모바일 세션 SQL 저장소. Neon HTTP에서도 단일 문장으로 잠금·판정·이력 기록을 완료합니다.
 * testNow는 격리 테스트 전용입니다. 운영 시간은 잠금을 획득한 뒤 DB에서 읽습니다.
 */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { USER_ROLES } from "@hra/contracts/identity";
import { db } from "@/lib/db";
import { ABSOLUTE_SESSION_LIFETIME_MS, ACCESS_TOKEN_LIFETIME_MS, REFRESH_TOKEN_LIFETIME_MS, LAST_USED_INTERVAL_MS, REFRESH_REUSE_LEEWAY_MS } from "./tokens";
import { MobileSessionStorageError, ROTATION_FAILURE_REASONS, type MobileDevice, type MobilePrincipal } from "./types";

export type SessionTokenHashes = {
  readonly accessHash: string;
  readonly refreshHash: string;
  /** 운영 호출자는 전달하지 않는 결정 시각 시험 주입점입니다. */
  readonly testNow?: Date;
};
type NewSession = SessionTokenHashes & {
  readonly userId: string;
  readonly sessionVersion: number;
  readonly device?: MobileDevice;
};
const principalSchema = z.object({ userId: z.uuid(), role: z.enum(USER_ROLES), sessionVersion: z.number().int(), sessionId: z.uuid() });
const rotationRowSchema = z.object({
  reason: z.enum(["ROTATED", ...ROTATION_FAILURE_REASONS]),
  accessExpiresAt: z.coerce.date().nullable(), refreshExpiresAt: z.coerce.date().nullable(),
});

/** 드라이버 예외에 포함될 수 있는 해시·바인딩을 외부로 전파하지 않습니다. */
async function execute(statement: SQL) {
  try { return await db.execute(statement); }
  catch { throw new MobileSessionStorageError(); }
}

/** 계정 잠금 후의 버전과 DB 시각으로 발급합니다. 반환 만료도 DB 계산 결과입니다. */
export async function insertMobileSession(input: NewSession) {
  const result = await execute(sql`
    WITH locked AS MATERIALIZED (
      SELECT id,session_version FROM public.users
      WHERE id=${input.userId}::uuid AND session_version=${input.sessionVersion} FOR SHARE
    ), timed AS MATERIALIZED (
      SELECT u.*,COALESCE(${input.testNow?.toISOString() ?? null}::timestamptz,clock_timestamp()) AS instant FROM locked u
    ) INSERT INTO public.mobile_sessions
      (user_id,session_version,access_hash,refresh_hash,access_expires_at,refresh_expires_at,
       absolute_expires_at,rotated_at,last_used_at,created_at,platform,app_version,device_name)
    SELECT id,session_version,${input.accessHash},${input.refreshHash},
      instant + ${ACCESS_TOKEN_LIFETIME_MS} * interval '1 millisecond',
      instant + ${REFRESH_TOKEN_LIFETIME_MS} * interval '1 millisecond',
      instant + ${ABSOLUTE_SESSION_LIFETIME_MS} * interval '1 millisecond',instant,instant,instant,
      ${input.device?.platform ?? null},${input.device?.appVersion ?? null},${input.device?.deviceName ?? null}
    FROM timed RETURNING 'ROTATED' AS reason,access_expires_at AS "accessExpiresAt",refresh_expires_at AS "refreshExpiresAt"
  `);
  if (!result.rows[0]) return null;
  const parsed = rotationRowSchema.safeParse(result.rows[0]);
  if (!parsed.success) throw new MobileSessionStorageError();
  return parsed.data;
}

/** 접근 판정은 문장 시작 MVCC 스냅샷 기준입니다. 기록은 잠긴 회전 행을 기다리지 않고 건너뜁니다. */
export async function findAccessPrincipal(hash: string, testNow?: Date): Promise<MobilePrincipal | null> {
  const result = await execute(sql`
    WITH snapshot AS MATERIALIZED (
      SELECT * FROM public.mobile_sessions WHERE access_hash=${hash}
    ), timed AS MATERIALIZED (
      SELECT s.*,COALESCE(${testNow?.toISOString() ?? null}::timestamptz,clock_timestamp()) AS instant FROM snapshot s
    ), valid AS MATERIALIZED (
      SELECT s.id AS "sessionId",u.id AS "userId",u.role,u.session_version AS "sessionVersion",s.instant
      FROM timed s JOIN public.users u ON u.id=s.user_id
      WHERE s.access_hash=${hash} AND s.revoked_at IS NULL AND s.session_version=u.session_version
        AND s.access_expires_at>s.instant AND s.refresh_expires_at>s.instant AND s.absolute_expires_at>s.instant
    ), touchable AS MATERIALIZED (
      SELECT s.id FROM public.mobile_sessions s JOIN valid v ON s.id=v."sessionId"
      WHERE s.last_used_at<=v.instant - ${LAST_USED_INTERVAL_MS} * interval '1 millisecond'
      FOR UPDATE OF s SKIP LOCKED
    ), touched AS (
      UPDATE public.mobile_sessions s SET last_used_at=v.instant FROM valid v
      WHERE s.id=v."sessionId" AND s.id IN (SELECT id FROM touchable)
      RETURNING s.id
    ) SELECT * FROM valid
  `);
  if (!result.rows[0]) return null;
  const parsed = principalSchema.safeParse(result.rows[0]);
  if (!parsed.success) throw new MobileSessionStorageError();
  return parsed.data;
}

/** 인가 체크포인트마다 비잠금 재조회합니다. 이미 인증된 요청의 접근 토큰 수명은 재검사하지 않습니다. */
export async function findValidMobileSession(input: { readonly sessionId: string; readonly expectedVersion: number }) {
  const result = await execute(sql`
    SELECT u.id AS "userId",u.role FROM public.mobile_sessions s JOIN public.users u ON u.id=s.user_id
    WHERE s.id=${input.sessionId}::uuid AND s.revoked_at IS NULL
      AND s.session_version=${input.expectedVersion} AND u.session_version=${input.expectedVersion}
      AND s.refresh_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()
  `);
  if (!result.rows[0]) return null;
  return principalSchema.pick({ userId: true, role: true }).parse(result.rows[0]);
}

/**
 * 각 해시 인덱스로 로그인 ID를 먼저 고정합니다. 이력 PK 조회는 가족 크기에 비례하지 않습니다.
 * 잠금 조건을 ID로 유지해야 대기 중 두 번 회전해도 EvalPlanQual가 최신 행을 반환합니다.
 * 해시를 잠금 조건에 다시 넣으면 prev에서도 밀려난 요청이 재사용 탐지를 피할 수 있습니다.
 * 계정 FOR SHARE는 EvalPlanQual로 최신 커밋 튜플을 재확인하고 역할·버전 변경자를 대기시킵니다.
 * 잠금 순서는 세션→계정입니다. 계정 삭제의 CASCADE는 반대 순서라 드문 deadlock이 가능하며,
 * PostgreSQL이 한 문장 전체를 중단하면 execute가 기존 저장소 오류(HTTP 503)로 변환합니다.
 * timed는 두 잠금 모두에 의존하므로 결정 시각도 두 잠금 획득 후 한 번만 읽습니다.
 * 소비 이력 INSERT도 같은 문장입니다. 이력 충돌을 무시하지 않아 실패 시 회전 전체가 롤백됩니다.
 */
export async function rotateSessionHash(previousHash: string, next: SessionTokenHashes, mayRotate = true) {
  const result = await execute(sql`
    WITH candidates AS MATERIALIZED (
      SELECT id FROM public.mobile_sessions WHERE refresh_hash=${previousHash}
      UNION SELECT id FROM public.mobile_sessions WHERE prev_refresh_hash=${previousHash}
      UNION SELECT session_id AS id FROM public.mobile_session_refresh_history WHERE refresh_hash=${previousHash}
    ), locked AS MATERIALIZED (
      SELECT s.* FROM public.mobile_sessions s WHERE s.id IN (SELECT id FROM candidates) FOR UPDATE OF s
    ), account AS MATERIALIZED (
      SELECT u.id,u.session_version FROM public.users u
      WHERE u.id IN (SELECT user_id FROM locked) FOR SHARE OF u
    ), clock AS MATERIALIZED (
      SELECT COALESCE(${next.testNow?.toISOString() ?? null}::timestamptz,clock_timestamp()) AS instant
      FROM (SELECT count(*) FROM account) barrier
    ), timed AS MATERIALIZED (
      SELECT s.*,clock.instant FROM locked s CROSS JOIN clock
    ), decision AS MATERIALIZED (
      SELECT s.id,s.instant,s.refresh_hash AS consumed_hash,CASE
        WHEN s.revoked_at IS NOT NULL THEN 'REVOKED'
        WHEN s.refresh_expires_at<=s.instant OR s.absolute_expires_at<=s.instant THEN 'EXPIRED'
        WHEN u.id IS NULL THEN 'INVALID'
        WHEN u.session_version IS DISTINCT FROM s.session_version THEN 'VERSION_MISMATCH'
        WHEN s.refresh_hash=${previousHash} THEN CASE WHEN ${mayRotate}::boolean THEN 'ROTATED' ELSE 'THROTTLED' END
        WHEN s.prev_refresh_hash=${previousHash} AND s.instant<=s.rotated_at + ${REFRESH_REUSE_LEEWAY_MS} * interval '1 millisecond' THEN 'WITHIN_LEEWAY'
        ELSE 'REUSE_DETECTED' END AS reason
      FROM timed s LEFT JOIN account u ON u.id=s.user_id
    ), changed AS (
      UPDATE public.mobile_sessions s SET
        prev_refresh_hash=CASE WHEN d.reason='ROTATED' THEN s.refresh_hash ELSE s.prev_refresh_hash END,
        refresh_hash=CASE WHEN d.reason='ROTATED' THEN ${next.refreshHash} ELSE s.refresh_hash END,
        access_hash=CASE WHEN d.reason='ROTATED' THEN ${next.accessHash} ELSE s.access_hash END,
        access_expires_at=CASE WHEN d.reason='ROTATED' THEN least(d.instant + ${ACCESS_TOKEN_LIFETIME_MS} * interval '1 millisecond',s.absolute_expires_at) ELSE s.access_expires_at END,
        refresh_expires_at=CASE WHEN d.reason='ROTATED' THEN least(d.instant + ${REFRESH_TOKEN_LIFETIME_MS} * interval '1 millisecond',s.absolute_expires_at) ELSE s.refresh_expires_at END,
        rotated_at=CASE WHEN d.reason='ROTATED' THEN d.instant ELSE s.rotated_at END,
        last_used_at=CASE WHEN d.reason='ROTATED' THEN d.instant ELSE s.last_used_at END,
        revoked_at=CASE WHEN d.reason='REUSE_DETECTED' THEN d.instant ELSE s.revoked_at END,
        revoke_reason=CASE WHEN d.reason='REUSE_DETECTED' THEN 'REUSE_DETECTED' ELSE s.revoke_reason END
      FROM decision d WHERE s.id=d.id AND d.reason IN ('ROTATED','REUSE_DETECTED')
      RETURNING s.id,s.access_expires_at,s.refresh_expires_at
    ), consumed AS (
      INSERT INTO public.mobile_session_refresh_history(refresh_hash,session_id,consumed_at)
      SELECT d.consumed_hash,d.id,d.instant FROM decision d JOIN changed c ON c.id=d.id WHERE d.reason='ROTATED'
      RETURNING session_id
    ) SELECT d.reason,c.access_expires_at AS "accessExpiresAt",c.refresh_expires_at AS "refreshExpiresAt"
      FROM decision d LEFT JOIN changed c ON c.id=d.id
  `);
  if (!result.rows[0]) return null;
  const parsed = rotationRowSchema.safeParse(result.rows[0]);
  if (!parsed.success) throw new MobileSessionStorageError();
  return parsed.data;
}

/** 가족 내 소비된 토큰도 해당 로그인을 멱등 회수할 수 있습니다. */
export async function revokeByRefreshHash(hash: string): Promise<void> {
  await execute(sql`WITH candidates AS MATERIALIZED (
      SELECT id FROM public.mobile_sessions WHERE refresh_hash=${hash} OR prev_refresh_hash=${hash}
      UNION SELECT session_id FROM public.mobile_session_refresh_history WHERE refresh_hash=${hash}
    ), locked AS MATERIALIZED (
      SELECT id FROM public.mobile_sessions WHERE id IN (SELECT id FROM candidates) FOR UPDATE
    ), timed AS MATERIALIZED (SELECT id,clock_timestamp() AS instant FROM locked)
    UPDATE public.mobile_sessions s SET revoked_at=t.instant,revoke_reason='LOGOUT'
    FROM timed t WHERE s.id=t.id AND s.revoked_at IS NULL`);
}

/** 전체 잠금을 획득한 뒤 단일 시각으로 모바일 로그인만 회수합니다. Web 버전은 그대로입니다. */
export async function revokeUserSessions(userId: string): Promise<void> {
  await execute(sql`WITH locked AS MATERIALIZED (
      SELECT id FROM public.mobile_sessions WHERE user_id=${userId}::uuid ORDER BY id FOR UPDATE
    ), timed AS MATERIALIZED (SELECT clock_timestamp() AS instant FROM (SELECT count(*) FROM locked) barrier)
    UPDATE public.mobile_sessions s SET revoked_at=t.instant,revoke_reason='LOGOUT_ALL'
    FROM timed t WHERE s.id IN (SELECT id FROM locked) AND s.revoked_at IS NULL`);
}

/** SKIP LOCKED 배치 삭제이며 가족 이력도 FK CASCADE로 함께 삭제됩니다. testNow는 시험 전용입니다. */
export async function deleteExpiredSessions(testNow: Date | undefined, limit: number): Promise<number> {
  const result = await execute(sql`WITH timed AS MATERIALIZED (
      SELECT COALESCE(${testNow?.toISOString() ?? null}::timestamptz,clock_timestamp()) AS instant
    ), candidates AS (
      SELECT id FROM public.mobile_sessions,timed WHERE refresh_expires_at<=instant
        OR absolute_expires_at<=instant OR revoked_at<=instant
      ORDER BY refresh_expires_at,id LIMIT ${limit} FOR UPDATE OF mobile_sessions SKIP LOCKED
    ) DELETE FROM public.mobile_sessions s USING candidates c WHERE s.id=c.id RETURNING s.id`);
  return result.rows.length;
}
