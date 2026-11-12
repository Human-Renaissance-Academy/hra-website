/**
 * 역할: 홈(Home) 화면의 순수 도메인·표시 변환 로직 및 쿼리 키 생성기
 * 사용 위치: app/(app)/(tabs)/index.tsx, src/features/home/components.tsx, tests/home-*.test.tsx
 * 주요 기능:
 * - React Native에 의존하지 않는 순수 TypeScript 함수로 인사말·역할 레이블·일정·공지·과제 요약 계산
 * - KST 달력 기준 월 계산(kstMonthOf) 및 다가오는 일정 3건 추출(upcomingScheduleEvents)
 * - 벽시계 일정 시각(calendarDate, startTime, endTime)을 타임존 재변환 없이 한국어 표시 문자열로 포맷
 * - 과제 목록에서 공개(PUBLISHED) 미제출 건수 및 가장 가까운 마감 과제(formatDueText) 계산
 * - 계정 전환 시 캐시 오염을 막는 사용자 식별자(userId) 기반 쿼리 키 생성
 */
import { ApiError, toKoreanMessage } from '../../api/errors';
import type { components } from '../../api/schema';
import type { SessionUser } from '../../auth/types';
import {
  formatKstDate,
  formatKstDateTime,
  instantMs,
  koreanWeekday,
  kstMonthOf,
  upcomingScheduleEvents,
} from '../../lib/date-kst';
import type { Instant } from '../../lib/date-kst';
import { formatDueText } from '../../lib/format';
import { homeStrings } from './strings';

export type UserRole = SessionUser['role'];
export type ScheduleEventDto = Readonly<components['schemas']['ScheduleEvent']>;
export type NoticeSummaryDto = Readonly<components['schemas']['NoticeSummary']>;
export type AssignmentSummaryDto = Readonly<components['schemas']['AcademicAssignmentSummary']>;

export interface HomeScheduleItemView {
  readonly id: string;
  readonly title: string;
  readonly dateTimeText: string;
  readonly eventTypeLabel: string;
  readonly eventTypeTone: 'brand' | 'neutral';
  readonly metaText: string | undefined;
}

export interface HomeNoticeItemView {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly pinned: boolean;
  readonly dateText: string;
  readonly viewCountText: string;
  readonly accessibilityLabel: string;
}

export interface HomeAssignmentsSummaryView {
  readonly pendingCount: number;
  readonly pendingCountText: string;
  readonly nearestTitleText: string | undefined;
  readonly nearestDueText: string | undefined;
  readonly nearestDueBadge: string | undefined;
  readonly nearestDueTone: 'warning' | 'danger' | 'neutral';
  readonly descriptionText: string;
  readonly accessibilityLabel: string;
}

export type HomeAssignmentsResolution =
  | { readonly kind: 'unavailable'; readonly reason: 'role' | 'disabled'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ready'; readonly summary: HomeAssignmentsSummaryView };

/** 사용자별 격리된 홈 화면 React Query 키 모음입니다. */
export const homeQueryKeys = {
  schedule: (userId: string | null | undefined, year: number, month: number) =>
    ['home', 'schedule', userId ?? 'anonymous', year, month] as const,
  notices: (userId: string | null | undefined) =>
    ['home', 'notices', userId ?? 'anonymous', { page: 1, pageSize: 3 }] as const,
  assignments: (userId: string | null | undefined) =>
    ['home', 'assignments', userId ?? 'anonymous', { pageSize: 5 }] as const,
} as const;

/** 역할 열거값을 한국어 표시 문자열로 변환합니다. */
export function formatRoleLabel(role: UserRole | null | undefined): string {
  if (!role) return homeStrings.roles.MEMBER;
  switch (role) {
    case 'ADMIN': return homeStrings.roles.ADMIN;
    case 'FACULTY': return homeStrings.roles.FACULTY;
    case 'MEMBER': return homeStrings.roles.MEMBER;
    case 'PENDING': return homeStrings.roles.PENDING;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

/** 사용자 이름이 비어 있을 때 '회원' 폴백을 적용해 인사말을 생성합니다. */
export function formatHomeGreeting(name: string | null | undefined): string {
  const trimmed = name?.trim();
  const displayName = trimmed && trimmed.length > 0 ? trimmed : homeStrings.fallbackName;
  return homeStrings.greeting(displayName);
}

/** 현재 시각 기준 조회할 KST 연·월을 반환합니다. */
export function getCurrentKstYearMonth(now: Instant = Date.now()): {
  readonly year: number;
  readonly month: number;
} {
  return kstMonthOf(now);
}

/** 일정의 KST 벽시계 날짜(YYYY-MM-DD)와 시작/종료 시각(HH:MM)을 타임존 변환 없이 그대로 조합합니다. */
export function formatScheduleWallDateTime(event: {
  readonly calendarDate: string;
  readonly startTime: string;
  readonly endTime?: string | null | undefined;
}): string {
  const weekday = koreanWeekday(event.calendarDate);
  const timeRange = event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
  return `${event.calendarDate} (${weekday}) ${timeRange}`;
}

/** 월간 일정 목록에서 현재 시각 이후 다가오는 일정 최대 3건을 화면 표시 모델로 변환합니다. */
export function selectHomeUpcomingSchedules(
  events: readonly ScheduleEventDto[],
  now: Instant,
  limit = 3,
): readonly HomeScheduleItemView[] {
  return upcomingScheduleEvents(events, now, limit).map((event) => {
    const metaParts: string[] = [];
    if (event.cohort?.name) metaParts.push(event.cohort.name);
    if (event.weekNumber !== null) metaParts.push(homeStrings.schedule.weekBadge(event.weekNumber));
    const isClass = event.eventType === 'CLASS';
    return {
      id: event.id,
      title: event.title,
      dateTimeText: formatScheduleWallDateTime(event),
      eventTypeLabel: isClass ? homeStrings.schedule.eventTypes.CLASS : homeStrings.schedule.eventTypes.EVENT,
      eventTypeTone: isClass ? 'brand' : 'neutral',
      metaText: metaParts.length > 0 ? metaParts.join(' · ') : undefined,
    };
  });
}

/** 최근 공지 목록(최대 3건)을 KST 날짜 및 조회수 문자열이 포함된 표시 모델로 변환합니다. */
export function mapHomeNotices(
  notices: readonly NoticeSummaryDto[],
): readonly HomeNoticeItemView[] {
  return notices.slice(0, 3).map((notice) => {
    const dateText = formatKstDate(notice.createdAt);
    return {
      id: notice.id,
      title: notice.title,
      excerpt: notice.excerpt.trim(),
      pinned: notice.pinned,
      dateText,
      viewCountText: homeStrings.notices.viewCount(notice.viewCount),
      accessibilityLabel: homeStrings.notices.itemA11y(notice.title, dateText),
    };
  });
}

/** 과제 목록에서 공개(PUBLISHED) 미제출 과제를 집계하고 가장 마감이 가까운 과제를 계산합니다. */
export function summarizeHomeAssignments(
  assignments: readonly AssignmentSummaryDto[],
  now: Instant,
): HomeAssignmentsSummaryView {
  const nowMs = instantMs(now);
  const pendingPublished = assignments.filter(
    (item) => item.status === 'PUBLISHED' && item.submission === null,
  );
  const sortedByDue = [...pendingPublished].sort(
    (a, b) => instantMs(a.dueAt) - instantMs(b.dueAt),
  );
  const nearest =
    sortedByDue.find((item) => instantMs(item.dueAt) > nowMs) ?? sortedByDue[0];
  const pendingCount = pendingPublished.length;
  const pendingCountText = homeStrings.assignments.pendingCountLabel(pendingCount);

  if (!nearest) {
    return {
      pendingCount: 0,
      pendingCountText,
      nearestTitleText: undefined,
      nearestDueText: undefined,
      nearestDueBadge: undefined,
      nearestDueTone: 'neutral',
      descriptionText: homeStrings.assignments.allSubmittedDescription,
      accessibilityLabel: homeStrings.assignments.cardA11y(0),
    };
  }

  const dueBadge = formatDueText(nearest.dueAt, now);
  const nearestDueText = homeStrings.assignments.nearestDueLabel(
    dueBadge,
    formatKstDateTime(nearest.dueAt),
  );
  return {
    pendingCount,
    pendingCountText,
    nearestTitleText: homeStrings.assignments.nearestTitleLabel(nearest.title),
    nearestDueText,
    nearestDueBadge: dueBadge,
    nearestDueTone: dueBadge === '마감됨' ? 'danger' : 'warning',
    descriptionText: nearestDueText,
    accessibilityLabel: homeStrings.assignments.cardA11y(pendingCount),
  };
}

/** 역할(MEMBER 전용 여부)과 API 응답/오류를 바탕으로 홈 내 과제 섹션의 표시 상태를 결정합니다. */
export function resolveHomeAssignmentsState(input: {
  readonly role: UserRole | null | undefined;
  readonly assignments?: readonly AssignmentSummaryDto[] | undefined;
  readonly error?: unknown;
  readonly now: Instant;
}): HomeAssignmentsResolution {
  if (input.role && input.role !== 'MEMBER') {
    return { kind: 'unavailable', reason: 'role', message: homeStrings.assignments.roleUnavailable };
  }
  if (input.error) {
    if (input.error instanceof ApiError) {
      if (input.error.code === 'FORBIDDEN') {
        return { kind: 'unavailable', reason: 'role', message: homeStrings.assignments.roleUnavailable };
      }
      if (input.error.code === 'DISABLED') {
        return { kind: 'unavailable', reason: 'disabled', message: homeStrings.assignments.academicDisabled };
      }
    }
    return { kind: 'error', message: toKoreanMessage(input.error) };
  }
  return { kind: 'ready', summary: summarizeHomeAssignments(input.assignments ?? [], input.now) };
}
