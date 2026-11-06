/**
 * 역할: 월별 일정 API(`GET /api/v1/schedule`) 조회 키·쿼리 옵션 및 인접 월 프리페치 헬퍼 정의
 * 사용 위치: src/features/schedule/components/schedule-screen.tsx 및 일정 쿼리 격리 테스트
 * 주요 기능:
 * - 사용자 식별자(userId)와 연·월(year, month)을 포함한 격리된 쿼리 키 생성
 * - guardScheduleMonth로 허용 범위(1900.01~2100.12)를 선행 검증하고 AbortSignal을 HTTP GET까지 전달
 * - 현재 월 조회가 성공한 뒤에만 인접 월(이전/다음 달)을 조용히 프리페치해 오류 처리를 방해하지 않음
 */
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/errors';
import { getApiClient } from '../../auth/runtime';
import { guardScheduleMonth } from '../../lib/date-kst';
import { apiQueryOptions } from '../../query/client';
import { getAdjacentScheduleMonths } from './schedule-model';
import type { ScheduleMonth, ScheduleResponseDto } from './schedule-model';

export interface ScheduleApiPort {
  GET(
    path: '/api/v1/schedule',
    init: {
      readonly params: {
        readonly query: {
          readonly year: number;
          readonly month: number;
        };
      };
      readonly signal: AbortSignal;
    },
  ): Promise<{ readonly data?: ScheduleResponseDto | undefined }>;
}

/** 계정 간 캐시 오염을 막기 위해 userId, year, month를 모두 포함하는 쿼리 키를 생성합니다. */
export function scheduleMonthQueryKey(
  userId: string | null | undefined,
  month: ScheduleMonth,
) {
  const valid = guardScheduleMonth(month.year, month.month);
  return ['schedule', userId ?? 'anonymous', valid.year, valid.month] as const;
}

/** 지정한 연·월의 공개 일정을 서버에서 조회합니다. */
export async function fetchScheduleMonth(
  month: ScheduleMonth,
  signal: AbortSignal,
  client: ScheduleApiPort = getApiClient(),
): Promise<ScheduleResponseDto> {
  const valid = guardScheduleMonth(month.year, month.month);
  const { data } = await client.GET('/api/v1/schedule', {
    params: { query: { year: valid.year, month: valid.month } },
    signal,
  });
  if (!data) {
    throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
  }
  return data;
}

/** TanStack Query의 useQuery 및 prefetchQuery에 전달할 표준 쿼리 옵션을 생성합니다. */
export function scheduleMonthQueryOptions(
  userId: string | null | undefined,
  month: ScheduleMonth,
  client?: ScheduleApiPort | undefined,
) {
  const valid = guardScheduleMonth(month.year, month.month);
  return apiQueryOptions(scheduleMonthQueryKey(userId, valid), (signal) =>
    fetchScheduleMonth(valid, signal, client),
  );
}

/**
 * 이미 캐시되거나 신선한 데이터가 없는 인접 월(이전 달, 다음 달)만 백그라운드로 프리페치합니다.
 * 프리페치 실패가 현재 화면의 오류 상태를 오염시키지 않도록 retry: false로 조용히 무시합니다.
 */
export async function prefetchAdjacentScheduleMonths(
  queryClient: QueryClient,
  userId: string | null | undefined,
  currentMonth: ScheduleMonth,
  client?: ScheduleApiPort | undefined,
): Promise<void> {
  const targets = getAdjacentScheduleMonths(currentMonth);
  await Promise.all(
    targets.map(async (target) => {
      const baseOptions = scheduleMonthQueryOptions(userId, target, client);
      const state = queryClient.getQueryState(baseOptions.queryKey);
      if (state?.status === 'pending' || state?.data !== undefined) {
        return;
      }
      await queryClient
        .prefetchQuery(baseOptions)
        .catch(() => undefined);
    }),
  );
}
