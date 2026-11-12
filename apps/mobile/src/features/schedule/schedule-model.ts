/**
 * 역할: 일정 탭의 월 이동·경계 계산, KST 오늘 판별, 날짜별 그룹화 및 세션 정렬을 담당하는 순수 비즈니스 로직 모듈
 * 사용 위치: src/features/schedule 하위 쿼리, 화면, 카드 컴포넌트 및 Node/Jest 단위 테스트
 * 주요 기능:
 * - KST 현재 연·월 계산 및 허용 범위(1900.01 ~ 2100.12) 경계 가드, 이전/다음 달 계산, 인접 월 프리페치 대상 산출
 * - API가 반환한 Asia/Seoul 벽시계(calendarDate, startTime, endTime) 값을 시간대 변환 없이 그대로 유지·표시
 * - 날짜 그룹별 한국어 요일 헤더, 오늘 여부 판별, 자동 스크롤 대상 그룹 인덱스 계산, 세션 order 오름차순 정렬
 */
import type { components } from '../../api/schema';
import {
  groupScheduleEventsByDate,
  guardScheduleMonth,
  koreanWeekday,
  kstMonthOf,
  kstNow,
} from '../../lib/date-kst';
import type { Clock } from '../../lib/date-kst';
import { scheduleStrings } from './strings';
import type { ScheduleEventType, ScheduleSessionCategory } from './strings';

export type ScheduleEventDto = components['schemas']['ScheduleEvent'];
export type ScheduleSessionDto = components['schemas']['ScheduleSession'];
export type ScheduleResponseDto = components['schemas']['ScheduleResponse'];

export interface ScheduleMonth {
  readonly year: number;
  readonly month: number;
}

export interface ScheduleDateGroupView {
  readonly calendarDate: string;
  readonly headerLabel: string;
  readonly accessibilityLabel: string;
  readonly isToday: boolean;
  readonly events: readonly ScheduleEventDto[];
}

export const SCHEDULE_MIN_YEAR = 1900;
export const SCHEDULE_MAX_YEAR = 2100;
export const SCHEDULE_MIN_MONTH = 1;
export const SCHEDULE_MAX_MONTH = 12;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** 주입된 시계(기본 Date.now) 기준으로 현재 한국(KST) 연·월을 반환합니다. 범위 밖이면 유효 경계로 클램프합니다. */
export function getInitialScheduleMonth(clock: Clock = Date.now): ScheduleMonth {
  const raw = kstMonthOf(clock());
  const clampedYear = Math.min(SCHEDULE_MAX_YEAR, Math.max(SCHEDULE_MIN_YEAR, raw.year));
  const clampedMonth = Math.min(SCHEDULE_MAX_MONTH, Math.max(SCHEDULE_MIN_MONTH, raw.month));
  return guardScheduleMonth(clampedYear, clampedMonth);
}

/** 주입된 시계 기준으로 오늘의 KST 달력 문자열(YYYY-MM-DD)을 반환합니다. */
export function getTodayKstCalendarDate(clock: Clock = Date.now): string {
  const now = kstNow(clock);
  return `${now.year}-${pad2(now.month)}-${pad2(now.day)}`;
}

/** 두 월이 동일한 연·월인지 비교합니다. */
export function isSameScheduleMonth(a: ScheduleMonth, b: ScheduleMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** 이전 달로 이동할 수 있는지(1900년 1월보다 뒤인지) 확인합니다. */
export function canNavigatePreviousMonth(current: ScheduleMonth): boolean {
  const valid = guardScheduleMonth(current.year, current.month);
  return !(valid.year === SCHEDULE_MIN_YEAR && valid.month === SCHEDULE_MIN_MONTH);
}

/** 다음 달로 이동할 수 있는지(2100년 12월보다 앞인지) 확인합니다. */
export function canNavigateNextMonth(current: ScheduleMonth): boolean {
  const valid = guardScheduleMonth(current.year, current.month);
  return !(valid.year === SCHEDULE_MAX_YEAR && valid.month === SCHEDULE_MAX_MONTH);
}

/**
 * 현재 월에서 delta(-1 또는 +1)만큼 이동한 월을 반환합니다.
 * 1900년 1월 이전이나 2100년 12월 이후로 넘어가려 하면 현재 월을 그대로 유지합니다.
 */
export function stepScheduleMonth(current: ScheduleMonth, delta: -1 | 1): ScheduleMonth {
  const valid = guardScheduleMonth(current.year, current.month);
  if (delta === -1) {
    if (!canNavigatePreviousMonth(valid)) return valid;
    return valid.month === 1
      ? guardScheduleMonth(valid.year - 1, 12)
      : guardScheduleMonth(valid.year, valid.month - 1);
  }
  if (!canNavigateNextMonth(valid)) return valid;
  return valid.month === 12
    ? guardScheduleMonth(valid.year + 1, 1)
    : guardScheduleMonth(valid.year, valid.month + 1);
}

/** 현재 월 기준 유효 경계(1900.01~2100.12) 안에 있는 인접 월(이전 달, 다음 달) 목록을 반환합니다. */
export function getAdjacentScheduleMonths(current: ScheduleMonth): readonly ScheduleMonth[] {
  const valid = guardScheduleMonth(current.year, current.month);
  const adjacent: ScheduleMonth[] = [];
  if (canNavigatePreviousMonth(valid)) {
    adjacent.push(stepScheduleMonth(valid, -1));
  }
  if (canNavigateNextMonth(valid)) {
    adjacent.push(stepScheduleMonth(valid, 1));
  }
  return adjacent;
}

/**
 * YYYY-MM-DD 벽시계 날짜 문자열을 "M월 D일 (요일)" 형식의 한국어 헤더로 변환합니다.
 * 날짜 문자열을 UTC나 로컬 시간대로 변환하지 않고 숫자 구성요소만 파싱합니다.
 */
export function formatDateGroupHeader(calendarDate: string): string {
  const weekday = koreanWeekday(calendarDate);
  const parts = calendarDate.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return scheduleStrings.dateGroup.headerFormat(month, day, weekday);
}

/**
 * 서버가 내려준 벽시계 시작·종료 시각 문자열을 변환 없이 그대로 표시 형식으로 조합합니다.
 */
export function formatWallTimeRange(startTime: string, endTime: string | null): string {
  return scheduleStrings.labels.timeRangeFormat(startTime, endTime);
}

/** 일정 구분 코드(CLASS | EVENT)를 한국어 레이블로 변환합니다. */
export function getEventTypeLabel(eventType: ScheduleEventType): string {
  switch (eventType) {
    case 'CLASS':
      return scheduleStrings.eventTypes.CLASS;
    case 'EVENT':
      return scheduleStrings.eventTypes.EVENT;
  }
}

/** 세부 세션 분류 코드를 한국어 레이블로 변환합니다. */
export function getSessionCategoryLabel(category: ScheduleSessionCategory): string {
  switch (category) {
    case 'CLASSICS':
      return scheduleStrings.sessionCategories.CLASSICS;
    case 'ENGLISH':
      return scheduleStrings.sessionCategories.ENGLISH;
    case 'SPEECH':
      return scheduleStrings.sessionCategories.SPEECH;
    case 'SPECIAL_LECTURE':
      return scheduleStrings.sessionCategories.SPECIAL_LECTURE;
    case 'CASE_STUDY':
      return scheduleStrings.sessionCategories.CASE_STUDY;
  }
}

/** 세부 세션 배열을 원본 변형 없이 order 오름차순으로 정렬하여 반환합니다. */
export function sortScheduleSessions(
  sessions: readonly ScheduleSessionDto[],
): readonly ScheduleSessionDto[] {
  return [...sessions].sort((a, b) => a.order - b.order);
}

/**
 * 월별 일정 배열을 날짜별로 그룹화하고 오늘(KST) 여부와 한국어 요일 헤더를 부여합니다.
 */
export function buildScheduleDateGroups(
  events: readonly ScheduleEventDto[],
  todayCalendarDate: string,
): readonly ScheduleDateGroupView[] {
  const rawGroups = groupScheduleEventsByDate(events);
  return rawGroups.map((group) => {
    const headerLabel = formatDateGroupHeader(group.calendarDate);
    const isToday = group.calendarDate === todayCalendarDate;
    return {
      calendarDate: group.calendarDate,
      headerLabel,
      accessibilityLabel: isToday
        ? `${headerLabel}${scheduleStrings.dateGroup.todayA11ySuffix}`
        : headerLabel,
      isToday,
      events: group.events,
    };
  });
}

/** 날짜 그룹 목록에서 오늘(KST) 날짜 그룹의 인덱스를 찾습니다. 없으면 -1을 반환합니다. */
export function findTodayGroupIndex(groups: readonly ScheduleDateGroupView[]): number {
  return groups.findIndex((group) => group.isToday);
}
