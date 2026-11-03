/**
 * 관리자 대시보드의 PostgreSQL 집계를 소유하는 저장소입니다.
 * 기존 아홉 count 조회의 투영·순서·대기 필터와 단일 Promise.all을 그대로 유지합니다.
 */
import "server-only";

import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  alumniStories,
  applicationSubmissions,
  cohorts,
  galleries,
  notices,
  pressArticles,
  users,
} from "@/lib/db/schema";

/** 집계 하나라도 거부되면 전체 조회를 거부하여 페이지의 기존 오류 처리를 유지합니다. */
export async function getDashboardCountRows() {
  return Promise.all([
    db.select({ total: count() }).from(applicationSubmissions).where(eq(applicationSubmissions.status, "PENDING")),
    db.select({ total: count() }).from(applicationSubmissions),
    db.select({ total: count() }).from(users).where(eq(users.role, "PENDING")),
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(cohorts),
    db.select({ total: count() }).from(notices),
    db.select({ total: count() }).from(pressArticles),
    db.select({ total: count() }).from(galleries),
    db.select({ total: count() }).from(alumniStories),
  ]);
}
