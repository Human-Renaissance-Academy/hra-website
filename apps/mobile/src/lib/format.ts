/** 날짜 마감과 파일 크기의 표시 규칙입니다. 현재 시각은 호출자가 주입합니다. */
import { ko } from '../i18n/ko';
import { ApiError } from '../api/errors';
import { DAY_MS, instantMs, isPastDue } from './date-kst';
import type { Instant } from './date-kst';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
export function formatDueText(dueIso: string, now: Instant): string {
  if (isPastDue(dueIso, now)) return ko.dates.closed;
  const offset = 9 * 60 * 60 * 1000;
  const days = Math.floor((instantMs(dueIso) + offset) / DAY_MS) - Math.floor((instantMs(now) + offset) / DAY_MS);
  return days === 0 ? ko.dates.dueToday : `D-${days}`;
}
