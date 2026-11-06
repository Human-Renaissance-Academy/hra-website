/**
 * 역할: 공지(Notices) 기능 모듈의 순수 로직·React Query 훅·문구·UI 컴포넌트 단일 진입점
 * 사용 위치: app/(app)/(tabs)/notices.tsx, app/(app)/notices/** 및 단위 테스트
 * 주요 기능: 공지 목록/상세 핵심 유틸리티와 훅, 프레젠테이션 컴포넌트 재수출
 */
export { NoticeCard } from './components/notice-card';
export type { NoticeCardProps } from './components/notice-card';
export { NoticeSearchBar } from './components/notice-search-bar';
export type { NoticeSearchBarProps } from './components/notice-search-bar';
export {
  buildNoticeDetailQueryKey,
  buildNoticeListQueryKey,
  buildNoticeListQueryParams,
  clampNoticeSearchInput,
  fetchNoticeDetail,
  fetchNoticeListPage,
  getNextNoticePageParam,
  isNoticeNotFoundError,
  MAX_NOTICE_QUERY_LENGTH,
  mergeNoticePages,
  normalizeNoticeId,
  normalizeNoticeSearchQuery,
  NOTICE_PAGE_SIZE,
  NOTICE_SEARCH_DEBOUNCE_MS,
  toNoticeErrorMessage,
} from './notices-core';
export type {
  NoticeApiClientPort,
  NoticeDetail,
  NoticeDetailResponse,
  NoticeListQueryParams,
  NoticeListResponse,
  NoticeSummary,
  PageMeta,
} from './notices-core';
export { noticesStrings } from './strings';
export {
  useDebouncedNoticeQuery,
  useNoticeDetailQuery,
  useNoticeListInfiniteQuery,
} from './use-notices';
export type { UseDebouncedNoticeQueryResult } from './use-notices';
