/**
 * 역할: 일정(Schedule) 순수 모델·쿼리 헬퍼 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 월 이동(이전 달, 다음 달, 연도 전환) 및 허용 경계(1900.01~2100.12) 가드 검증
 * - 고정 시계(fixed clock)를 주입한 KST 자정 직전/직후 및 연말·연초 전환 시 오늘(today) 판별 검증
 * - 날짜 그룹화, 시작 시각 정렬, 벽시계 문자열 무변환 표시, 세부 세션 order 정렬 검증
 * - 사용자별 쿼리 키 격리 및 인접 월 프리페치 동작 검증
 */
import { createQueryClient } from '../src/query/client';
import {
  buildScheduleDateGroups,
  canNavigateNextMonth,
  canNavigatePreviousMonth,
  fetchScheduleMonth,
  findTodayGroupIndex,
  formatDateGroupHeader,
  formatWallTimeRange,
  getAdjacentScheduleMonths,
  getEventTypeLabel,
  getInitialScheduleMonth,
  getSessionCategoryLabel,
  getTodayKstCalendarDate,
  prefetchAdjacentScheduleMonths,
  scheduleMonthQueryKey,
  sortScheduleSessions,
  stepScheduleMonth,
} from '../src/features/schedule';
import type { ScheduleApiPort, ScheduleEventDto, ScheduleSessionDto } from '../src/features/schedule';

function makeEvent(overrides: Partial<ScheduleEventDto> = {}): ScheduleEventDto {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    calendarDate: '2026-10-31',
    startTime: '10:00',
    endTime: '13:00',
    eventType: 'CLASS',
    title: '정기 수업',
    weekNumber: 5,
    description: '수업 설명',
    cohort: { id: '00000000-0000-4000-8000-000000000099', name: '15기' },
    sessions: [],
    ...overrides,
  };
}

describe('월 이동 및 경계 가드 (1900.01 ~ 2100.12)', () => {
  test('일반 월과 연도 경계(1월<->12월)에서 이전 달·다음 달을 정확히 계산한다', () => {
    // Given / When / Then
    expect(stepScheduleMonth({ year: 2026, month: 10 }, -1)).toEqual({ year: 2026, month: 9 });
    expect(stepScheduleMonth({ year: 2026, month: 10 }, 1)).toEqual({ year: 2026, month: 11 });
    expect(stepScheduleMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepScheduleMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  test('하한(1900년 1월)과 상한(2100년 12월)에서 이동 가능 여부를 차단하고 범위를 넘지 않는다', () => {
    // Given
    const minBound = { year: 1900, month: 1 };
    const maxBound = { year: 2100, month: 12 };

    // When / Then
    expect(canNavigatePreviousMonth(minBound)).toBe(false);
    expect(canNavigateNextMonth(minBound)).toBe(true);
    expect(stepScheduleMonth(minBound, -1)).toEqual(minBound);
    expect(getAdjacentScheduleMonths(minBound)).toEqual([{ year: 1900, month: 2 }]);

    expect(canNavigateNextMonth(maxBound)).toBe(false);
    expect(canNavigatePreviousMonth(maxBound)).toBe(true);
    expect(stepScheduleMonth(maxBound, 1)).toEqual(maxBound);
    expect(getAdjacentScheduleMonths(maxBound)).toEqual([{ year: 2100, month: 11 }]);
  });

  test('유효 범위를 벗어난 연·월 입력은 INVALID_INPUT 오류로 거부한다', () => {
    // Given / When / Then
    expect(() => stepScheduleMonth({ year: 1899, month: 12 }, 1)).toThrow('INVALID_INPUT');
    expect(() => stepScheduleMonth({ year: 2101, month: 1 }, -1)).toThrow('INVALID_INPUT');
    expect(() => scheduleMonthQueryKey('user-1', { year: 2026, month: 13 })).toThrow('INVALID_INPUT');
  });
});

describe('고정 시계 기반 KST 오늘 날짜 및 월/연도 전환 경계', () => {
  test.each([
    // KST 2026-10-31 23:59:59 (UTC 14:59:59) -> 아직 10월 31일
    ['2026-10-31T14:59:59Z', { year: 2026, month: 10 }, '2026-10-31'],
    // KST 2026-11-01 00:00:00 (UTC 15:00:00) -> 11월 1일로 월 전환
    ['2026-10-31T15:00:00Z', { year: 2026, month: 11 }, '2026-11-01'],
    // KST 2026-12-31 23:59:59 (UTC 14:59:59) -> 아직 2026년 12월 31일
    ['2026-12-31T14:59:59Z', { year: 2026, month: 12 }, '2026-12-31'],
    // KST 2027-01-01 00:00:00 (UTC 15:00:00) -> 2027년 1월 1일로 연도 전환
    ['2026-12-31T15:00:00Z', { year: 2027, month: 1 }, '2027-01-01'],
  ])(
    'UTC %s 시점에서 초기 월은 %o이고 오늘 KST 날짜는 %s이다',
    (utcIso, expectedMonth, expectedToday) => {
      // Given
      const clock = () => Date.parse(utcIso);

      // When
      const month = getInitialScheduleMonth(clock);
      const today = getTodayKstCalendarDate(clock);

      // Then
      expect(month).toEqual(expectedMonth);
      expect(today).toBe(expectedToday);
    },
  );
});

describe('날짜별 그룹화, 오늘 마커, 벽시계 시간 및 세션 정렬', () => {
  test('날짜 그룹을 오름차순 정렬하고 한국어 요일 헤더와 오늘 마커 인덱스를 정확히 부여한다', () => {
    // Given
    const events: ScheduleEventDto[] = [
      makeEvent({ id: 'e-3', calendarDate: '2026-11-02', startTime: '19:00', title: '저녁 특강' }),
      makeEvent({ id: 'e-2', calendarDate: '2026-10-31', startTime: '14:00', title: '오후 행사' }),
      makeEvent({ id: 'e-1', calendarDate: '2026-10-31', startTime: '09:30', title: '오전 수업' }),
    ];

    // When
    const groups = buildScheduleDateGroups(events, '2026-10-31');

    // Then
    expect(groups).toHaveLength(2);
    expect(groups[0]?.calendarDate).toBe('2026-10-31');
    expect(groups[0]?.headerLabel).toBe('10월 31일 (토)');
    expect(groups[0]?.isToday).toBe(true);
    expect(groups[0]?.accessibilityLabel).toBe('10월 31일 (토), 오늘');
    expect(groups[0]?.events.map((e) => e.id)).toEqual(['e-1', 'e-2']);

    expect(groups[1]?.calendarDate).toBe('2026-11-02');
    expect(groups[1]?.headerLabel).toBe('11월 2일 (월)');
    expect(groups[1]?.isToday).toBe(false);
    expect(findTodayGroupIndex(groups)).toBe(0);
    expect(findTodayGroupIndex(buildScheduleDateGroups(events, '2026-10-15'))).toBe(-1);
  });

  test('벽시계 시간 문자열을 변환 없이 표시하고 세부 세션을 order 오름차순으로 정렬한다', () => {
    // Given
    const sessions: ScheduleSessionDto[] = [
      {
        category: 'SPEECH',
        content: '3분 스피치',
        reportCategory: null,
        subTitle: '스피치 실습',
        subDescription: null,
        faculty: null,
        order: 3,
      },
      {
        category: 'CLASSICS',
        content: '플라톤 국가',
        reportCategory: '독서보고서',
        subTitle: '정의란 무엇인가',
        subDescription: '1권~2권 강독',
        faculty: { id: 'f-1', name: '김교수' },
        order: 1,
      },
      {
        category: 'CASE_STUDY',
        content: null,
        reportCategory: null,
        subTitle: null,
        subDescription: null,
        faculty: null,
        order: 2,
      },
    ];

    // When
    const sorted = sortScheduleSessions(sessions);

    // Then
    expect(sorted.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(formatWallTimeRange('09:30', '12:45')).toBe('09:30 – 12:45');
    expect(formatWallTimeRange('18:00', null)).toBe('18:00');
    expect(formatDateGroupHeader('2026-10-31')).toBe('10월 31일 (토)');
    expect(getEventTypeLabel('CLASS')).toBe('수업');
    expect(getEventTypeLabel('EVENT')).toBe('행사');
    expect(getSessionCategoryLabel('CLASSICS')).toBe('고전');
    expect(getSessionCategoryLabel('ENGLISH')).toBe('영어');
    expect(getSessionCategoryLabel('SPEECH')).toBe('스피치');
    expect(getSessionCategoryLabel('SPECIAL_LECTURE')).toBe('특강');
    expect(getSessionCategoryLabel('CASE_STUDY')).toBe('케이스 스터디');
  });
});

describe('쿼리 키 사용자 격리 및 인접 월 프리페치', () => {
  test('서로 다른 사용자의 쿼리 키는 분리되며 인접 월 프리페치 실패가 예외를 전파하지 않는다', async () => {
    // Given
    const queryClient = createQueryClient();
    const keyUserA = scheduleMonthQueryKey('user-a', { year: 2026, month: 10 });
    const keyUserB = scheduleMonthQueryKey('user-b', { year: 2026, month: 10 });
    expect(keyUserA).not.toEqual(keyUserB);

    const calls: { year: number; month: number }[] = [];
    const fakeClient: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => {
        calls.push(init.params.query);
        if (init.params.query.month === 11) {
          throw new Error('network error on prefetch');
        }
        return {
          data: {
            year: init.params.query.year,
            month: init.params.query.month,
            timeZone: 'Asia/Seoul' as const,
            events: [],
          },
        };
      }),
    };

    // When
    await prefetchAdjacentScheduleMonths(
      queryClient,
      'user-a',
      { year: 2026, month: 10 },
      fakeClient,
    );

    // Then: 9월과 11월을 프리페치 시도하고 9월 데이터는 user-a 키에만 저장되며 user-b 캐시는 비어 있음
    expect(calls).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 11 },
    ]);
    expect(
      queryClient.getQueryData(scheduleMonthQueryKey('user-a', { year: 2026, month: 9 })),
    ).toBeDefined();
    expect(
      queryClient.getQueryData(scheduleMonthQueryKey('user-b', { year: 2026, month: 9 })),
    ).toBeUndefined();
    queryClient.clear();
  });

  test('응답 data가 비어 있으면 UNAVAILABLE ApiError를 발생시킨다', async () => {
    // Given
    const emptyClient: ScheduleApiPort = {
      GET: jest.fn(async () => ({ data: undefined })),
    };

    // When / Then
    await expect(
      fetchScheduleMonth({ year: 2026, month: 10 }, new AbortController().signal, emptyClient),
    ).rejects.toMatchObject({ status: 503, code: 'UNAVAILABLE' });
  });
});
