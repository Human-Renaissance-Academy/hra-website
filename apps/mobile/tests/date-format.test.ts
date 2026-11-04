/** 고정 UTC+9 경계와 한국 벽시계 일정을 표 기반으로 검증합니다. */
import { formatKstDate, formatKstDateTime, guardScheduleMonth, kstMonthOf, kstNow, koreanWeekday,
  upcomingScheduleEvents, groupScheduleEventsByDate, isPastDue } from '../src/lib/date-kst';
import { formatDueText, formatFileSize } from '../src/lib/format';

test.each([
  ['2026-12-31T14:59:59Z', '2026.12.31 23:59'],
  ['2026-12-31T15:00:00Z', '2027.01.01 00:00'],
  ['2024-02-28T15:00:00Z', '2024.02.29 00:00'],
  ['2025-02-28T15:00:00Z', '2025.03.01 00:00'],
  ['2000-02-29T15:00:00Z', '2000.03.01 00:00'],
])('UTC %s를 한국 날짜 %s로 표시한다', (input, expected) => {
  // Given / When / Then
  expect(formatKstDateTime(input)).toBe(expected);
  expect(formatKstDate(input)).toBe(expected.slice(0, 10));
});
test.each([[1900, 1], [2100, 12], [2024, 2]])('유효한 일정 월 %i/%i를 허용한다', (year, month) => {
  // Given / When / Then
  expect(guardScheduleMonth(year, month)).toEqual({ year, month });
});
test.each([[1899, 12], [2101, 1], [2026, 0], [2026, 13], [2026.5, 1], [2026, 1.5]])('일정 월 %i/%i 경계를 거부한다', (year, month) => {
  // Given / When / Then
  expect(() => guardScheduleMonth(year, month)).toThrow('INVALID_INPUT');
});
test.each([['2024-02-29', '목'], ['2027-01-01', '금'], ['1900-03-01', '목']])('달력 %s의 요일을 계산한다', (date, weekday) => {
  // Given / When / Then
  expect(koreanWeekday(date)).toBe(weekday);
});
test.each(['2025-02-29', '2026-13-01', 'invalid'])('잘못된 달력 %s를 거부한다', (date) => {
  // Given / When / Then
  expect(() => koreanWeekday(date)).toThrow('INVALID_INPUT');
});
test('주입한 시계로 연도 전환과 한국 월을 계산한다', () => {
  // Given
  const now = Date.parse('2026-12-31T15:00:00Z');
  // When / Then
  expect(kstNow(() => now)).toMatchObject({ year: 2027, month: 1, day: 1, hour: 0 });
  expect(kstMonthOf(now)).toEqual({ year: 2027, month: 1 });
});
test('일정은 UTC 변환 없이 한국 벽시계로 필터·정렬·그룹화한다', () => {
  // Given
  const events = [{ calendarDate: '2027-01-02', startTime: '10:00' },
    { calendarDate: '2027-01-01', startTime: '00:01' }, { calendarDate: '2026-12-31', startTime: '23:59' }];
  // When
  const upcoming = upcomingScheduleEvents(events, '2026-12-31T15:00:00Z', 1);
  // Then
  expect(upcoming).toEqual([events[1]]);
  expect(groupScheduleEventsByDate(events).map((group) => group.calendarDate)).toEqual(['2026-12-31', '2027-01-01', '2027-01-02']);
});
test.each([[0, '0 B'], [1023, '1023 B'], [1024, '1.0 KiB'], [52428800, '50.0 MiB']])('파일 크기 %i를 표시한다', (bytes, expected) => {
  // Given / When / Then
  expect(formatFileSize(bytes)).toBe(expected);
});
test.each([
  ['2027-01-03T15:00:00Z', 'D-3'], ['2027-01-01T14:59:59Z', '오늘 마감'],
  ['2026-12-31T15:00:00Z', '마감됨'], ['2026-12-31T14:59:59Z', '마감됨'],
])('마감 %s를 한국 날짜 기준으로 표시한다', (due, expected) => {
  // Given / When / Then
  expect(formatDueText(due, '2026-12-31T15:00:00Z')).toBe(expected);
  expect(isPastDue(due, '2026-12-31T15:00:00Z')).toBe(expected === '마감됨');
});
