/**
 * 역할: 자료실(Resources) 탭 메인 화면 컴포넌트
 * 사용 위치: app/(app)/(tabs)/resources.tsx
 * 주요 기능:
 * - GET /api/v1/resources/guidebooks (page, pageSize=10) useInfiniteQuery 무한 스크롤 및 당겨서 새로고침
 * - 페이지 간 중복 ID 제거(deduplicateGuidebooks), 스켈레톤/빈 상태/오류+재시도/403 역할 안내 상태 표시
 * - 항목 탭 시 createGuidebookDownloadRunner 를 통해 인증 PDF 다운로드·진행률·취소·열기 제어
 * - 언마운트 시 진행 중인 모든 다운로드 전송을 즉시 abort 하여 유령 작업을 방지
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ApiError } from '../../api/errors';
import { getApiClient } from '../../auth/runtime';
import { useAuth } from '../../auth/use-auth';
import { theme } from '../../theme';
import {
  AppText, EmptyState, ErrorState, InlineBanner, Screen, SkeletonList, useRefresh,
} from '../../ui';
import { ready, trackTransfer } from '../account/account-runtime';
import { downloadProtectedFile } from '../files/download-protected-file';
import { createExpoFileSystemPort } from '../files/expo-file-system-port';
import { openProtectedFile } from '../files/open-file';
import { createProtectedRequest } from '../files/protected-request';
import { GuidebookRow } from './components/guidebook-row';
import type { DownloadState, GuidebookListResponse, GuidebookSummary } from './download-state';
import {
  deduplicateGuidebooks, initialDownloadState, isForbiddenError, mapResourceErrorToKorean,
} from './download-state';
import type { GuidebookDownloadRunner } from './guidebook-download-runner';
import { createGuidebookDownloadRunner } from './guidebook-download-runner';
import { resourcesStrings } from './strings';

export const GUIDEBOOKS_PAGE_SIZE = 10;

async function fetchGuidebooksPage(page: number, signal: AbortSignal): Promise<GuidebookListResponse> {
  const { data } = await getApiClient().GET('/api/v1/resources/guidebooks', {
    params: { query: { page, pageSize: GUIDEBOOKS_PAGE_SIZE } },
    signal,
  });
  if (!data) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
  return data;
}

/** 자료실 탭 본문 화면입니다. */
export function ResourcesScreenView() {
  const { status, user, role, isPending } = useAuth();
  const [downloadStates, setDownloadStates] = useState<Readonly<Record<string, DownloadState>>>({});
  const [runner] = useState<GuidebookDownloadRunner>(() => {
    const fs = createExpoFileSystemPort();
    return createGuidebookDownloadRunner({
      fs,
      createRequest: (target) => createProtectedRequest(getApiClient(), target),
      download: downloadProtectedFile,
      open: openProtectedFile,
      trackTransfer,
      ready,
      onStateChange: (id, nextState) => {
        setDownloadStates((prev) => ({ ...prev, [id]: nextState }));
      },
    });
  });

  useEffect(() => {
    return () => { runner.abortAll(); };
  }, [runner]);

  const isSignedIn = status === 'signedIn';
  const isRolePending = role === 'PENDING' || isPending;

  const query = useInfiniteQuery({
    queryKey: ['resources', 'guidebooks', user?.id ?? 'anonymous'] as const,
    initialPageParam: 1,
    enabled: isSignedIn && !isRolePending,
    queryFn: ({ pageParam, signal }) => fetchGuidebooksPage(pageParam, signal),
    getNextPageParam: (lastPage) => (lastPage.page.hasNextPage ? lastPage.page.page + 1 : undefined),
  });

  const { refreshControlProps } = useRefresh(() => query.refetch());
  const guidebooks = useMemo(
    () => deduplicateGuidebooks(query.data?.pages.map((page) => page.guidebooks) ?? []),
    [query.data?.pages],
  );
  const handlePressGuidebook = useCallback((item: GuidebookSummary) => { void runner.start(item); }, [runner]);
  const handleCancelGuidebook = useCallback((id: string) => { runner.cancel(id); }, [runner]);

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [query]);

  const headerBlock = (
    <View style={styles.headerContainer}>
      <AppText variant="title">{resourcesStrings.screenTitle}</AppText>
      <AppText variant="bodySmall" tone="secondary">
        {resourcesStrings.subtitle}
      </AppText>
    </View>
  );

  if (isRolePending || (query.isError && isForbiddenError(query.error))) {
    return (
      <Screen padding="md" testID="resources-screen-forbidden">
        {headerBlock}
        <View style={styles.centerFill}>
          <EmptyState
            testID="resources-forbidden-state"
            icon="lock-closed-outline"
            title={resourcesStrings.roleGuard.forbiddenTitle}
            description={resourcesStrings.roleGuard.forbiddenMessage}
          />
        </View>
      </Screen>
    );
  }

  if (query.isPending) {
    return (
      <Screen padding="md" testID="resources-screen-loading">
        {headerBlock}
        <SkeletonList
          testID="resources-skeleton-list"
          count={4}
          reduceMotion
          accessibilityLabel={resourcesStrings.list.loading}
        />
      </Screen>
    );
  }

  if (query.isError && guidebooks.length === 0) {
    const { message } = mapResourceErrorToKorean(query.error, 'list');
    return (
      <Screen padding="md" testID="resources-screen-error">
        {headerBlock}
        <View style={styles.centerFill}>
          <ErrorState
            testID="resources-error-state"
            message={message}
            retrying={query.isRefetching}
            onRetry={() => void query.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padding="none" testID="resources-screen">
      <FlatList
        testID="resources-guidebook-list"
        data={guidebooks}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl {...refreshControlProps} title={resourcesStrings.list.loading} />
        }
        contentContainerStyle={[
          styles.listContent,
          guidebooks.length === 0 ? styles.emptyListContent : null,
        ]}
        ListHeaderComponent={headerBlock}
        renderItem={({ item }) => (
          <GuidebookRow
            item={item}
            state={downloadStates[item.id] ?? initialDownloadState}
            onPress={handlePressGuidebook}
            onCancel={handleCancelGuidebook}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.centerFill}>
            <EmptyState
              testID="resources-empty-state"
              icon="folder-open-outline"
              title={resourcesStrings.list.emptyTitle}
              description={resourcesStrings.list.emptyDescription}
            />
          </View>
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={styles.footerLoading} testID="resources-loading-more">
              <ActivityIndicator size="small" color={theme.colors.brand} />
              <AppText variant="bodySmall" tone="secondary">
                {resourcesStrings.list.loadingMore}
              </AppText>
            </View>
          ) : query.isFetchNextPageError ? (
            <View style={styles.footerError}>
              <InlineBanner
                testID="resources-load-more-error"
                tone="danger"
                title={resourcesStrings.list.loadMoreError}
                message={mapResourceErrorToKorean(query.error, 'list').message}
                actionLabel={resourcesStrings.list.retryLoadMore}
                onActionPress={() => void query.fetchNextPage()}
              />
            </View>
          ) : undefined
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerContainer: { marginBottom: theme.spacing.sm },
  listContent: { padding: theme.spacing.md, flexGrow: 1 },
  emptyListContent: { justifyContent: 'space-between' },
  centerFill: { flex: 1, justifyContent: 'center' },
  separator: { height: theme.spacing.s3 },
  footerLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
  footerError: { paddingTop: theme.spacing.md },
});
