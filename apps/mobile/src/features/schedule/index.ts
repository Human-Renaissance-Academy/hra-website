/**
 * 역할: 일정(Schedule) 기능 모듈의 단일 배럴 진입점
 * 사용 위치: app/(app)/(tabs)/schedule.tsx 및 관련 테스트
 * 주요 기능:
 * - 순수 일정 모델 함수, 쿼리 키·옵션 헬퍼, 한국어 문구, 화면·카드 컴포넌트 재수출
 */
export { ScheduleScreen } from './components/schedule-screen';
export type { ScheduleScreenProps } from './components/schedule-screen';

export { ScheduleMonthHeader } from './components/schedule-month-header';
export type { ScheduleMonthHeaderProps } from './components/schedule-month-header';

export { ScheduleEventCard } from './components/schedule-event-card';
export type { ScheduleEventCardProps } from './components/schedule-event-card';

export { ScheduleDateGroup } from './components/schedule-date-group';
export type { ScheduleDateGroupProps } from './components/schedule-date-group';

export {
  buildScheduleDateGroups,
  canNavigateNextMonth,
  canNavigatePreviousMonth,
  findTodayGroupIndex,
  formatDateGroupHeader,
  formatWallTimeRange,
  getAdjacentScheduleMonths,
  getEventTypeLabel,
  getInitialScheduleMonth,
  getSessionCategoryLabel,
  getTodayKstCalendarDate,
  isSameScheduleMonth,
  SCHEDULE_MAX_MONTH,
  SCHEDULE_MAX_YEAR,
  SCHEDULE_MIN_MONTH,
  SCHEDULE_MIN_YEAR,
  sortScheduleSessions,
  stepScheduleMonth,
} from './schedule-model';
export type {
  ScheduleDateGroupView,
  ScheduleEventDto,
  ScheduleMonth,
  ScheduleResponseDto,
  ScheduleSessionDto,
} from './schedule-model';

export {
  fetchScheduleMonth,
  prefetchAdjacentScheduleMonths,
  scheduleMonthQueryKey,
  scheduleMonthQueryOptions,
} from './schedule-query';
export type { ScheduleApiPort } from './schedule-query';

export { scheduleStrings } from './strings';
export type { ScheduleEventType, ScheduleSessionCategory } from './strings';
