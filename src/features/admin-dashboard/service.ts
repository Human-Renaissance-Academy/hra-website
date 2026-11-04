/**
 * 관리자 대시보드의 재인가와 표시용 집계 DTO를 제공하는 Application Service입니다.
 * 웹 세션·오류 카드·로그는 페이지가 처리하고 이 계층은 저장소 행을 아홉 숫자로 변환합니다.
 */
import "server-only";

import * as dashboardRepository from "./repository";

export type DashboardActor = { userId: string; role: string };

export type DashboardCounts = {
  readonly pendingSubmissions: number;
  readonly totalSubmissions: number;
  readonly pendingUsers: number;
  readonly totalMembers: number;
  readonly totalCohorts: number;
  readonly totalNotices: number;
  readonly totalPress: number;
  readonly totalGalleries: number;
  readonly totalAlumni: number;
};

/** 다른 adapter가 호출해도 FAQ 서비스와 같은 방식으로 홈페이지 관리자 권한을 재확인합니다. */
function assertAdmin(actor: DashboardActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("DASHBOARD_ADMIN_REQUIRED");
  }
}

/** 기존 페이지의 Number·누락 행 기본값을 유지하고 내부 행 대신 숫자만 반환합니다. */
export async function getDashboardCounts(actor: DashboardActor): Promise<DashboardCounts> {
  assertAdmin(actor);
  const [
    pendingSubmissionRows,
    totalSubmissionRows,
    pendingUserRows,
    memberRows,
    cohortRows,
    noticeRows,
    pressRows,
    galleryRows,
    alumniRows,
  ] = await dashboardRepository.getDashboardCountRows();

  return {
    pendingSubmissions: Number(pendingSubmissionRows[0]?.total ?? 0),
    totalSubmissions: Number(totalSubmissionRows[0]?.total ?? 0),
    pendingUsers: Number(pendingUserRows[0]?.total ?? 0),
    totalMembers: Number(memberRows[0]?.total ?? 0),
    totalCohorts: Number(cohortRows[0]?.total ?? 0),
    totalNotices: Number(noticeRows[0]?.total ?? 0),
    totalPress: Number(pressRows[0]?.total ?? 0),
    totalGalleries: Number(galleryRows[0]?.total ?? 0),
    totalAlumni: Number(alumniRows[0]?.total ?? 0),
  };
}
