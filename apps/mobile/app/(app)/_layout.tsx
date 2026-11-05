/**
 * 역할: 승인 완료 사용자 전용 기능 경로 가드입니다. 계정 정리는 루트가 소유합니다.
 * 사용 위치: app/(app)/_layout.tsx
 * 주요 기능:
 * - RouteGuard(scope="app")로 미인증·승인 대기(PENDING) 계정의 진입 차단
 */
import { Slot } from 'expo-router';
import { RouteGuard } from '../../src/auth/route-guard';

export default function AppLayout() {
  return (
    <RouteGuard scope="app">
      <Slot />
    </RouteGuard>
  );
}
