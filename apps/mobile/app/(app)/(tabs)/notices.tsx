/**
 * 역할: 공지 탭 목록 화면(검색 입력 400ms 디바운스·100자 제한·지우기, 무한 스크롤, 당겨서 새로고침)
 * 사용 위치: app/(app)/(tabs)/notices.tsx
 * 주요 기능:
 * - GET /api/v1/notices (page, pageSize=10, q) 무한 스크롤 조회 및 중복 행 제거
 * - 고정 배지(고정), 제목, 발췌문, KST 날짜(formatKstDate), 조회수 표시 및 /notices/{id} 이동
 * - 초기 스켈레톤, 빈 목록("검색 결과가 없습니다." / "등록된 공지가 없습니다."), 오류+다시 시도 상태 처리
 */
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  NoticeCard,
  NoticeSearchBar,
  noticesStrings,
  toNoticeErrorMessage,
  useDebouncedNoticeQuery,
  useNoticeListInfiniteQuery,
  type NoticeSummary,
} from '../../../src/features/notices';
import { ko } from '../../../src/i18n/ko';
import { theme } from '../../../src/theme';
import {
  AppText,
  EmptyState,
  ErrorState,
  InlineBanner,
  Screen,
  SkeletonList,
  useRefresh,
} from '../../../src/ui';

function keyExtractor(item: NoticeSummary): string {
  return item.id;
}

export default function NoticesScreen() {
  const router = useRouter();
  const {
    inputText,
    submittedQuery,
    onChangeText,
    onSubmitSearch,
    onClearSearch,
  } = useDebouncedNoticeQuery();

  const query = useNoticeListInfiniteQuery(submittedQuery);
  const { refreshControlProps } = useRefresh(() => query.refetch());

  const handleOpenNotice = useCallback(
    (noticeId: string) => {
      router.push(`/notices/${noticeId}`);
    },
    [router],
  );

  const handleEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  }, [query]);

  const renderItem = useCallback(
    ({ item }: { readonly item: NoticeSummary }) => (
      <NoticeCard notice={item} onPress={handleOpenNotice} />
    ),
    [handleOpenNotice],
  );

  const renderEmpty = () => {
    if (query.isInitialLoading) {
      return <SkeletonList count={4} testID="notices-skeleton" />;
    }
    if (query.isError) {
      return (
        <ErrorState
          testID="notices-error"
          message={toNoticeErrorMessage(query.error, 'list')}
          onRetry={() => void query.refetch()}
        />
      );
    }
    const isSearching = submittedQuery.length > 0;
    return (
      <EmptyState
        testID="notices-empty"
        icon={isSearching ? 'search' : 'megaphone-outline'}
        description={
          isSearching ? noticesStrings.emptySearchResult : noticesStrings.emptyDefault
        }
      />
    );
  };

  const renderFooter = () => {
    if (query.isFetchingNextPage) {
      return (
        <View
          testID="notices-loading-more"
          accessibilityState={{ busy: true }}
          style={styles.footerLoading}
        >
          <ActivityIndicator size="small" color={theme.colors.brand} />
          <AppText variant="caption" tone="secondary">
            {noticesStrings.loadingMore}
          </AppText>
        </View>
      );
    }
    if (query.isFetchNextPageError && query.items.length > 0) {
      return (
        <View style={styles.footerBanner}>
          <InlineBanner
            testID="notices-load-more-error"
            tone="danger"
            title={noticesStrings.loadMoreErrorTitle}
            message={toNoticeErrorMessage(query.error, 'list')}
            actionLabel={ko.ui.retry}
            onActionPress={() => void query.fetchNextPage()}
          />
        </View>
      );
    }
    return null;
  };

  return (
    <Screen scroll={false} padding="none" edges={['left', 'right']}>
      <View style={styles.headerSection}>
        <AppText variant="title">{noticesStrings.headerTitle}</AppText>
        <NoticeSearchBar
          value={inputText}
          onChangeText={onChangeText}
          onSubmitSearch={onSubmitSearch}
          onClearSearch={onClearSearch}
        />
      </View>
      <FlatList
        testID="notices-list"
        data={query.items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.listContent,
          query.items.length === 0 ? styles.listEmptyContent : null,
        ]}
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReachedThreshold={0.4}
        onEndReached={handleEndReached}
        refreshControl={
          <RefreshControl {...refreshControlProps} title={ko.ui.refreshing} />
        }
      />
    </Screen>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  headerSection: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.s3,
    gap: theme.spacing.s3,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  listEmptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  separator: {
    height: theme.spacing.s3,
  },
  footerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  footerBanner: {
    paddingTop: theme.spacing.md,
  },
});
