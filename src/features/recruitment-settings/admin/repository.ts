/**
 * 관리자 모집 설정의 PostgreSQL 조회와 고정 키 저장을 소유합니다.
 * 기존 전체 행 조회·포스터 투영·기수 정렬과 섹션별 upsert 체인을 그대로 유지합니다.
 */
import "server-only";

import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";

/** 기존 관리자 조회 계약은 미사용 필드까지 포함하므로 전체 행 모양을 보존합니다. */
export type RecruitmentSettingsRecord = {
  readonly id: string;
  readonly singletonKey: number;
  readonly activeCohortId: string | null;
  readonly recruitmentStatus: "UPCOMING" | "OPEN" | "CLOSED" | null;
  readonly googleFormUrl: string | null;
  readonly recruitmentStartDate: Date | null;
  readonly posterImageUrl: string | null;
  readonly deadlineDate: Date | null;
  readonly nextRecruitmentYear: number | null;
  readonly nextRecruitmentMonth: number | null;
  readonly qualificationText: string | null;
  readonly detailsMarkdown: string | null;
  readonly posterLayout: string | null;
  readonly updatedAt: Date;
};

export type RecruitmentInfoValues = {
  readonly activeCohortId: string | null;
  readonly googleFormUrl: string | null;
  readonly recruitmentStartDate: Date | null;
  readonly deadlineDate: Date | null;
};
export type RecruitmentPosterValues = {
  readonly posterImageUrl: string | null;
  readonly posterLayout: "right" | "left" | "none";
};
export type RecruitmentDetailsValues = { readonly detailsMarkdown: string | null };
export type RecruitmentSettingsValues = RecruitmentInfoValues & RecruitmentPosterValues & RecruitmentDetailsValues;

/** 조회는 누락 설정을 생성하지 않고 기존 limit(1)을 유지합니다. */
export async function findSettings(): Promise<RecruitmentSettingsRecord | null> {
  const [settings] = await db.select().from(recruitmentSettings).limit(1);
  return settings ?? null;
}

/** 업로드 전에 현재 참조만 읽으며 DB 오류는 호출자에게 그대로 전파합니다. */
export async function findPosterImageUrl(): Promise<string | null> {
  const [existingSettings] = await db
    .select({
      posterImageUrl: recruitmentSettings.posterImageUrl,
    })
    .from(recruitmentSettings)
    .limit(1);
  return existingSettings?.posterImageUrl ?? null;
}

/** 기수 드롭다운의 투영과 최신순 정렬을 보존합니다. */
export async function listCohorts(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(desc(cohorts.order), desc(cohorts.createdAt));
}

/** 전체 저장은 현재 모집 정보와 안내 필드만 고정 키에 반영합니다. */
export async function upsertSettings(values: RecruitmentSettingsValues): Promise<void> {
  await db.insert(recruitmentSettings).values({ singletonKey: 1, ...values })
    .onConflictDoUpdate({ target: recruitmentSettings.singletonKey, set: values });
}

/** 정보 섹션만 갱신해 다른 섹션의 동시 최초 저장 값을 보존합니다. */
export async function upsertInfo(values: RecruitmentInfoValues): Promise<void> {
  await db.insert(recruitmentSettings).values({ singletonKey: 1, ...values })
    .onConflictDoUpdate({ target: recruitmentSettings.singletonKey, set: values });
}

/** 포스터 저장 실패 시 객체 삭제 없이 기존 DB 예외를 전파합니다. */
export async function upsertPoster(values: RecruitmentPosterValues): Promise<void> {
  await db.insert(recruitmentSettings).values({ singletonKey: 1, ...values })
    .onConflictDoUpdate({ target: recruitmentSettings.singletonKey, set: values });
}

/** 세부 안내만 저장하고 나머지 모집 필드를 변경하지 않습니다. */
export async function upsertDetails(values: RecruitmentDetailsValues): Promise<void> {
  await db.insert(recruitmentSettings).values({ singletonKey: 1, ...values })
    .onConflictDoUpdate({ target: recruitmentSettings.singletonKey, set: values });
}
