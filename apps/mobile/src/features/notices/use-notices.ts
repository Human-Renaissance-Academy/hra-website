/**
 * 역할: 공지 검색어 400ms 디바운스 상태 관리 및 공지 목록(무한 스크롤)·상세 React Query 훅 제공
 * 사용 위치: app/(app)/(tabs)/notices.tsx, app/(app)/notices/[id].tsx
 * 주요 기능:
 * - 검색 입력 100자 제한, 400ms 디바운스, 키보드 검색 즉시 확정, 지우기 즉시 초기화
 * - useInfiniteQuery 기반 공지 목록 페이지네이션 및 페이지 간 중복 제거
 * - 루트 공급자의 공유 캐시를 사용하는 useQuery 기반 공지 상세 조회
 */
import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/use-auth';
import { getApiClient } from '../../auth/runtime';
import { apiQueryOptions, retryQuery } from '../../query/client';
import {
  buildNoticeDetailQueryKey,
  buildNoticeListQueryKey,
  clampNoticeSearchInput,
  fetchNoticeDetail,
  fetchNoticeListPage,
  getNextNoticePageParam,
  mergeNoticePages,
  normalizeNoticeId,
  normalizeNoticeSearchQuery,
  NOTICE_SEARCH_DEBOUNCE_MS,
  type NoticeSummary,
} from './notices-core';

export interface UseDebouncedNoticeQueryResult {
  readonly inputText: string;
  readonly submittedQuery: string;
  readonly onChangeText: (nextText: string) => void;
  readonly onSubmitSearch: () => void;
  readonly onClearSearch: () => void;
}

/**
 * 공지 검색 입력값(최대 100자)과 400ms 디바운스된 서버 요청 검색어를 관리합니다.
 * 키보드 '검색' 액션(onSubmitSearch)이나 '지우기'(onClearSearch) 호출 시 타이머를 즉시 플러시합니다.
 */
export function useDebouncedNoticeQuery(
  initialValue: string = '',
  debounceMs: number = NOTICE_SEARCH_DEBOUNCE_MS,
): UseDebouncedNoticeQueryResult {
  const initialClamped = clampNoticeSearchInput(initialValue);
  const [inputText, setInputText] = useState<string>(initialClamped);
  const [submittedQuery, setSubmittedQuery] = useState<string>(() =>
    normalizeNoticeSearchQuery(initialClamped),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearPendingTimer();
    const nextNormalized = normalizeNoticeSearchQuery(inputText);
    if (nextNormalized === submittedQuery) {
      return undefined;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSubmittedQuery(nextNormalized);
    }, debounceMs);

    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer, debounceMs, inputText, submittedQuery]);

  const onChangeText = useCallback((nextText: string) => {
    setInputText(clampNoticeSearchInput(nextText));
  }, []);

  const onSubmitSearch = useCallback(() => {
    clearPendingTimer();
    setSubmittedQuery(normalizeNoticeSearchQuery(inputText));
  }, [clearPendingTimer, inputText]);

  const onClearSearch = useCallback(() => {
    clearPendingTimer();
    setInputText('');
    setSubmittedQuery('');
  }, [clearPendingTimer]);

  return {
    inputText,
    submittedQuery,
    onChangeText,
    onSubmitSearch,
    onClearSearch,
  };
}

/** 현재 인증 컨텍스트에서 사용자 ID와 쿼리 활성화 여부를 계산합니다. */
function useNoticeAuthGate(): {
  readonly userId: string | null;
  readonly isQueryEnabled: boolean;
} {
  const auth = useAuth();
  return {
    userId: auth.user?.id ?? null,
    isQueryEnabled: auth.status === 'signedIn',
  };
}

/**
 * 공지 목록을 무한 스크롤(useInfiniteQuery)로 조회하고 중복 제거된 공지 배열을 반환합니다.
 */
export function useNoticeListInfiniteQuery(rawQuery: string) {
  const { userId, isQueryEnabled } = useNoticeAuthGate();
  const normalizedQuery = normalizeNoticeSearchQuery(rawQuery);
  const queryKey = useMemo(
    () => buildNoticeListQueryKey(userId, normalizedQuery),
    [normalizedQuery, userId],
  );

  const query = useInfiniteQuery(
    {
      queryKey,
      initialPageParam: 1,
      enabled: isQueryEnabled,
      staleTime: 30_000,
      gcTime: 300_000,
      retry: retryQuery,
      queryFn: ({ pageParam, signal }) =>
        fetchNoticeListPage(getApiClient(), {
          page: pageParam,
          rawQuery: normalizedQuery,
          signal,
        }),
      getNextPageParam: getNextNoticePageParam,
    },
  );

  const items: readonly NoticeSummary[] = useMemo(
    () => mergeNoticePages(query.data?.pages),
    [query.data?.pages],
  );

  return {
    ...query,
    isInitialLoading: isQueryEnabled && query.isPending,
    items,
    normalizedQuery,
    queryKey,
  };
}

/**
 * 단일 공지 상세 정보를 조회합니다.
 */
export function useNoticeDetailQuery(rawId: string | readonly string[] | undefined) {
  const { userId, isQueryEnabled } = useNoticeAuthGate();
  const noticeId = normalizeNoticeId(rawId);
  const queryKey = useMemo(
    () => buildNoticeDetailQueryKey(userId, noticeId),
    [noticeId, userId],
  );

  const baseOptions = apiQueryOptions(queryKey, (signal) =>
    fetchNoticeDetail(getApiClient(), { id: noticeId, signal }),
  );

  const query = useQuery(
    {
      ...baseOptions,
      enabled: isQueryEnabled && noticeId.length > 0,
    },
  );

  return {
    ...query,
    noticeId,
    queryKey,
  };
}
