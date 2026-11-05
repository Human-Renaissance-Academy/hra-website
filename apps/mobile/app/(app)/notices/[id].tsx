/**
 * 역할: 공지 상세 화면(GET /api/v1/notices/{id}) — 제목, KST 작성일, 조회수, 안전한 Markdown 본문 표시
 * 사용 위치: app/(app)/notices/[id].tsx (경로: /notices/{id})
 * 주요 기능:
 * - 공지 상세 조회 및 스켈레톤 로딩, 당겨서 새로고침, 오류+다시 시도 제공
 * - 404(NOT_FOUND) 응답 시 "삭제되었거나 없는 공지입니다." 안내 표시
 * - MarkdownView를 통한 안전한 마크다운 본문 렌더링
 */
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MarkdownView } from '../../../src/features/markdown/markdown-view';
import {
  isNoticeNotFoundError,
  noticesStrings,
  toNoticeErrorMessage,
  useNoticeDetailQuery,
} from '../../../src/features/notices';
import { formatKstDate } from '../../../src/lib/date-kst';
import { theme } from '../../../src/theme';
import {
  AppText,
  Divider,
  ErrorState,
  Screen,
  SkeletonList,
  useRefresh,
} from '../../../src/ui';

export default function NoticeDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const query = useNoticeDetailQuery(params.id);
  const { refreshing, onRefresh } = useRefresh(() => query.refetch());

  if (!query.noticeId) {
    return (
      <Screen centered padding="md" edges={['bottom', 'left', 'right']}>
        <ErrorState
          testID="notice-detail-not-found"
          message={noticesStrings.notFoundMessage}
        />
      </Screen>
    );
  }

  if (query.isPending) {
    return (
      <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
        <SkeletonList count={2} testID="notice-detail-skeleton" />
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    const isNotFound = isNoticeNotFoundError(query.error);
    const errorMessage = query.isError
      ? toNoticeErrorMessage(query.error, 'detail')
      : noticesStrings.notFoundMessage;

    return (
      <Screen
        scroll
        centered
        padding="md"
        edges={['bottom', 'left', 'right']}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      >
        <ErrorState
          testID={isNotFound ? 'notice-detail-not-found' : 'notice-detail-error'}
          message={errorMessage}
          onRetry={isNotFound ? undefined : () => void query.refetch()}
        />
      </Screen>
    );
  }

  const notice = query.data;
  const createdDateText = noticesStrings.formatCreatedDate(
    formatKstDate(notice.createdAt),
  );
  const viewCountText = noticesStrings.formatViewCount(notice.viewCount);

  return (
    <Screen
      scroll
      padding="md"
      edges={['bottom', 'left', 'right']}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <View style={styles.headerBlock}>
        <AppText variant="title" selectable>
          {notice.title}
        </AppText>
        <View style={styles.metaRow}>
          <AppText variant="bodySmall" tone="secondary">
            {createdDateText}
          </AppText>
          <AppText variant="bodySmall" tone="secondary">
            ·
          </AppText>
          <AppText variant="bodySmall" tone="secondary">
            {viewCountText}
          </AppText>
        </View>
      </View>
      <Divider spacing="sm" />
      <View testID="notice-detail-body" style={styles.bodyContainer}>
        <MarkdownView source={notice.content} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  bodyContainer: {
    paddingBottom: theme.spacing.xl,
  },
});
