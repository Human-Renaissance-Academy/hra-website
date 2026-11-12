/**
 * 역할: 홈(Home) 화면을 구성하는 프레젠테이션 섹션 컴포넌트 모음
 * 사용 위치: app/(app)/(tabs)/index.tsx
 * 주요 기능:
 * - 상단 인사말 및 역할 배지 헤더(HomeGreetingHeader) 렌더링
 * - 다가오는 일정(HomeScheduleSection), 최근 공지(HomeNoticesSection) 독립 섹션 렌더링
 * - 내 과제 섹션(HomeAssignmentsSection) 재수출
 */
import { StyleSheet, View } from 'react-native';
import { ko } from '../../i18n/ko';
import { theme } from '../../theme';
import { AppText, Card, Chip, EmptyState, ErrorState, SectionHeader, SkeletonList } from '../../ui';
import type { HomeNoticeItemView, HomeScheduleItemView } from './model';
import { homeStrings } from './strings';

export { HomeAssignmentsSection } from './assignments-section';
export type { HomeAssignmentsSectionProps } from './assignments-section';

export interface HomeGreetingHeaderProps {
  readonly greeting: string;
  readonly roleLabel: string;
}

/** 홈 상단 화면 제목('홈'), 사용자 인사말, 역할 배지를 표시하는 헤더입니다. */
export function HomeGreetingHeader({ greeting, roleLabel }: HomeGreetingHeaderProps) {
  return (
    <Card variant="subtle" padding="md" testID="home-greeting-card">
      <View style={styles.greetingTopRow}>
        <AppText variant="title">{ko.tabs.home}</AppText>
        <Chip label={roleLabel} tone="brand" icon="person-outline" testID="home-role-chip" />
      </View>
      <View style={styles.greetingTextBlock}>
        <AppText variant="heading" testID="home-greeting-text">{greeting}</AppText>
        <AppText variant="bodySmall" tone="secondary">{homeStrings.greetingSubtitle}</AppText>
      </View>
    </Card>
  );
}

export interface HomeScheduleSectionProps {
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly items: readonly HomeScheduleItemView[];
  readonly onRetry: () => void;
  readonly onPressViewAll: () => void;
}

/** 홈 화면의 '다가오는 일정' 섹션입니다. */
export function HomeScheduleSection({
  isPending,
  errorMessage,
  items,
  onRetry,
  onPressViewAll,
}: HomeScheduleSectionProps) {
  return (
    <View style={styles.section} testID="home-schedule-section">
      <SectionHeader
        title={homeStrings.schedule.title}
        subtitle={homeStrings.schedule.subtitle}
        actionLabel={homeStrings.schedule.viewAll}
        actionAccessibilityLabel={homeStrings.schedule.viewAllA11y}
        onActionPress={onPressViewAll}
      />
      {isPending ? (
        <SkeletonList count={2} accessibilityLabel={homeStrings.schedule.loadingA11y} testID="home-schedule-skeleton" />
      ) : errorMessage ? (
        <Card variant="outlined" padding="sm">
          <ErrorState message={errorMessage} onRetry={onRetry} testID="home-schedule-error" />
        </Card>
      ) : items.length === 0 ? (
        <Card variant="outlined" padding="sm">
          <EmptyState
            icon="calendar-outline"
            title={homeStrings.schedule.emptyTitle}
            description={homeStrings.schedule.emptyDescription}
            testID="home-schedule-empty"
          />
        </Card>
      ) : (
        <View style={styles.cardList}>
          {items.map((item) => (
            <Card
              key={item.id}
              variant="outlined"
              padding="md"
              onPress={onPressViewAll}
              accessibilityLabel={`${item.title}, ${item.dateTimeText}`}
              testID={`home-schedule-item-${item.id}`}
            >
              <View style={styles.cardHeaderRow}>
                <Chip label={item.eventTypeLabel} tone={item.eventTypeTone} />
                {item.metaText ? <AppText variant="caption" tone="secondary">{item.metaText}</AppText> : null}
              </View>
              <AppText variant="subheading" style={styles.itemTitle}>{item.title}</AppText>
              <AppText variant="bodySmall" tone="secondary">{item.dateTimeText}</AppText>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

export interface HomeNoticesSectionProps {
  readonly isPending: boolean;
  readonly errorMessage: string | null;
  readonly items: readonly HomeNoticeItemView[];
  readonly onRetry: () => void;
  readonly onPressViewAll: () => void;
  readonly onPressNotice: (noticeId: string) => void;
}

/** 홈 화면의 '최근 공지' 섹션입니다. */
export function HomeNoticesSection({
  isPending,
  errorMessage,
  items,
  onRetry,
  onPressViewAll,
  onPressNotice,
}: HomeNoticesSectionProps) {
  return (
    <View style={styles.section} testID="home-notices-section">
      <SectionHeader
        title={homeStrings.notices.title}
        subtitle={homeStrings.notices.subtitle}
        actionLabel={homeStrings.notices.viewAll}
        actionAccessibilityLabel={homeStrings.notices.viewAllA11y}
        onActionPress={onPressViewAll}
      />
      {isPending ? (
        <SkeletonList count={2} accessibilityLabel={homeStrings.notices.loadingA11y} testID="home-notices-skeleton" />
      ) : errorMessage ? (
        <Card variant="outlined" padding="sm">
          <ErrorState message={errorMessage} onRetry={onRetry} testID="home-notices-error" />
        </Card>
      ) : items.length === 0 ? (
        <Card variant="outlined" padding="sm">
          <EmptyState
            icon="megaphone-outline"
            title={homeStrings.notices.emptyTitle}
            description={homeStrings.notices.emptyDescription}
            testID="home-notices-empty"
          />
        </Card>
      ) : (
        <View style={styles.cardList}>
          {items.map((item) => (
            <Card
              key={item.id}
              variant="outlined"
              padding="md"
              onPress={() => onPressNotice(item.id)}
              accessibilityLabel={item.accessibilityLabel}
              testID={`home-notice-item-${item.id}`}
            >
              <View style={styles.cardHeaderRow}>
                {item.pinned ? <Chip label={homeStrings.notices.pinnedBadge} tone="brand" icon="pin" /> : null}
                <AppText variant="caption" tone="secondary">{item.dateText} · {item.viewCountText}</AppText>
              </View>
              <AppText variant="subheading" style={styles.itemTitle}>{item.title}</AppText>
              {item.excerpt ? (
                <AppText variant="bodySmall" tone="secondary" numberOfLines={2}>{item.excerpt}</AppText>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  greetingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  greetingTextBlock: {
    gap: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.sm,
  },
  cardList: {
    gap: theme.spacing.s3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  itemTitle: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
});
