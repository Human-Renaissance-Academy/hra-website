/**
 * 역할: 당겨서 새로고침(Pull-to-Refresh) 상태와 중복 호출 방지를 관리하는 공통 훅
 * 사용 위치: 홈, 공지 목록, 일정, 자료실, 내 과제 등 ScrollView/FlatList 화면
 * 주요 기능:
 * - 사용자가 직접 당겨서 새로고침할 때만 refreshing 상태를 true로 유지
 * - 진행 중 중복 호출을 방지하고 브랜드 색상이 적용된 RefreshControl 속성 제공
 */
import { useCallback, useRef, useState } from 'react';
import { theme } from '../theme';

export interface UseRefreshResult {
  readonly refreshing: boolean;
  readonly onRefresh: () => Promise<void>;
  readonly refreshControlProps: {
    readonly refreshing: boolean;
    readonly onRefresh: () => void;
    readonly tintColor: string;
    readonly colors: readonly [string];
  };
}

/** 비동기 새로고침 함수를 감싸 FlatList 및 Screen에 바로 연결할 수 있는 상태를 반환합니다. */
export function useRefresh(refreshFn: () => unknown | Promise<unknown>): UseRefreshResult {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const onRefresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      await refreshFn();
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [refreshFn]);

  const handleRefresh = useCallback(() => {
    void onRefresh();
  }, [onRefresh]);

  return {
    refreshing,
    onRefresh,
    refreshControlProps: {
      refreshing,
      onRefresh: handleRefresh,
      tintColor: theme.colors.brand,
      colors: [theme.colors.brand],
    },
  };
}
