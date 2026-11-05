/**
 * 역할: 내 과제 목록·상세 조회 API 어댑터 및 사용자별 격리된 React Query 키 정의
 * 사용 위치: src/features/assignments 하위 화면 컴포넌트 및 테스트
 * 주요 기능:
 * - GET /api/v1/assignments (page, pageSize=20) 및 GET /api/v1/assignments/{id} 호출 래퍼 제공
 * - 계정 전환 시 캐시 오염을 방지하도록 userId를 포함한 쿼리 키 제공
 * - 제출 완료 시 목록/상세 쿼리와 홈 요약 쿼리를 함께 무효화하는 헬퍼 제공
 */
import type { QueryClient } from '@tanstack/react-query';
import type { createApiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { getApiClient } from '../../auth/runtime';
import type {
  AssignmentDetailDto,
  AssignmentListResponseDto,
} from './assignment-view-model';

export const ASSIGNMENTS_PAGE_SIZE = 20;

export const assignmentQueryKeys = {
  all: (userId: string | null | undefined) =>
    ['assignments', userId ?? 'anonymous'] as const,
  list: (userId: string | null | undefined, pageSize = ASSIGNMENTS_PAGE_SIZE) =>
    ['assignments', userId ?? 'anonymous', 'list', { pageSize }] as const,
  detail: (userId: string | null | undefined, assignmentId: string) =>
    ['assignments', userId ?? 'anonymous', 'detail', assignmentId] as const,
} as const;

function requireData<T>(data: T | undefined): T {
  if (data === undefined) {
    throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
  }
  return data;
}

/** 본인 과제 목록 한 페이지를 조회합니다. */
export async function fetchMyAssignmentsPage(
  params: {
    readonly page: number;
    readonly pageSize?: number | undefined;
    readonly signal?: AbortSignal | undefined;
  },
  client: ReturnType<typeof createApiClient> = getApiClient(),
): Promise<AssignmentListResponseDto> {
  const { data } = await client.GET('/api/v1/assignments', {
    params: {
      query: {
        page: params.page,
        pageSize: params.pageSize ?? ASSIGNMENTS_PAGE_SIZE,
      },
    },
    ...(params.signal ? { signal: params.signal } : {}),
  });
  return requireData(data);
}

/** 본인 과제 상세 한 건을 조회합니다. */
export async function fetchMyAssignmentDetail(
  assignmentId: string,
  signal?: AbortSignal | undefined,
  client: ReturnType<typeof createApiClient> = getApiClient(),
): Promise<AssignmentDetailDto> {
  const { data } = await client.GET('/api/v1/assignments/{id}', {
    params: { path: { id: assignmentId } },
    ...(signal ? { signal } : {}),
  });
  return requireData(data).assignment;
}

/** 과제 제출이 완료되거나 상태가 바뀌었을 때 관련 과제 목록·상세·홈 요약 쿼리를 무효화합니다. */
export async function invalidateAssignmentQueries(
  queryClient: QueryClient,
  userId: string | null | undefined,
  assignmentId?: string | undefined,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: assignmentQueryKeys.all(userId),
    }),
    queryClient.invalidateQueries({
      queryKey: ['home', 'assignments'],
    }),
    ...(assignmentId
      ? [
          queryClient.invalidateQueries({
            queryKey: assignmentQueryKeys.detail(userId, assignmentId),
          }),
        ]
      : []),
  ]);
}
