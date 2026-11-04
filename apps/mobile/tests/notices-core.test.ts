/**
 * 역할: 공지 순수 로직(notices-core.ts) 단위 테스트 — 검색 정규화(<=100자), 쿼리 키, 페이지 병합/중복 제거, 404 오류 매핑
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 검색어 앞뒤 공백 제거 및 100자 초과 입력 방어 검증
 * - page.hasNextPage 기반 다음 페이지 번호 계산 및 페이지 간 중복 공지 ID 제거 검증
 * - 상세 조회 404("삭제되었거나 없는 공지입니다.") 및 네트워크/서버 오류 한국어 매핑 검증
 */
import { ApiError } from '../src/api/errors';
import {
  buildNoticeDetailQueryKey,
  buildNoticeListQueryKey,
  buildNoticeListQueryParams,
  clampNoticeSearchInput,
  fetchNoticeDetail,
  fetchNoticeListPage,
  getNextNoticePageParam,
  MAX_NOTICE_QUERY_LENGTH,
  mergeNoticePages,
  normalizeNoticeId,
  normalizeNoticeSearchQuery,
  NOTICE_PAGE_SIZE,
  toNoticeErrorMessage,
  type NoticeApiClientPort,
  type NoticeListResponse,
  type NoticeSummary,
} from '../src/features/notices';
import { ko } from '../src/i18n/ko';

function makeNoticeSummary(overrides: Partial<NoticeSummary> = {}): NoticeSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: '2026학년도 2학기 학사 안내',
    excerpt: '학사 일정 및 필독 사항 안내입니다.',
    pinned: false,
    viewCount: 15,
    createdAt: '2026-10-31T01:00:00.000Z',
    updatedAt: '2026-10-31T01:00:00.000Z',
    ...overrides,
  };
}

function makePageResponse(
  notices: NoticeSummary[],
  page: number,
  hasNextPage: boolean,
): NoticeListResponse {
  return {
    notices,
    page: {
      page,
      pageSize: NOTICE_PAGE_SIZE,
      totalCount: 25,
      totalPages: 3,
      hasNextPage,
      hasPreviousPage: page > 1,
    },
  };
}

describe('공지 검색어 정규화 및 쿼리 파라미터 가드', () => {
  test('검색 입력과 쿼리는 앞뒤 공백을 제거하고 100자 이하로 제한한다', () => {
    // Given
    const longInput = `   ${'가'.repeat(130)}   `;

    // When
    const clampedInput = clampNoticeSearchInput(longInput);
    const normalizedQuery = normalizeNoticeSearchQuery(longInput);

    // Then
    expect(clampedInput).toHaveLength(MAX_NOTICE_QUERY_LENGTH);
    expect(normalizedQuery).toHaveLength(MAX_NOTICE_QUERY_LENGTH);
    expect(normalizedQuery.startsWith('가')).toBe(true);
  });

  test('buildNoticeListQueryParams는 빈 검색어일 때 q 키를 생략하고 검색어가 있을 때만 100자 이하 q를 포함한다', () => {
    // Given / When
    const withoutQuery = buildNoticeListQueryParams(1, '   ');
    const withQuery = buildNoticeListQueryParams(2, '  장학금 안내  ');
    const withOverlongQuery = buildNoticeListQueryParams(1, '나'.repeat(120));

    // Then
    expect(withoutQuery).toEqual({ page: 1, pageSize: NOTICE_PAGE_SIZE });
    expect('q' in withoutQuery).toBe(false);
    expect(Object.keys(withoutQuery)).toEqual(['page', 'pageSize']);

    expect(withQuery).toEqual({ page: 2, pageSize: NOTICE_PAGE_SIZE, q: '장학금 안내' });
    expect(withOverlongQuery.q).toHaveLength(MAX_NOTICE_QUERY_LENGTH);
  });

  test('쿼리 키는 사용자 ID와 정규화된 검색어를 모두 포함한다', () => {
    // Given / When
    const listKeyA = buildNoticeListQueryKey('user-1', '  수강신청 ');
    const listKeyB = buildNoticeListQueryKey('user-1', '모집');
    const detailKey = buildNoticeDetailQueryKey('user-1', ' notice-99 ');

    // Then
    expect(listKeyA).toEqual(['notices', 'list', 'user-1', '수강신청']);
    expect(listKeyB).toEqual(['notices', 'list', 'user-1', '모집']);
    expect(listKeyA).not.toEqual(listKeyB);
    expect(detailKey).toEqual(['notices', 'detail', 'user-1', 'notice-99']);
  });
});

describe('공지 페이지네이션 병합 및 중복 제거', () => {
  test('getNextNoticePageParam은 page.hasNextPage가 true일 때만 page + 1을 반환한다', () => {
    // Given
    const page1 = makePageResponse([], 1, true);
    const page2 = makePageResponse([], 2, false);

    // When / Then
    expect(getNextNoticePageParam(page1)).toBe(2);
    expect(getNextNoticePageParam(page2)).toBeUndefined();
  });

  test('mergeNoticePages는 여러 페이지를 병합하면서 중복된 공지 ID를 첫 등장 순서로 유지하고 제거한다', () => {
    // Given
    const first = makeNoticeSummary({ id: 'n-1', title: '고정 공지', pinned: true });
    const second = makeNoticeSummary({ id: 'n-2', title: '일반 공지 1' });
    const duplicateSecond = makeNoticeSummary({ id: 'n-2', title: '일반 공지 1 (중복)' });
    const third = makeNoticeSummary({ id: 'n-3', title: '일반 공지 2' });

    const pages = [
      makePageResponse([first, second], 1, true),
      makePageResponse([duplicateSecond, third], 2, false),
    ];

    // When
    const merged = mergeNoticePages(pages);

    // Then
    expect(merged.map((item) => item.id)).toEqual(['n-1', 'n-2', 'n-3']);
    expect(merged[1]?.title).toBe('일반 공지 1');
  });
});

describe('공지 오류 한국어 매핑 및 API 호출 포트', () => {
  test('상세 조회 404는 "삭제되었거나 없는 공지입니다."로 매핑하고 기타 오류는 toKoreanMessage를 따른다', () => {
    // Given
    const notFoundErr = new ApiError({ status: 404, code: 'NOT_FOUND' });
    const networkErr = new ApiError({ status: 0, code: 'NETWORK' });
    const rateLimitErr = new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 15 });

    // When / Then
    expect(toNoticeErrorMessage(notFoundErr, 'detail')).toBe('삭제되었거나 없는 공지입니다.');
    expect(toNoticeErrorMessage(networkErr, 'detail')).toBe(ko.errors.NETWORK);
    expect(toNoticeErrorMessage(rateLimitErr, 'list')).toBe(ko.waitSeconds(15));
    expect(normalizeNoticeId(['  id-1  ', 'id-2'])).toBe('id-1');
  });

  test('fetchNoticeListPage와 fetchNoticeDetail은 타입 안전 클라이언트 GET에 정확한 파라미터와 signal을 전달한다', async () => {
    // Given
    const controller = new AbortController();
    const expectedList = makePageResponse([makeNoticeSummary()], 1, false);
    const mockClient: NoticeApiClientPort = {
      GET: jest.fn(async (path: string) => {
        if (path === '/api/v1/notices') {
          return { data: expectedList };
        }
        return {
          data: {
            notice: {
              id: 'n-1',
              title: '상세 공지',
              content: '# 본문',
              viewCount: 30,
              createdAt: '2026-10-31T00:00:00.000Z',
            },
          },
        };
      }) as NoticeApiClientPort['GET'],
    };

    // When
    const listResult = await fetchNoticeListPage(mockClient, {
      page: 1,
      rawQuery: '  학사  ',
      signal: controller.signal,
    });
    const detailResult = await fetchNoticeDetail(mockClient, {
      id: ' n-1 ',
      signal: controller.signal,
    });

    // Then
    expect(listResult).toEqual(expectedList);
    expect(detailResult.title).toBe('상세 공지');
    expect(mockClient.GET).toHaveBeenNthCalledWith(1, '/api/v1/notices', {
      params: { query: { page: 1, pageSize: 10, q: '학사' } },
      signal: controller.signal,
    });
    expect(mockClient.GET).toHaveBeenNthCalledWith(2, '/api/v1/notices/{id}', {
      params: { path: { id: 'n-1' } },
      signal: controller.signal,
    });
  });
});
