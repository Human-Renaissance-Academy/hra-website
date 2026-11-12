/**
 * 관리자 모집 설정 업무의 재인가와 저장 값 구성을 담당합니다.
 * 웹 입력·이미지 인프라·오류 응답·캐시는 adapter가 기존 순서대로 처리합니다.
 */
import "server-only";

import * as repository from "./repository";
import type { RecruitmentPosterValues } from "./repository";

export type RecruitmentSettingsActor = { userId: string; role: string };
export type RecruitmentInfoInput = {
  readonly activeCohortId?: string;
  readonly googleFormUrl?: string;
  readonly recruitmentStartDate?: string;
  readonly deadlineDate?: string;
};
export type RecruitmentDetailsInput = { readonly detailsMarkdown?: string };
export type RecruitmentSettingsInput = RecruitmentInfoInput & RecruitmentDetailsInput & RecruitmentPosterValues;

/** FAQ와 같은 주체 검사로 다른 adapter의 관리자 우회를 차단합니다. */
function assertAdmin(actor: RecruitmentSettingsActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("RECRUITMENT_SETTINGS_ADMIN_REQUIRED");
  }
}

/** 기존 달력 날짜 저장은 UTC 자정 변환을 그대로 사용합니다. */
function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** 관리자 설정 화면이 읽는 필드만 담은 DTO입니다. 내부 키·상태·수정 시각은 노출하지 않습니다. */
export type RecruitmentSettingsDto = {
  readonly activeCohortId: string | null;
  readonly googleFormUrl: string | null;
  readonly recruitmentStartDate: Date | null;
  readonly posterImageUrl: string | null;
  readonly deadlineDate: Date | null;
  readonly detailsMarkdown: string | null;
  readonly posterLayout: string | null;
};

/** 기존 전체 행 조회(limit 1)는 유지하되 화면 필드만 새 객체로 투영하며 기본 행은 만들지 않습니다. */
export async function getSettings(actor: RecruitmentSettingsActor): Promise<RecruitmentSettingsDto | null> {
  assertAdmin(actor);
  const row = await repository.findSettings();
  return row ? {
    activeCohortId: row.activeCohortId,
    googleFormUrl: row.googleFormUrl,
    recruitmentStartDate: row.recruitmentStartDate,
    posterImageUrl: row.posterImageUrl,
    deadlineDate: row.deadlineDate,
    detailsMarkdown: row.detailsMarkdown,
    posterLayout: row.posterLayout,
  } : null;
}

/** 업로드 이전 참조 조회도 반드시 관리자 주체로 실행합니다. */
export async function getPosterImageUrl(actor: RecruitmentSettingsActor) {
  assertAdmin(actor);
  return repository.findPosterImageUrl();
}

/** 기수 선택 목록 역시 기존 관리자 전용 접근을 유지합니다. */
export async function getCohortOptions(actor: RecruitmentSettingsActor) {
  assertAdmin(actor);
  return repository.listCohorts();
}

/** 입력 상태 열을 저장하지 않고 기존 전체 설정의 값·키 순서를 유지합니다. */
export async function saveSettings(actor: RecruitmentSettingsActor, input: RecruitmentSettingsInput): Promise<void> {
  assertAdmin(actor);
  const values = {
    // 현재 모집 기수 섹션
    activeCohortId: input.activeCohortId || null,
    googleFormUrl: input.googleFormUrl ?? null,
    recruitmentStartDate: input.recruitmentStartDate ? toDate(input.recruitmentStartDate) : null,
    // 기존 모집 안내 섹션
    posterImageUrl: input.posterImageUrl,
    deadlineDate: input.deadlineDate ? toDate(input.deadlineDate) : null,
    detailsMarkdown: input.detailsMarkdown ?? null,
    posterLayout: input.posterLayout,
  };
  await repository.upsertSettings(values);
}

/** 정보 섹션은 날짜 변환 후 해당 네 필드만 저장합니다. */
export async function saveInfo(actor: RecruitmentSettingsActor, input: RecruitmentInfoInput): Promise<void> {
  assertAdmin(actor);
  const values = {
    activeCohortId: input.activeCohortId || null,
    googleFormUrl: input.googleFormUrl ?? null,
    recruitmentStartDate: input.recruitmentStartDate ? toDate(input.recruitmentStartDate) : null,
    deadlineDate: input.deadlineDate ? toDate(input.deadlineDate) : null,
  };
  await repository.upsertInfo(values);
}

/** adapter에서 소유권 확인을 마친 포스터 참조와 위치만 반영합니다. */
export async function savePoster(actor: RecruitmentSettingsActor, input: RecruitmentPosterValues): Promise<void> {
  assertAdmin(actor);
  const values = { posterImageUrl: input.posterImageUrl, posterLayout: input.posterLayout };
  await repository.upsertPoster(values);
}

/** 비어 있는 세부 안내는 기존과 같이 null로 저장합니다. */
export async function saveDetails(actor: RecruitmentSettingsActor, input: RecruitmentDetailsInput): Promise<void> {
  assertAdmin(actor);
  const values = { detailsMarkdown: input.detailsMarkdown ?? null };
  await repository.upsertDetails(values);
}
