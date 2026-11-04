/**
 * 역할: 일정 탭 상단의 월 표시 및 이동 컨트롤(이전 달 / 다음 달 / 오늘) 컴포넌트
 * 사용 위치: src/features/schedule/components/schedule-screen.tsx
 * 주요 기능:
 * - 현재 선택된 연·월("YYYY년 M월")을 보조기술 헤더로 표시하고 탭 제목("일정")도 함께 노출
 * - 허용 경계(1900년 1월, 2100년 12월)에서 이전/다음 달 버튼을 자동으로 비활성화
 * - 1.6배 글꼴 확대 환경에서도 버튼과 제목이 잘리지 않도록 flexWrap 레이아웃과 최소 48dp 터치 영역 보장
 */
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../theme';
import { AppText, Button, Chip } from '../../../ui';
import {
  canNavigateNextMonth,
  canNavigatePreviousMonth,
} from '../schedule-model';
import type { ScheduleMonth } from '../schedule-model';
import { scheduleStrings } from '../strings';

export interface ScheduleMonthHeaderProps {
  readonly visibleMonth: ScheduleMonth;
  readonly isShowingPlaceholder: boolean;
  readonly onPreviousMonth: () => void;
  readonly onNextMonth: () => void;
  readonly onToday: () => void;
}

/** 월별 일정 탐색을 위한 상단 컨트롤 바입니다. */
export function ScheduleMonthHeader({
  visibleMonth,
  isShowingPlaceholder,
  onPreviousMonth,
  onNextMonth,
  onToday,
}: ScheduleMonthHeaderProps) {
  const canGoPrev = canNavigatePreviousMonth(visibleMonth);
  const canGoNext = canNavigateNextMonth(visibleMonth);
  const monthLabel = scheduleStrings.navigation.monthHeaderFormat(
    visibleMonth.year,
    visibleMonth.month,
  );

  return (
    <View style={styles.container} testID="schedule-month-header">
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header">
          {scheduleStrings.screenTitle}
        </AppText>
        <Button
          variant="secondary"
          size="sm"
          label={scheduleStrings.navigation.today}
          accessibilityLabel={scheduleStrings.navigation.today}
          accessibilityHint={scheduleStrings.navigation.todayA11y}
          leadingIcon="calendar-outline"
          onPress={onToday}
          testID="schedule-today-button"
        />
      </View>

      <View style={styles.navRow}>
        <Button
          variant="secondary"
          size="sm"
          label={scheduleStrings.navigation.previousMonth}
          accessibilityLabel={scheduleStrings.navigation.previousMonth}
          accessibilityHint={scheduleStrings.navigation.previousMonthA11y}
          leadingIcon="chevron-back"
          disabled={!canGoPrev}
          onPress={onPreviousMonth}
          testID="schedule-prev-month-button"
        />

        <View style={styles.monthCenter}>
          <AppText
            variant="heading"
            align="center"
            accessibilityRole="header"
            testID="schedule-visible-month-label"
          >
            {monthLabel}
          </AppText>
          {isShowingPlaceholder ? (
            <Chip
              label={scheduleStrings.states.updatingMonthBanner}
              tone="neutral"
              testID="schedule-placeholder-indicator"
            />
          ) : null}
        </View>

        <Button
          variant="secondary"
          size="sm"
          label={scheduleStrings.navigation.nextMonth}
          accessibilityLabel={scheduleStrings.navigation.nextMonth}
          accessibilityHint={scheduleStrings.navigation.nextMonthA11y}
          trailingIcon="chevron-forward"
          disabled={!canGoNext}
          onPress={onNextMonth}
          testID="schedule-next-month-button"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.s3,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.s3,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  monthCenter: {
    flex: 1,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
});
