/**
 * 역할: 일정 탭(`/(app)/(tabs)/schedule`) 라우트 진입점
 * 사용 위치: Expo Router 하단 탭 탐색기(`app/(app)/(tabs)/_layout.tsx`)
 * 주요 기능: 루트 공급자의 공유 캐시를 사용하는 ScheduleScreen을 렌더링
 */
import { ScheduleScreen } from '../../../src/features/schedule';

export default function ScheduleRoute() {
  return <ScheduleScreen />;
}
