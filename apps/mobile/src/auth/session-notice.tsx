/**
 * 역할: 세션 갱신 실패(네트워크/타임아웃 등) 시 자동 로그아웃 대신 연결 상태와 명시적 재확인을 제공하는 상단 배너
 * 사용 위치: app/_layout.tsx (루트 내비게이션 상단)
 * 주요 기능:
 * - 공통 InlineBanner를 사용해 한국어 오류 문구(toKoreanMessage) 표시
 * - '다시 확인'(retry) 및 '로그아웃'(logout) 액션 제공
 */
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError, toKoreanMessage } from '../api/errors';
import { ko } from '../i18n/ko';
import { InlineBanner } from '../ui';
import { useAuth } from './use-auth';
import { authStyles as styles } from './screen-styles';

export function SessionNotice() {
  const { status, error, retry, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  if (status !== 'signedIn' || !error) return null;

  async function check() {
    setBusy(true);
    try {
      await retry();
    } catch (failure) {
      if (!(failure instanceof ApiError)) throw failure;
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.noticeWrapper}>
      <InlineBanner
        tone="warning"
        message={toKoreanMessage(error)}
        actionLabel={ko.auth.retry}
        actionDisabled={busy}
        onActionPress={() => {
          void check();
        }}
        secondaryActionLabel={ko.auth.logout}
        onSecondaryActionPress={() => {
          void logout();
        }}
      />
    </View>
  );
}
