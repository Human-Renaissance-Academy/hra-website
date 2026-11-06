/**
 * 역할: 내 과제 목록(GET /api/v1/assignments) 화면 컴포넌트
 * 사용 위치: app/(app)/assignments/index.tsx
 * 주요 기능:
 * - useInfiniteQuery 기반 20건 단위 페이지네이션 및 page.hasNextPage 기반 추가 조회
 * - 과제 제목, 마감 일시(formatKstDateTime), 마감 여유(formatDueText), 상태 칩(제출 완료/미제출/마감됨), 제출 시각 표시
 * - 로딩 스켈레톤, 빈 목록("공개된 과제가 없습니다."), 403 권한 안내, 503 학사 미개방 안내, 일반 오류 + 다시 시도, 당겨서 새로고침 제공
 */
import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useAuth } from '../../auth/use-auth';
import { SessionNotice } from '../../auth/session-notice';
import type { Instant } from '../../lib/date-kst';
import { theme } from '../../theme';
import {
  AppText,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  InlineBanner,
  Screen,
  SkeletonList,
  useRefresh,
} from '../../ui';
import {
  ASSIGNMENTS_PAGE_SIZE,
  assignmentQueryKeys,
  fetchMyAssignmentsPage,
} from './assignments-api';
import {
  flattenAssignmentPages,
  resolveAssignmentQueryError,
  toAssignmentCardViewModel,
} from './assignment-view-model';
import type { AssignmentCardViewModel } from './assignment-view-model';
import { assignmentsStrings } from './strings';

export interface AssignmentListScreenProps {
  readonly clock?: (() => Instant) | undefined;
}

/** 내 과제 목록 화면입니다. */
export function AssignmentListScreen({ clock = Date.now }: AssignmentListScreenProps) {
  const router = useRouter();
  const { user } = useAuth();

  const query = useInfiniteQuery({
    queryKey: assignmentQueryKeys.list(user?.id, ASSIGNMENTS_PAGE_SIZE),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      fetchMyAssignmentsPage({ page: pageParam, pageSize: ASSIGNMENTS_PAGE_SIZE, signal }),
    getNextPageParam: (lastPage) =>
      lastPage.page.hasNextPage ? lastPage.page.page + 1 : undefined,
  });

  const { refreshControlProps } = useRefresh(() => query.refetch());
  const now = clock();

  const cards = useMemo(() => {
    const items = flattenAssignmentPages(query.data?.pages);
    return items.map((item) => toAssignmentCardViewModel(item, now));
  }, [query.data?.pages, now]);

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [query]);

  const renderHeader = useCallback(
    () => (
      <View style={styles.headerBlock}>
        <SessionNotice />
        <AppText variant="title">{assignmentsStrings.list.title}</AppText>
        <AppText variant="bodySmall" tone="secondary">
          {assignmentsStrings.list.subtitle}
        </AppText>
      </View>
    ),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { readonly item: AssignmentCardViewModel }) => (
      <Card
        testID={`assignment-card-${item.assignmentId}`}
        variant="elevated"
        padding="md"
        accessibilityLabel={item.accessibilityLabel}
        accessibilityHint={assignmentsStrings.list.cardA11yHint}
        onPress={() => router.push(`/assignments/${item.assignmentId}`)}
        style={styles.card}
      >
        <View style={styles.chipRow}>
          <Chip
            label={item.statusChip.label}
            tone={item.statusChip.tone}
            icon={item.statusChip.icon}
          />
          <Chip label={item.dueCountdownText} tone="neutral" />
        </View>
        <AppText variant="subheading" style={styles.cardTitle}>
          {item.title}
        </AppText>
        <Divider spacing="sm" />
        <AppText variant="bodySmall" tone="secondary">
          {item.dueDateTimeText}
        </AppText>
        {item.submittedAtText ? (
          <AppText variant="bodySmall" tone="success">
            {item.submittedAtText}
          </AppText>
        ) : null}
      </Card>
    ),
    [router],
  );

  const renderFooter = useCallback(() => {
    if (query.isFetchingNextPage) {
      return (
        <View style={styles.footerBlock}>
          <AppText variant="bodySmall" tone="secondary" align="center">
            {assignmentsStrings.list.loadingMore}
          </AppText>
        </View>
      );
    }
    if (query.isFetchNextPageError) {
      return (
        <View style={styles.footerBlock}>
          <InlineBanner
            tone="danger"
            message={assignmentsStrings.list.loadMoreError}
            actionLabel={assignmentsStrings.list.retryLoadMore}
            onActionPress={() => void query.fetchNextPage()}
          />
        </View>
      );
    }
    return null;
  }, [query]);

  if (query.isPending) {
    return (
      <Screen padding="md" edges={['bottom', 'left', 'right']}>
        {renderHeader()}
        <SkeletonList
          count={3}
          accessibilityLabel={assignmentsStrings.list.loading}
          testID="assignments-list-skeleton"
        />
      </Screen>
    );
  }

  if (query.isError && cards.length === 0) {
    const errorState = resolveAssignmentQueryError(query.error);
    if (errorState.kind === 'forbidden' || errorState.kind === 'disabled') {
      return (
        <Screen
          scroll
          padding="md"
          edges={['bottom', 'left', 'right']}
          refreshControl={<RefreshControl {...refreshControlProps} />}
        >
          {renderHeader()}
          <EmptyState
            testID={`assignments-${errorState.kind}-state`}
            icon={errorState.kind === 'forbidden' ? 'lock-closed-outline' : 'information-circle-outline'}
            title={errorState.message}
          />
        </Screen>
      );
    }
    return (
      <Screen
        scroll
        padding="md"
        edges={['bottom', 'left', 'right']}
        refreshControl={<RefreshControl {...refreshControlProps} />}
      >
        {renderHeader()}
        <ErrorState
          testID="assignments-error-state"
          message={errorState.message}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padding="none" edges={['bottom', 'left', 'right']}>
      <FlatList
        testID="assignments-flat-list"
        data={cards}
        keyExtractor={(item) => item.targetId}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState
            testID="assignments-empty-state"
            title={assignmentsStrings.list.emptyTitle}
            description={assignmentsStrings.list.emptyDescription}
            actionLabel={assignmentsStrings.fileDownload.retryAction}
            onActionPress={() => void query.refetch()}
          />
        }
        ListFooterComponent={renderFooter}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl {...refreshControlProps} />}
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.s3,
  },
  headerBlock: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  card: {
    gap: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cardTitle: {
    marginTop: theme.spacing.xs,
  },
  footerBlock: {
    paddingVertical: theme.spacing.md,
  },
});
