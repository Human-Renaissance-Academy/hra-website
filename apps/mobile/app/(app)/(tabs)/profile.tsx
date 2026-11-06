/**
 * 역할: 승인 회원의 내 정보(Profile) 탭 화면
 * 사용 위치: app/(app)/(tabs)/profile.tsx
 * 주요 기능:
 * - 저장된 세션 프로필(useAuth)을 즉시 표시하고 GET /api/v1/me로 표시용 이름·이메일·역할을 최신화
 * - 권한 판단(내 과제 행 노출)은 오직 세션 역할(MEMBER)만 사용하며 /me 응답에 의존하지 않음
 * - 앱 버전(expo-constants), 설정 상수 기반 개인정보 처리방침 링크, 단일/전체 모바일 기기 로그아웃 확인 흐름 제공
 */
import { useState } from 'react';
import { Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { toKoreanMessage } from '../../../src/api/errors';
import { getApiClient } from '../../../src/auth/runtime';
import { useAuth } from '../../../src/auth/use-auth';
import {
  ProfileMenuSection,
  ProfileSessionSection,
  ProfileSummaryCard,
} from '../../../src/features/profile/components';
import {
  buildProfileDisplayView,
  profileQueryKeys,
  resolveAppVersion,
  resolvePrivacyPolicyUrl,
} from '../../../src/features/profile/model';
import { profileStrings } from '../../../src/features/profile/strings';
import { ko } from '../../../src/i18n/ko';
import { apiQueryOptions } from '../../../src/query/client';
import { confirmAction, InlineBanner, Screen, useRefresh } from '../../../src/ui';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, role, logout, logoutAll } = useAuth();
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const isAuthenticated = Boolean(userId);

  const meQuery = useQuery(
    {
      ...apiQueryOptions(profileQueryKeys.me(userId), async (signal) => {
        const { data } = await getApiClient().GET('/api/v1/me', { signal });
        return data?.user ?? null;
      }),
      enabled: isAuthenticated,
    },
  );

  const { refreshing, onRefresh } = useRefresh(async () => {
    if (!isAuthenticated) return;
    await meQuery.refetch();
  });

  const profileView = buildProfileDisplayView({
    sessionUser: user,
    sessionRole: role,
    meUser: meQuery.data,
  });

  const appVersion = resolveAppVersion(Constants.expoConfig?.version);
  const privacyPolicyUrl = resolvePrivacyPolicyUrl();

  const handleOpenPrivacyPolicy = async () => {
    if (!privacyPolicyUrl) return;
    const confirmed = await confirmAction({
      title: profileStrings.dialogs.privacyPolicyTitle,
      message: profileStrings.dialogs.privacyPolicyMessage,
      confirmLabel: profileStrings.dialogs.privacyPolicyConfirm,
    });
    if (!confirmed) return;
    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch (error) {
      setActionError(toKoreanMessage(error));
    }
  };

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: profileStrings.dialogs.logoutTitle,
      message: profileStrings.dialogs.logoutMessage,
      confirmLabel: profileStrings.dialogs.logoutConfirm,
      destructive: true,
    });
    if (!confirmed) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await logout();
    } catch (error) {
      setActionError(toKoreanMessage(error));
    } finally {
      setActionBusy(false);
    }
  };

  const handleLogoutAll = async () => {
    const confirmed = await confirmAction({
      title: profileStrings.dialogs.logoutAllTitle,
      message: profileStrings.dialogs.logoutAllMessage,
      confirmLabel: profileStrings.dialogs.logoutAllConfirm,
      destructive: true,
    });
    if (!confirmed) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await logoutAll();
    } catch (error) {
      setActionError(toKoreanMessage(error));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Screen
      scroll
      padding="md"
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      testID="profile-screen"
    >
      {actionError ? (
        <InlineBanner
          tone="danger"
          title={profileStrings.banners.logoutErrorTitle}
          message={actionError}
          actionLabel={profileStrings.banners.dismissAction}
          onActionPress={() => setActionError(null)}
          testID="profile-action-error-banner"
        />
      ) : null}

      {meQuery.isError ? (
        <InlineBanner
          tone="warning"
          title={profileStrings.banners.profileRefreshErrorTitle}
          message={toKoreanMessage(meQuery.error)}
          actionLabel={ko.ui.retry}
          onActionPress={() => void meQuery.refetch()}
          testID="profile-me-error-banner"
        />
      ) : null}

      <ProfileSummaryCard profile={profileView} />

      <ProfileMenuSection
        showAssignmentsRow={profileView.showAssignmentsRow}
        appVersion={appVersion}
        privacyPolicyUrl={privacyPolicyUrl}
        onPressAssignments={() => router.push('/assignments')}
        onPressPrivacyPolicy={() => void handleOpenPrivacyPolicy()}
      />

      <ProfileSessionSection
        busy={actionBusy}
        onPressLogout={() => void handleLogout()}
        onPressLogoutAll={() => void handleLogoutAll()}
      />
    </Screen>
  );
}
