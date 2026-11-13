/** 자료실 직접 업로드의 회원 기수 존재 확인에 필요한 열만 조회합니다. */
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** 토큰 발급 시점의 기존 cohortId 단일 조회를 유지합니다. */
export async function findUploadCohortId(userId: string): Promise<string | null> {
  const [user] = await db
    .select({ cohortId: users.cohortId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.cohortId ?? null;
}
