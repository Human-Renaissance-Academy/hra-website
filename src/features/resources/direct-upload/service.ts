/** 회원의 주차별 텍스트 직접 업로드에 필요한 기수 배정 규칙을 적용합니다. */
import "server-only";
import { findUploadCohortId } from "./repository";

/** 종류·역할 검사 뒤 실행하고 배정되지 않은 회원은 기존 메시지로 거부합니다. */
export async function assertDirectUploadCohort(userId: string): Promise<void> {
  if (!(await findUploadCohortId(userId)))
    throw new Error("기수가 배정되지 않은 회원은 업로드할 수 없습니다.");
}
