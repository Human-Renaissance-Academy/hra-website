/**
 * 서버 상태 정책입니다. Query는 GET 전용이며 네트워크/5xx만 최대 두 번 지수 백오프로 재시도합니다.
 * 변이는 재시도하지 않고 캐시를 디스크에 저장하지 않습니다. 기본 신선도 30초, 미사용 보존 5분입니다.
 */
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { ApiError } from '../api/errors';

export function retryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && (error.code === 'NETWORK' || error.status >= 500);
}
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, retry: retryQuery, retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000) },
    mutations: { retry: false },
  } });
}

// 신호를 반드시 HTTP GET까지 전달하도록 화면용 옵션의 형태를 고정합니다.
export function apiQueryOptions<T>(key: readonly unknown[], query: (signal: AbortSignal) => Promise<T>) {
  return queryOptions({ queryKey: key, queryFn: ({ signal }) => query(signal) });
}
