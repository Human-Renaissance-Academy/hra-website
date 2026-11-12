/**
 * 역할: 관리자 승인 대기 중인 회원에게 안내 문구와 로그아웃 액션을 제공하는 화면
 * 사용 위치: app/pending.tsx
 * 주요 기능:
 * - 공통 UI 키트(Screen, AppText, Button)를 사용해 승인 대기 상태 표시
 * - 대기 사용자가 언제든 로컬 세션을 정리하고 로그아웃할 수 있도록 지원
 */
import { ko } from '../i18n/ko';
import { AppText, Button, Screen } from '../ui';
import { useAuth } from './use-auth';

export function PendingScreen() {
  const { logout } = useAuth();
  return (
    <Screen scroll padding="lg" centered>
      <AppText variant="title">{ko.auth.pending}</AppText>
      <AppText variant="body" tone="secondary">
        {ko.auth.pendingDescription}
      </AppText>
      <Button
        label={ko.auth.logout}
        fullWidth
        onPress={() => {
          void logout();
        }}
      />
    </Screen>
  );
}
