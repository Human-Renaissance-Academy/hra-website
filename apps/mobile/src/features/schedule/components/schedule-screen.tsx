/**
 * 역할: 월별 학사 일정(Schedule) 탭의 전체 화면 상태, 월 탐색, 날짜 그룹 아젠다 목록, 오늘 자동 스크롤을 조합하는 컨테이너
 * 사용 위치: app/(app)/(tabs)/schedule.tsx 및 tests/schedule-screen.test.tsx
 * 주요 기능:
 * - 초기 월을 KST 현재 연·월로 설정하고 이전 달 / 다음 달 / 오늘 이동 지원(1900.01~2100.12 경계 가드)
 * - keepPreviousData(placeholderData)로 다음 달 로딩 중 이전 달 화면을 유지하되 로딩 배지로 구분하고, 오류 발생 시 ErrorState로 전환
 * - 현재 달의 첫 로드 완료 시 오늘(KST) 날짜 그룹이 있으면 해당 위치로 자동 스크롤
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toKoreanMessage } from '../../../api/errors';
import { useAuth } from '../../../auth/use-auth';
import { ko } from '../../../i18n/ko';
import type { Clock } from '../../../lib/date-kst';
import { theme } from '../../../theme';
import {
  EmptyState,
  ErrorState,
  InlineBanner,
  Screen,
  SkeletonList,
  useRefresh,
} from '../../../ui';
import {
  buildScheduleDateGroups,
  findTodayGroupIndex,
  getInitialScheduleMonth,
  getTodayKstCalendarDate,
  isSameScheduleMonth,
  stepScheduleMonth,
} from '../schedule-model';
import type { ScheduleDateGroupView, ScheduleMonth } from '../schedule-model';
import {
  prefetchAdjacentScheduleMonths,
  scheduleMonthQueryOptions,
} from '../schedule-query';
import type { ScheduleApiPort } from '../schedule-query';
import { scheduleStrings } from '../strings';
import { ScheduleDateGroup } from './schedule-date-group';
import { ScheduleMonthHeader } from './schedule-month-header';

export interface ScheduleScreenProps {
  readonly clock?: Clock | undefined;
  readonly client?: ScheduleApiPort | undefined;
  readonly initialMonth?: ScheduleMonth | undefined;
}

export function ScheduleScreen({
  clock = Date.now,
  client,
  initialMonth,
}: ScheduleScreenProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ScheduleDateGroupView> | null>(null);
  const hasAutoScrolledTodayRef = useRef(false);
  const isAuthenticated = Boolean(user?.id);

  const [visibleMonth, setVisibleMonth] = useState<ScheduleMonth>(() =>
    initialMonth ?? getInitialScheduleMonth(clock),
  );

  const todayCalendarDate = getTodayKstCalendarDate(clock);
  const currentKstMonth = getInitialScheduleMonth(clock);

  const query = useQuery({
    ...scheduleMonthQueryOptions(user?.id, visibleMonth, client),
    placeholderData: keepPreviousData,
    enabled: isAuthenticated,
  });

  const { refreshControlProps } = useRefresh(async () => {
    if (!isAuthenticated) return;
    await query.refetch();
  });

  useEffect(() => {
    if (!isAuthenticated || !query.isSuccess || query.isPlaceholderData) return;
    void prefetchAdjacentScheduleMonths(queryClient, user?.id, visibleMonth, client);
  }, [client, isAuthenticated, query.isPlaceholderData, query.isSuccess, queryClient, user?.id, visibleMonth]);

  const dateGroups = useMemo(
    () => (query.data ? buildScheduleDateGroups(query.data.events, todayCalendarDate) : []),
    [query.data, todayCalendarDate],
  );

  useEffect(() => {
    if (hasAutoScrolledTodayRef.current || !query.isSuccess || query.isPlaceholderData) return;
    if (!isSameScheduleMonth(visibleMonth, currentKstMonth)) return;

    const todayIndex = findTodayGroupIndex(dateGroups);
    hasAutoScrolledTodayRef.current = true;
    if (todayIndex > 0) {
      listRef.current?.scrollToIndex({ index: todayIndex, animated: false });
    }
  }, [currentKstMonth, dateGroups, query.isPlaceholderData, query.isSuccess, visibleMonth]);

  const handlePreviousMonth = useCallback(() => {
    setVisibleMonth((prev) => stepScheduleMonth(prev, -1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setVisibleMonth((prev) => stepScheduleMonth(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setVisibleMonth(getInitialScheduleMonth(clock));
  }, [clock]);

  const renderGroupItem = useCallback(
    ({ item }: ListRenderItemInfo<ScheduleDateGroupView>) => <ScheduleDateGroup group={item} />,
    [],
  );

  const isInitialLoading = query.isPending && !query.data;
  const isShowingPlaceholder = Boolean(query.isPlaceholderData && query.isFetching);
  const isMonthError = query.isError && (!query.data || query.isPlaceholderData);
  const isCurrentMonthRefreshError =
    query.isError && Boolean(query.data) && !query.isPlaceholderData;

  return (
    <Screen scroll={false} padding="none" testID="schedule-screen">
      <ScheduleMonthHeader
        visibleMonth={visibleMonth}
        isShowingPlaceholder={isShowingPlaceholder}
        onPreviousMonth={handlePreviousMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      {isCurrentMonthRefreshError ? (
        <View style={styles.bannerWrap}>
          <InlineBanner
            tone="danger"
            title={scheduleStrings.states.staleErrorBannerTitle}
            message={toKoreanMessage(query.error)}
            actionLabel={scheduleStrings.states.retryButton}
            onActionPress={() => void query.refetch()}
            testID="schedule-refresh-error-banner"
          />
        </View>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.stateContainer}>
          <SkeletonList
            count={3}
            reduceMotion={!isAuthenticated ? true : undefined}
            accessibilityLabel={scheduleStrings.states.loadingMonth}
            testID="schedule-skeleton-list"
          />
        </View>
      ) : isMonthError ? (
        <View style={styles.centeredState}>
          <ErrorState
            message={toKoreanMessage(query.error)}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            testID="schedule-error-state"
          />
        </View>
      ) : dateGroups.length === 0 ? (
        <FlatList
          data={[]}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.calendarDate}
          refreshControl={<RefreshControl {...refreshControlProps} title={ko.ui.refreshing} />}
          contentContainerStyle={styles.emptyListContent}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={scheduleStrings.states.emptyMonthTitle}
              description={scheduleStrings.states.emptyMonthDescription}
              testID="schedule-empty-state"
            />
          }
          testID="schedule-empty-list"
        />
      ) : (
        <FlatList
          ref={listRef}
          data={dateGroups}
          renderItem={renderGroupItem}
          keyExtractor={(item) => item.calendarDate}
          refreshControl={<RefreshControl {...refreshControlProps} title={ko.ui.refreshing} />}
          onScrollToIndexFailed={() => undefined}
          contentContainerStyle={[
            styles.listContent,
            isShowingPlaceholder ? styles.placeholderContent : null,
          ]}
          testID="schedule-agenda-list"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateContainer: { flex: 1, padding: theme.spacing.md },
  centeredState: { flex: 1, justifyContent: 'center', padding: theme.spacing.md },
  bannerWrap: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  listContent: { padding: theme.spacing.md, gap: theme.spacing.md },
  emptyListContent: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.md },
  placeholderContent: { opacity: 0.6 },
});
