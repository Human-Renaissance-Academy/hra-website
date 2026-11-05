/**
 * 역할: 단일 날짜 그룹(요일 헤더 + 오늘 배지 + 해당 날짜 일정 카드 목록) 프레젠테이션 컴포넌트
 * 사용 위치: src/features/schedule/components/schedule-screen.tsx
 * 주요 기능:
 * - KST 기준 오늘(isToday) 날짜 그룹에 브랜드 소프트 틴트 배경과 "오늘" 배지 부여
 * - 보조기술용 header 역할과 한국어 날짜·요일 레이블 노출
 */
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../theme';
import { AppText, Chip } from '../../../ui';
import type { ScheduleDateGroupView } from '../schedule-model';
import { scheduleStrings } from '../strings';
import { ScheduleEventCard } from './schedule-event-card';

export interface ScheduleDateGroupProps {
  readonly group: ScheduleDateGroupView;
}

export function ScheduleDateGroup({ group }: ScheduleDateGroupProps) {
  return (
    <View
      style={[styles.dateGroup, group.isToday ? styles.todayDateGroup : null]}
      testID={`schedule-date-group-${group.calendarDate}`}
    >
      <View style={styles.dateHeaderRow}>
        <AppText
          variant="subheading"
          tone={group.isToday ? 'brandText' : 'primary'}
          accessibilityRole="header"
          accessibilityLabel={group.accessibilityLabel}
          testID={`schedule-date-header-${group.calendarDate}`}
        >
          {group.headerLabel}
        </AppText>
        {group.isToday ? (
          <Chip
            label={scheduleStrings.dateGroup.todayBadge}
            tone="brand"
            testID={`schedule-today-badge-${group.calendarDate}`}
          />
        ) : null}
      </View>

      <View style={styles.eventsStack}>
        {group.events.map((event) => (
          <ScheduleEventCard key={event.id} event={event} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dateGroup: {
    gap: theme.spacing.sm,
    padding: theme.spacing.s3,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  todayDateGroup: {
    backgroundColor: theme.colors.brandSoft,
    borderColor: theme.colors.brand,
  },
  dateHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  eventsStack: {
    gap: theme.spacing.sm,
  },
});
