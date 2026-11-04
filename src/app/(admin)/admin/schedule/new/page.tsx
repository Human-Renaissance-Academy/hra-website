/**
 * 새 일정 등록 페이지
 *
 * 역할: 일정 등록 폼 렌더링, 교수진·기수 목록을 서버에서 조회해 폼에 전달
 * 사용 위치: /admin/schedule/new
 */

import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";
import { createScheduleEvent } from "@/features/schedule/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminChoices } from "@/features/schedule/admin/service";

export const metadata = { title: "일정 등록" };
export const dynamic = "force-dynamic";

export default async function NewSchedulePage() {
  const session = await requireAdmin();

  // 세션 슬롯 선택에 필요한 식별자·이름·분류만 조회합니다.
  const { faculties, cohorts: cohortsData } = await getAdminChoices({ userId: session.user.id, role: session.user.role });

  return (
    <ScheduleForm
      title="새 일정 등록"
      submitLabel="등록"
      action={createScheduleEvent}
      faculties={faculties}
      cohorts={cohortsData}
    />
  );
}
