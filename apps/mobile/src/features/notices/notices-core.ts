/**
 * 역할: 공지 목록·상세의 검색어 정규화, 쿼리 파라미터 생성, 페이지 병합/중복 제거, 404 오류 매핑을 담당하는 순수 모듈
 * 사용 위치: src/features/notices/use-notices.ts, 화면 컴포넌트 및 단위 테스트
 * 주요 기능:
 * - 검색어 앞뒤 공백 제거 및 최대 100자 제한(API 400 방지)
 * - 미등록·중복 쿼리 키 없이 { page, pageSize, q? } 파라미터 생성
 * - 다중 페이지 응답 병합 시 notice.id 기준 안정적 중복 제거 및 hasNextPage 기반 다음 페이지 계산
 * - 상세 조회 404(NOT_FOUND)를 "삭제되었거나 없는 공지입니다."로 변환하고 나머지는 toKoreanMessage 위임
 */
import { ApiError, toKoreanMessage } from '../../api/errors';
import type { components } from '../../api/schema';
import { noticesStrings } from './strings';

export type NoticeSummary = components['schemas']['NoticeSummary'];
export type NoticeListResponse = components['schemas']['NoticeListResponse'];
export type NoticeDetail = components['schemas']['NoticeDetail'];
export type NoticeDetailResponse = components['schemas']['NoticeDetailResponse'];
export type PageMeta = components['schemas']['PageMeta'];

/** 공지 목록 기본 페이지 크기 (요구사항: pageSize=10) */
export const NOTICE_PAGE_SIZE = 10 as const;

/** 공지 검색어 최대 허용 글자 수 (요구사항: <= 100 chars, 초과 시 API 400) */
export const MAX_NOTICE_QUERY_LENGTH = 100 as const;

/** 공지 검색 입력 디바운스 지연 시간 (요구사항: 400 ms) */
export const NOTICE_SEARCH_DEBOUNCE_MS = 400 as const;

export interface NoticeListQueryParams {
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
}

export interface NoticeApiClientPort {
  GET(
    path: '/api/v1/notices',
    init: {
      readonly params: { readonly query: NoticeListQueryParams };
      readonly signal: AbortSignal;
    },
  ): Promise<{ readonly data?: NoticeListResponse | undefined }>;
  GET(
    path: '/api/v1/notices/{id}',
    init: {
      readonly params: { readonly path: { readonly id: string } };
      readonly signal: AbortSignal;
    },
  ): Promise<{ readonly data?: NoticeDetailResponse | undefined }>;
}

/** 검색 입력창에 입력된 원문을 100자 이하로 즉시 제한합니다. */
export function clampNoticeSearchInput(raw: string): string {
  if (raw.length <= MAX_NOTICE_QUERY_LENGTH) return raw;
  return raw.slice(0, MAX_NOTICE_QUERY_LENGTH);
}

/** 서버 조회에 사용할 검색어를 앞뒤 공백 제거 후 100자 이하로 정규화합니다. */
export function normalizeNoticeSearchQuery(raw: string): string {
  return raw.trim().slice(0, MAX_NOTICE_QUERY_LENGTH);
}

/**
 * GET /api/v1/notices 호출용 쿼리 객체를 생성합니다.
 * 허용된 키(page, pageSize, 비어 있지 않은 q)만 포함하며 빈 검색어일 때 q 키 자체를 생략합니다.
 */
export function buildNoticeListQueryParams(
  page: number,
  rawQuery: string,
  pageSize: number = NOTICE_PAGE_SIZE,
): NoticeListQueryParams {
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safePageSize = Number.isInteger(pageSize) && pageSize >= 1 ? pageSize : NOTICE_PAGE_SIZE;
  const normalizedQuery = normalizeNoticeSearchQuery(rawQuery);

  if (normalizedQuery.length > 0) {
    return {
      page: safePage,
      pageSize: safePageSize,
      q: normalizedQuery,
    };
  }

  return {
    page: safePage,
    pageSize: safePageSize,
  };
}

/** 검색어와 사용자 식별자를 포함한 공지 목록 React Query 키를 생성합니다. */
export function buildNoticeListQueryKey(
  userId: string | null | undefined,
  rawQuery: string,
): readonly ['notices', 'list', string, string] {
  const normalizedQuery = normalizeNoticeSearchQuery(rawQuery);
  return ['notices', 'list', userId ?? 'anonymous', normalizedQuery] as const;
}

/** 공지 상세 조회용 React Query 키를 생성합니다. */
export function buildNoticeDetailQueryKey(
  userId: string | null | undefined,
  noticeId: string,
): readonly ['notices', 'detail', string, string] {
  return ['notices', 'detail', userId ?? 'anonymous', noticeId.trim()] as const;
}

/** page.hasNextPage 값을 기준으로 다음 페이지 번호를 결정합니다. */
export function getNextNoticePageParam(lastPage: NoticeListResponse): number | undefined {
  if (!lastPage.page.hasNextPage) {
    return undefined;
  }
  return lastPage.page.page + 1;
}

/**
 * 여러 페이지의 공지 목록을 하나의 배열로 합치면서 id 기준으로 중복 행을 제거합니다.
 * 페이지네이션 도중 새 고정/발행 공지가 추가되어 발생하는 중복 키·중복 행을 방지합니다.
 */
export function mergeNoticePages(
  pages: readonly NoticeListResponse[] | undefined,
): readonly NoticeSummary[] {
  if (!pages || pages.length === 0) return [];
  const seenIds = new Set<string>();
  const merged: NoticeSummary[] = [];

  for (const page of pages) {
    for (const notice of page.notices) {
      if (seenIds.has(notice.id)) continue;
      seenIds.add(notice.id);
      merged.push(notice);
    }
  }
  return merged;
}

/** 라우트 파라미터에서 공지 ID 문자열을 안전하게 추출합니다. */
export function normalizeNoticeId(rawId: string | readonly string[] | undefined): string {
  if (typeof rawId === 'string') return rawId.trim();
  if (Array.isArray(rawId) && typeof rawId[0] === 'string') return rawId[0].trim();
  return '';
}

/** 공지 상세 조회 시 404(NOT_FOUND) 오류 여부를 판별합니다. */
export function isNoticeNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND');
}

/** 공지 목록/상세 오류를 한국어 사용자 안내 문구로 변환합니다. */
export function toNoticeErrorMessage(
  error: unknown,
  scope: 'list' | 'detail' = 'list',
): string {
  if (scope === 'detail' && isNoticeNotFoundError(error)) {
    return noticesStrings.notFoundMessage;
  }
  return toKoreanMessage(error);
}

/** 타입 안전 클라이언트를 통해 공지 목록 한 페이지를 조회합니다. */
export async function fetchNoticeListPage(
  client: NoticeApiClientPort,
  options: {
    readonly page: number;
    readonly rawQuery: string;
    readonly signal: AbortSignal;
  },
): Promise<NoticeListResponse> {
  const query = buildNoticeListQueryParams(options.page, options.rawQuery, NOTICE_PAGE_SIZE);
  const { data } = await client.GET('/api/v1/notices', {
    params: { query },
    signal: options.signal,
  });
  if (!data) {
    throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
  }
  return data;
}

/** 타입 안전 클라이언트를 통해 공지 상세 데이터를 조회합니다. */
export async function fetchNoticeDetail(
  client: NoticeApiClientPort,
  options: {
    readonly id: string;
    readonly signal: AbortSignal;
  },
): Promise<NoticeDetail> {
  const cleanId = options.id.trim();
  if (!cleanId) {
    throw new ApiError({ status: 404, code: 'NOT_FOUND' });
  }
  const { data } = await client.GET('/api/v1/notices/{id}', {
    params: { path: { id: cleanId } },
    signal: options.signal,
  });
  if (!data?.notice) {
    throw new ApiError({ status: 404, code: 'NOT_FOUND' });
  }
  return data.notice;
}
