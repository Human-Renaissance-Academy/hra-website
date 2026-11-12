/**
 * 역할: 홈(Home) 순수 도메인·표시 변환 모듈(src/features/home/model.ts) 단위 테스트
 * 사용 위치: apps/mobile/tests/home-model.test.tsx
 * 주요 기능:
 * - 인사말·역할 레이블·KST 연월 계산·일정 벽시계 보존·공지 매핑·과제 집계 및 오류 상태 분기 검증
 */
import { ApiError } from '../src/api/errors';
import {
  formatHomeGreeting,
  formatRoleLabel,
  formatScheduleWallDateTime,
  getCurrentKstYearMonth,
  homeQueryKeys,
  mapHomeNotices,
  resolveHomeAssignmentsState,
  selectHomeUpcomingSchedules,
  summarizeHomeAssignments,
} from '../src/features/home/model';
import type {
  AssignmentSummaryDto,
  NoticeSummaryDto,
  ScheduleEventDto,
} from '../src/features/home/model';
import { homeStrings } from '../src/features/home/strings';

const sampleScheduleEvents: readonly ScheduleEventDto[] = [
  {
    id: 'ev-past', calendarDate: '2026-10-10', startTime: '19:00', endTime: '21:00',
    eventType: 'CLASS', title: '지난 수업', weekNumber: 1, description: null,
    cohort: { id: 'c-1', name: '15기' }, sessions: [],
  },
  {
    id: 'ev-2', calendarDate: '2026-10-25', startTime: '14:00', endTime: null,
    eventType: 'EVENT', title: '특별 세미나', weekNumber: null, description: '특강 안내',
    cohort: null, sessions: [],
  },
  {
    id: 'ev-1', calendarDate: '2026-10-20', startTime: '19:30', endTime: '21:30',
    eventType: 'CLASS', title: '고전 강독 2주차', weekNumber: 2, description: null,
    cohort: { id: 'c-1', name: '15기' }, sessions: [],
  },
  {
    id: 'ev-3', calendarDate: '2026-10-28', startTime: '10:00', endTime: '12:00',
    eventType: 'CLASS', title: '스피치 실습', weekNumber: 3, description: null,
    cohort: { id: 'c-1', name: '15기' }, sessions: [],
  },
  {
    id: 'ev-4', calendarDate: '2026-10-30', startTime: '10:00', endTime: '12:00',
    eventType: 'EVENT', title: '네트워킹 데이', weekNumber: null, description: null,
    cohort: null, sessions: [],
  },
];

describe('home model pure helpers', () => {
  test('인사말과 역할 레이블을 한국어로 변환한다', () => {
    // Given
    const rawName = '  김학사  ';
    // When / Then
    expect(formatHomeGreeting(rawName)).toBe('안녕하세요, 김학사님');
    expect(formatHomeGreeting('   ')).toBe('안녕하세요, 회원님');
    expect(formatHomeGreeting(null)).toBe('안녕하세요, 회원님');
    expect(formatRoleLabel('ADMIN')).toBe('관리자');
    expect(formatRoleLabel('FACULTY')).toBe('교수진');
    expect(formatRoleLabel('MEMBER')).toBe('회원');
    expect(formatRoleLabel('PENDING')).toBe('승인 대기');
    expect(formatRoleLabel(null)).toBe('회원');
  });

  test('UTC 자정 경계에서 KST 기준 연도와 월을 계산한다', () => {
    // Given: 2026-10-31 15:30 UTC === 2026-11-01 00:30 KST
    const utcInstant = '2026-10-31T15:30:00.000Z';
    // When
    const kstMonth = getCurrentKstYearMonth(utcInstant);
    // Then
    expect(kstMonth).toEqual({ year: 2026, month: 11 });
  });

  test('다가오는 일정을 KST 벽시계 값 그대로 정렬해 최대 3건 반환한다', () => {
    // Given: 2026-10-15T00:00:00Z (2026-10-15 09:00 KST)
    const now = '2026-10-15T00:00:00.000Z';
    // When
    const result = selectHomeUpcomingSchedules(sampleScheduleEvents, now, 3);
    // Then
    expect(result.map((item) => item.id)).toEqual(['ev-1', 'ev-2', 'ev-3']);
    expect(result[0]).toEqual({
      id: 'ev-1',
      title: '고전 강독 2주차',
      dateTimeText: '2026-10-20 (화) 19:30–21:30',
      eventTypeLabel: '수업',
      eventTypeTone: 'brand',
      metaText: '15기 · 2주차',
    });
    expect(result[1]?.dateTimeText).toBe('2026-10-25 (일) 14:00');
    expect(
      formatScheduleWallDateTime({ calendarDate: '2026-10-20', startTime: '09:00', endTime: '11:00' }),
    ).toBe('2026-10-20 (화) 09:00–11:00');
  });

  test('공지 목록을 최대 3건의 KST 날짜·조회수 표시 모델로 변환한다', () => {
    // Given
    const notices: readonly NoticeSummaryDto[] = [
      {
        id: 'n-1',
        title: '첫 번째 공지',
        excerpt: '  본문 요약입니다.  ',
        pinned: true,
        viewCount: 1234,
        createdAt: '2026-10-31T15:30:00.000Z',
        updatedAt: '2026-10-31T15:30:00.000Z',
      },
    ];
    // When
    const mapped = mapHomeNotices(notices);
    // Then
    expect(mapped[0]).toEqual({
      id: 'n-1',
      title: '첫 번째 공지',
      excerpt: '본문 요약입니다.',
      pinned: true,
      dateText: '2026.11.01',
      viewCountText: '조회 1,234',
      accessibilityLabel: '첫 번째 공지, 등록일 2026.11.01',
    });
  });

  test('과제 요약은 PUBLISHED 미제출 과제만 세고 가장 가까운 마감 텍스트를 계산한다', () => {
    // Given
    const now = '2026-10-15T01:00:00.000Z';
    const assignments: readonly AssignmentSummaryDto[] = [
      {
        assignmentId: 'a-submitted',
        targetId: 't-1',
        title: '이미 제출한 과제',
        status: 'PUBLISHED',
        dueAt: '2026-10-16T14:59:00.000Z',
        publishedAt: '2026-10-01T00:00:00.000Z',
        submission: { submissionId: 's-1', submittedAt: '2026-10-10T00:00:00.000Z' },
      },
      {
        assignmentId: 'a-closed',
        targetId: 't-2',
        title: '마감 상태 과제',
        status: 'CLOSED',
        dueAt: '2026-10-17T14:59:00.000Z',
        publishedAt: '2026-10-01T00:00:00.000Z',
        submission: null,
      },
      {
        assignmentId: 'a-later',
        targetId: 't-3',
        title: '3주차 에세이',
        status: 'PUBLISHED',
        dueAt: '2026-10-20T14:59:00.000Z',
        publishedAt: '2026-10-01T00:00:00.000Z',
        submission: null,
      },
      {
        assignmentId: 'a-nearest',
        targetId: 't-4',
        title: '2주차 독서 보고서',
        status: 'PUBLISHED',
        dueAt: '2026-10-17T14:59:00.000Z',
        publishedAt: '2026-10-01T00:00:00.000Z',
        submission: null,
      },
    ];
    // When
    const summary = summarizeHomeAssignments(assignments, now);
    // Then
    expect(summary.pendingCount).toBe(2);
    expect(summary.pendingCountText).toBe('미제출 과제 2건');
    expect(summary.nearestTitleText).toBe('다음 과제: 2주차 독서 보고서');
    expect(summary.nearestDueBadge).toBe('D-2');
    expect(summary.nearestDueText).toContain('2026.10.17 23:59');
  });

  test('역할 제한·403·503 DISABLED 분기와 사용자별 쿼리 키 격리를 수행한다', () => {
    // Given
    const now = '2026-10-15T00:00:00.000Z';
    // When / Then
    expect(resolveHomeAssignmentsState({ role: 'FACULTY', now })).toEqual({
      kind: 'unavailable',
      reason: 'role',
      message: homeStrings.assignments.roleUnavailable,
    });
    expect(
      resolveHomeAssignmentsState({
        role: 'MEMBER',
        error: new ApiError({ status: 403, code: 'FORBIDDEN' }),
        now,
      }),
    ).toEqual({
      kind: 'unavailable',
      reason: 'role',
      message: homeStrings.assignments.roleUnavailable,
    });
    expect(
      resolveHomeAssignmentsState({
        role: 'MEMBER',
        error: new ApiError({ status: 503, code: 'DISABLED' }),
        now,
      }),
    ).toEqual({
      kind: 'unavailable',
      reason: 'disabled',
      message: homeStrings.assignments.academicDisabled,
    });
    expect(homeQueryKeys.schedule('user-a', 2026, 10)).not.toEqual(
      homeQueryKeys.schedule('user-b', 2026, 10),
    );
    expect(homeQueryKeys.notices('user-a')).not.toEqual(homeQueryKeys.notices('user-b'));
    expect(homeQueryKeys.assignments('user-a')).not.toEqual(homeQueryKeys.assignments('user-b'));
  });
});
