/** 인증 공급자 안의 루트에서 정리를 소유하여 로그아웃 경로 전환에도 구독을 유지합니다. */
import { useEffect, useState } from 'react';
import { toKoreanMessage } from '../../api/errors';
import { InlineBanner } from '../../ui';
import { profileStrings } from '../profile/strings';
import { startAccountLifecycle } from './account-runtime';

export function AccountLifecycle() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => startAccountLifecycle((failure) => setError(toKoreanMessage(failure))), []);
  return error ? <InlineBanner tone="warning" message={error}
    actionLabel={profileStrings.banners.dismissAction} onActionPress={() => setError(null)}
    testID="account-cleanup-error-banner" /> : null;
}
