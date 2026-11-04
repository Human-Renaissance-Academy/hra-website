/**
 * UTC 시각과 한국 달력의 경계를 담당합니다. Intl이나 기기 시간대에 의존하지 않습니다.
 * 일정의 날짜·시간은 이미 한국 벽시계 값이므로 UTC로 다시 변환하지 않습니다.
 */
import { ApiError } from '../api/errors';
import { ko } from '../i18n/ko';

export type Clock = () => number;
export type Instant = string | number | Date;
const OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function instantMs(value: Instant): number {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : value;
  if (!Number.isFinite(ms)) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  return ms;
}

// 반환 객체는 벽시계 표시용이며 실제 Instant로 저장하거나 서버에 보내지 않습니다.
export function kstNow(clock: Clock = Date.now) {
  const date = new Date(instantMs(clock()) + OFFSET_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), weekday: date.getUTCDay() };
}
const pad = (value: number) => String(value).padStart(2, '0');
export function formatKstDate(value: Instant): string {
  const k = kstNow(() => instantMs(value));
  return `${k.year}.${pad(k.month)}.${pad(k.day)}`;
}
export function formatKstDateTime(value: Instant): string {
  const k = kstNow(() => instantMs(value));
  return `${formatKstDate(value)} ${pad(k.hour)}:${pad(k.minute)}`;
}
export function kstMonthOf(now: Instant) {
  const { year, month } = kstNow(() => instantMs(now));
  return { year, month };
}
export function isPastDue(dueIso: string, now: Instant): boolean { return instantMs(dueIso) <= instantMs(now); }
export function guardScheduleMonth(year: number, month: number): { year: number; month: number } {
  if (!Number.isInteger(year) || year < 1900 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  }
  return { year, month };
}
export function koreanWeekday(calendarDate: string): string {
  const ms = Date.parse(`${calendarDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate) || !Number.isFinite(ms)
    || new Date(ms).toISOString().slice(0, 10) !== calendarDate) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  return ko.dates.weekdays[new Date(ms).getUTCDay()] ?? '';
}
export type ScheduleWallEvent = { readonly calendarDate: string; readonly startTime: string };
export function groupScheduleEventsByDate<T extends ScheduleWallEvent>(events: readonly T[]) {
  const grouped = new Map<string, T[]>();
  for (const event of [...events].sort((a, b) => wallKey(a).localeCompare(wallKey(b)))) {
    const group = grouped.get(event.calendarDate) ?? [];
    group.push(event);
    grouped.set(event.calendarDate, group);
  }
  return [...grouped].map(([calendarDate, items]) => ({ calendarDate, events: items }));
}
const wallKey = (event: ScheduleWallEvent) => `${event.calendarDate}T${event.startTime.padEnd(8, ':00')}`;
export function upcomingScheduleEvents<T extends ScheduleWallEvent>(events: readonly T[], now: Instant, limit = 3): T[] {
  if (!Number.isInteger(limit) || limit < 0) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  const k = kstNow(() => instantMs(now));
  const key = `${k.year}-${pad(k.month)}-${pad(k.day)}T${pad(k.hour)}:${pad(k.minute)}:${pad(k.second)}`;
  return [...events].filter((event) => wallKey(event) >= key).sort((a, b) => wallKey(a).localeCompare(wallKey(b))).slice(0, limit);
}
