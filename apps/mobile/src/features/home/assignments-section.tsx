/**
 * 역할: 홈(Home) 화면의 '내 과제' 요약 섹션 컴포넌트
 * 사용 위치: src/features/home/components.tsx, app/(app)/(tabs)/index.tsx
 * 주요 기능:
 * - MEMBER 계정의 공개 미제출 과제 건수 및 가장 가까운 마감 안내 카드 표시
 * - FACULTY/ADMIN 역할 및 학사 기능 비활성(503 DISABLED) 상태를 화면 전체 오류가 아닌 중립 카드로 표시
 * - 일반 조회 오류 시 재시도(ErrorState) 제공 및 카드 터치 시 '/assignments' 이동
 */
import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import {
  AppText,
  Card,
  Chip,
  Divider,
  ErrorState,
  Icon,
  SectionHeader,
  SkeletonList,
} from '../../ui';
import type { HomeAssignmentsResolution } from './model';
import { homeStrings } from './strings';

export interface HomeAssignmentsSectionProps {
  readonly isPending: boolean;
  readonly resolution: HomeAssignmentsResolution;
  readonly onRetry: () => void;
  readonly onPressAssignments: () => void;
}

/** 홈 화면의 '내 과제' 섹션입니다. MEMBER 외 역할 및 학사 비활성 상태는 중립 안내로 표시합니다. */
export function HomeAssignmentsSection({
  isPending,
  resolution,
  onRetry,
  onPressAssignments,
}: HomeAssignmentsSectionProps) {
  const showAction = resolution.kind === 'ready';

  return (
    <View style={styles.section} testID="home-assignments-section">
      <SectionHeader
        title={homeStrings.assignments.title}
        subtitle={homeStrings.assignments.subtitle}
        actionLabel={showAction ? homeStrings.assignments.viewAll : undefined}
        actionAccessibilityLabel={homeStrings.assignments.viewAllA11y}
        onActionPress={showAction ? onPressAssignments : undefined}
      />
      {isPending ? (
        <SkeletonList
          count={1}
          accessibilityLabel={homeStrings.assignments.loadingA11y}
          testID="home-assignments-skeleton"
        />
      ) : resolution.kind === 'unavailable' ? (
        <Card variant="subtle" padding="md" testID="home-assignments-unavailable">
          <View style={styles.unavailableRow}>
            <Icon name="information-circle-outline" size={20} color={theme.colors.secondary} />
            <AppText variant="bodySmall" tone="secondary" style={styles.flexText}>
              {resolution.message}
            </AppText>
          </View>
        </Card>
      ) : resolution.kind === 'error' ? (
        <Card variant="outlined" padding="sm">
          <ErrorState
            message={resolution.message}
            onRetry={onRetry}
            testID="home-assignments-error"
          />
        </Card>
      ) : (
        <Card
          variant="elevated"
          padding="md"
          onPress={onPressAssignments}
          accessibilityLabel={resolution.summary.accessibilityLabel}
          testID="home-assignments-card"
        >
          <View style={styles.cardHeaderRow}>
            <AppText variant="subheading">
              {resolution.summary.pendingCountText}
            </AppText>
            {resolution.summary.nearestDueBadge ? (
              <Chip
                label={resolution.summary.nearestDueBadge}
                tone={resolution.summary.nearestDueTone}
                icon="time-outline"
              />
            ) : (
              <Chip
                label={homeStrings.assignments.completedBadge}
                tone="success"
                icon="checkmark-circle-outline"
              />
            )}
          </View>
          <Divider spacing="sm" />
          {resolution.summary.nearestTitleText ? (
            <AppText variant="body" weight="600" style={styles.nearestTitle}>
              {resolution.summary.nearestTitleText}
            </AppText>
          ) : null}
          <AppText variant="bodySmall" tone="secondary">
            {resolution.summary.descriptionText}
          </AppText>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  nearestTitle: {
    marginBottom: theme.spacing.xs,
  },
  unavailableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  flexText: {
    flex: 1,
  },
});
