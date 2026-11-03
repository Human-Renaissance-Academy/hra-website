/**
 * 공개 언론보도 클릭의 조회수 기록을 제공하는 Application Service입니다.
 * 관리자 업무와 분리하여 기존 비로그인 클릭 허용 정책을 유지합니다.
 */
import "server-only";

import { incrementViewCount } from "./view-repository";

/** 웹 adapter가 검증한 기사 ID의 조회수를 기존 SQL로 증가시킵니다. */
export async function recordPressView(id: string): Promise<void> {
  await incrementViewCount(id);
}
