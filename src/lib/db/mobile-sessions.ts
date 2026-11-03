/**
 * 모바일 로그인 한 건의 불투명 토큰 해시와 회수 상태를 정의합니다.
 * schema.ts에서 재수출하며 원문 토큰은 어떤 열에도 저장하지 않습니다.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const mobileSessions = pgTable("mobile_sessions", {
  id: uuid("id").primaryKey().defaultRandom(), // 로그인 단위 식별자
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessHash: text("access_hash").notNull().unique(), // 현재 접근 토큰의 SHA-256
  refreshHash: text("refresh_hash").notNull().unique(), // 현재 갱신 토큰의 SHA-256
  prevRefreshHash: text("prev_refresh_hash"), // 직전 토큰 재사용 탐지 전용
  sessionVersion: integer("session_version").notNull(), // 발급 당시 계정 버전
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: text("revoke_reason"),
  platform: varchar("platform", { length: 7 }),
  appVersion: varchar("app_version", { length: 64 }),
  deviceName: varchar("device_name", { length: 100 }),
}, table => [
  check("mobile_sessions_access_hash_check", sql`${table.accessHash} ~ '^[0-9a-f]{64}$'`),
  check("mobile_sessions_refresh_hash_check", sql`${table.refreshHash} ~ '^[0-9a-f]{64}$'`),
  check("mobile_sessions_prev_refresh_hash_check", sql`${table.prevRefreshHash} IS NULL OR ${table.prevRefreshHash} ~ '^[0-9a-f]{64}$'`),
  check("mobile_sessions_version_check", sql`${table.sessionVersion} >= 0`),
  check("mobile_sessions_platform_check", sql`${table.platform} IS NULL OR ${table.platform} IN ('ANDROID','IOS')`),
  check("mobile_sessions_revocation_check", sql`(${table.revokedAt} IS NULL AND ${table.revokeReason} IS NULL) OR (${table.revokedAt} IS NOT NULL AND ${table.revokeReason} IS NOT NULL AND ${table.revokeReason} IN ('LOGOUT','LOGOUT_ALL','REUSE_DETECTED','ADMIN','EXPIRED_CLEANUP'))`),
  check("mobile_sessions_time_order_check", sql`${table.createdAt} <= ${table.rotatedAt} AND ${table.rotatedAt} <= ${table.lastUsedAt} AND ${table.rotatedAt} < ${table.accessExpiresAt} AND ${table.accessExpiresAt} <= ${table.refreshExpiresAt} AND ${table.refreshExpiresAt} <= ${table.absoluteExpiresAt} AND (${table.revokedAt} IS NULL OR ${table.revokedAt} >= ${table.createdAt})`),
  index("mobile_sessions_active_user_idx").on(table.userId).where(sql`${table.revokedAt} IS NULL`),
  index("mobile_sessions_user_idx").on(table.userId),
  index("mobile_sessions_expiry_idx").on(table.refreshExpiresAt),
  index("mobile_sessions_prev_refresh_idx").on(table.prevRefreshHash).where(sql`${table.prevRefreshHash} IS NOT NULL`),
]);

/** 소비한 모든 세대를 절대 만료까지 보존하며 PK 단건 조회로 가족 재사용을 탐지합니다. */
export const mobileSessionRefreshHistory = pgTable("mobile_session_refresh_history", {
  refreshHash: text("refresh_hash").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => mobileSessions.id, { onDelete: "cascade" }),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull(),
}, table => [
  check("mobile_session_refresh_history_hash_check", sql`${table.refreshHash} ~ '^[0-9a-f]{64}$'`),
  index("mobile_session_refresh_history_session_idx").on(table.sessionId),
]);
