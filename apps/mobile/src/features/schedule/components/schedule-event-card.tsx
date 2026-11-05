/**
 * 역할: 단일 학사 일정(ScheduleEvent)과 세부 세션(ScheduleSession) 목록을 표시하는 카드 컴포넌트
 * 사용 위치: src/features/schedule/components/schedule-screen.tsx
 * 주요 기능:
 * - 벽시계 시간 범위(startTime – endTime), 일정 제목, 구분 칩(수업/행사), 주차("N주차"), 기수명, 설명 표시
 * - 세부 세션을 order 오름차순으로 정렬하고 분류 한국어 레이블(고전/영어/스피치/특강/케이스 스터디)과 교수명·소제목·내용·과제 분류 표시
 * - null 또는 공백인 선택 필드는 렌더링하지 않아 빈 줄(empty row) 발생을 방지하고, 제목은 numberOfLines 없이 전체 줄바꿈 보장
 */
import { StyleSheet, View } from 'react-native';
import { theme } from '../../../theme';
import { AppText, Card, Chip, Divider } from '../../../ui';
import {
  formatWallTimeRange,
  getEventTypeLabel,
  getSessionCategoryLabel,
  sortScheduleSessions,
} from '../schedule-model';
import type { ScheduleEventDto, ScheduleSessionDto } from '../schedule-model';
import { scheduleStrings } from '../strings';

export interface ScheduleEventCardProps {
  readonly event: ScheduleEventDto;
}

const hasNonEmptyText = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** 세부 세션 한 건을 표시하는 내부 행 컴포넌트입니다. */
function SessionItem({
  session,
  eventId,
  index,
}: {
  readonly session: ScheduleSessionDto;
  readonly eventId: string;
  readonly index: number;
}) {
  const categoryLabel = getSessionCategoryLabel(session.category);
  const facultyName = hasNonEmptyText(session.faculty?.name) ? session.faculty.name : null;
  const subTitle = hasNonEmptyText(session.subTitle) ? session.subTitle : null;
  const content = hasNonEmptyText(session.content) ? session.content : null;
  const subDescription = hasNonEmptyText(session.subDescription) ? session.subDescription : null;
  const reportCategory = hasNonEmptyText(session.reportCategory) ? session.reportCategory : null;

  return (
    <View
      style={styles.sessionCard}
      testID={`schedule-session-${eventId}-${index}`}
    >
      <View style={styles.sessionTopRow}>
        <Chip
          label={categoryLabel}
          tone="brand"
          testID={`schedule-session-category-${eventId}-${index}`}
        />
        {facultyName ? (
          <AppText
            variant="label"
            tone="secondary"
            testID={`schedule-session-faculty-${eventId}-${index}`}
          >
            {scheduleStrings.labels.facultyFormat(facultyName)}
          </AppText>
        ) : null}
        {reportCategory ? (
          <Chip
            label={`${scheduleStrings.labels.reportCategoryPrefix} ${reportCategory}`}
            tone="neutral"
            testID={`schedule-session-report-${eventId}-${index}`}
          />
        ) : null}
      </View>

      {subTitle ? (
        <AppText
          variant="body"
          weight="600"
          testID={`schedule-session-subtitle-${eventId}-${index}`}
        >
          {subTitle}
        </AppText>
      ) : null}

      {content ? (
        <AppText
          variant="bodySmall"
          tone="primary"
          testID={`schedule-session-content-${eventId}-${index}`}
        >
          {content}
        </AppText>
      ) : null}

      {subDescription ? (
        <AppText
          variant="bodySmall"
          tone="secondary"
          testID={`schedule-session-subdescription-${eventId}-${index}`}
        >
          {subDescription}
        </AppText>
      ) : null}
    </View>
  );
}

/** 일정 한 건과 하위 세션 목록을 렌더링하는 카드 컴포넌트입니다. */
export function ScheduleEventCard({ event }: ScheduleEventCardProps) {
  const timeRange = formatWallTimeRange(event.startTime, event.endTime);
  const typeLabel = getEventTypeLabel(event.eventType);
  const typeTone = event.eventType === 'CLASS' ? 'brand' : 'warning';
  const weekLabel =
    typeof event.weekNumber === 'number'
      ? scheduleStrings.labels.weekFormat(event.weekNumber)
      : null;
  const cohortName = hasNonEmptyText(event.cohort?.name) ? event.cohort.name : null;
  const description = hasNonEmptyText(event.description) ? event.description : null;
  const orderedSessions = sortScheduleSessions(event.sessions);

  return (
    <Card
      variant="elevated"
      padding="md"
      style={styles.card}
      testID={`schedule-event-card-${event.id}`}
    >
      <View style={styles.metaRow}>
        <Chip
          label={typeLabel}
          tone={typeTone}
          testID={`schedule-event-type-${event.id}`}
        />
        {weekLabel ? (
          <Chip
            label={weekLabel}
            tone="neutral"
            testID={`schedule-event-week-${event.id}`}
          />
        ) : null}
        {cohortName ? (
          <Chip
            label={cohortName}
            tone="neutral"
            testID={`schedule-event-cohort-${event.id}`}
          />
        ) : null}
        <AppText
          variant="label"
          tone="secondary"
          style={styles.timeText}
          testID={`schedule-event-time-${event.id}`}
        >
          {timeRange}
        </AppText>
      </View>

      <AppText
        variant="subheading"
        testID={`schedule-event-title-${event.id}`}
      >
        {event.title}
      </AppText>

      {description ? (
        <AppText
          variant="bodySmall"
          tone="secondary"
          testID={`schedule-event-description-${event.id}`}
        >
          {description}
        </AppText>
      ) : null}

      {orderedSessions.length > 0 ? (
        <View
          style={styles.sessionsSection}
          testID={`schedule-event-sessions-${event.id}`}
        >
          <Divider spacing="xs" />
          <View style={styles.sessionsList}>
            {orderedSessions.map((session, index) => (
              <SessionItem
                key={`${event.id}-session-${session.order}-${index}`}
                session={session}
                eventId={event.id}
                index={index}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  timeText: {
    marginLeft: 'auto',
  },
  sessionsSection: {
    gap: theme.spacing.sm,
  },
  sessionsList: {
    gap: theme.spacing.sm,
  },
  sessionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.s3,
    gap: theme.spacing.xs,
  },
  sessionTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
