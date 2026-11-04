/**
 * 역할: 내 정보(Profile) 화면을 구성하는 프레젠테이션 컴포넌트 모음
 * 사용 위치: app/(app)/(tabs)/profile.tsx
 * 주요 기능:
 * - 사용자 이름, 이메일(또는 기본 안내), 역할 배지를 표시하는 프로필 요약 카드(ProfileSummaryCard)
 * - 내 과제(MEMBER 전용), 앱 버전, 선택적 개인정보 처리방침 메뉴 목록(ProfileMenuSection)
 * - 로그아웃 및 모든 기기에서 로그아웃 액션을 제공하는 세션 관리 구획(ProfileSessionSection)
 */
import { StyleSheet, View } from 'react-native';
import { ko } from '../../i18n/ko';
import { theme } from '../../theme';
import {
  AppText,
  Card,
  Chip,
  Divider,
  ListRow,
  SectionHeader,
} from '../../ui';
import type { ProfileDisplayView } from './model';
import { profileStrings } from './strings';

export interface ProfileSummaryCardProps {
  readonly profile: ProfileDisplayView;
}

/** 내 정보 상단 제목('내 정보')과 이름·이메일·역할 배지를 표시하는 요약 카드입니다. */
export function ProfileSummaryCard({ profile }: ProfileSummaryCardProps) {
  return (
    <Card variant="subtle" padding="md" testID="profile-summary-card">
      <View style={styles.topRow}>
        <AppText variant="title">{ko.tabs.profile}</AppText>
        <Chip
          label={profile.roleLabel}
          tone="brand"
          icon="shield-checkmark-outline"
          testID="profile-role-chip"
        />
      </View>
      <View style={styles.identityBlock}>
        <AppText variant="heading" testID="profile-name-text">
          {profile.name}
        </AppText>
        <AppText variant="body" tone="secondary" testID="profile-email-text">
          {profile.emailText}
        </AppText>
      </View>
    </Card>
  );
}

export interface ProfileMenuSectionProps {
  readonly showAssignmentsRow: boolean;
  readonly appVersion: string;
  readonly privacyPolicyUrl: string | null;
  readonly onPressAssignments: () => void;
  readonly onPressPrivacyPolicy: () => void;
}

/** 내 과제(MEMBER 전용), 앱 버전, 개인정보 처리방침(설정 시) 행을 렌더링하는 섹션입니다. */
export function ProfileMenuSection({
  showAssignmentsRow,
  appVersion,
  privacyPolicyUrl,
  onPressAssignments,
  onPressPrivacyPolicy,
}: ProfileMenuSectionProps) {
  return (
    <View style={styles.section} testID="profile-menu-section">
      <SectionHeader title={profileStrings.sections.menu} />
      <Card variant="outlined" padding="none">
        {showAssignmentsRow ? (
          <>
            <ListRow
              title={profileStrings.rows.assignmentsTitle}
              subtitle={profileStrings.rows.assignmentsSubtitle}
              leadingIcon="clipboard-outline"
              onPress={onPressAssignments}
              testID="profile-assignments-row"
            />
            <Divider />
          </>
        ) : null}
        <ListRow
          title={profileStrings.rows.versionTitle}
          meta={appVersion}
          leadingIcon="information-circle-outline"
          showChevron={false}
          testID="profile-version-row"
        />
        {privacyPolicyUrl ? (
          <>
            <Divider />
            <ListRow
              title={profileStrings.rows.privacyPolicyTitle}
              subtitle={profileStrings.rows.privacyPolicySubtitle}
              leadingIcon="document-text-outline"
              onPress={onPressPrivacyPolicy}
              testID="profile-privacy-row"
            />
          </>
        ) : null}
      </Card>
    </View>
  );
}

export interface ProfileSessionSectionProps {
  readonly busy: boolean;
  readonly onPressLogout: () => void;
  readonly onPressLogoutAll: () => void;
}

/** 단일 기기 로그아웃 및 모든 모바일 기기에서 로그아웃 행을 제공하는 섹션입니다. */
export function ProfileSessionSection({
  busy,
  onPressLogout,
  onPressLogoutAll,
}: ProfileSessionSectionProps) {
  return (
    <View style={styles.section} testID="profile-session-section">
      <SectionHeader title={profileStrings.sections.session} />
      <Card variant="outlined" padding="none">
        <ListRow
          title={profileStrings.rows.logoutTitle}
          subtitle={profileStrings.rows.logoutSubtitle}
          leadingIcon="log-out-outline"
          disabled={busy}
          onPress={onPressLogout}
          testID="profile-logout-row"
        />
        <Divider />
        <ListRow
          title={profileStrings.rows.logoutAllTitle}
          subtitle={profileStrings.rows.logoutAllSubtitle}
          leadingIcon="alert-circle-outline"
          tone="danger"
          disabled={busy}
          onPress={onPressLogoutAll}
          testID="profile-logout-all-row"
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  identityBlock: {
    gap: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.sm,
  },
});
