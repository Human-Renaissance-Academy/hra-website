/**
 * 역할: 공지 목록의 개별 공지 요약 카드(고정 배지, 제목, 발췌문, KST 날짜, 조회수) 컴포넌트
 * 사용 위치: app/(app)/(tabs)/notices.tsx
 * 주요 기능:
 * - 고정 공지일 때 브랜드 톤의 '고정' Chip 배지 표시
 * - formatKstDate로 변환한 한국 달력 날짜와 조회수 메타 정보 표시
 * - 48dp 이상의 터치 영역과 보조기술용 통합 접근성 레이블 제공
 */
import { StyleSheet, View } from 'react-native';
import { formatKstDate } from '../../../lib/date-kst';
import { theme } from '../../../theme';
import { AppText, Card, Chip } from '../../../ui';
import type { NoticeSummary } from '../notices-core';
import { noticesStrings } from '../strings';

export interface NoticeCardProps {
  readonly notice: NoticeSummary;
  readonly onPress: (noticeId: string) => void;
}

/** 공지 목록의 단일 행을 표시하는 터치형 카드 컴포넌트입니다. */
export function NoticeCard({ notice, onPress }: NoticeCardProps) {
  const dateText = formatKstDate(notice.createdAt);
  const viewCountText = noticesStrings.formatViewCount(notice.viewCount);
  const excerptText = notice.excerpt.trim();
  const cardA11yLabel = noticesStrings.formatCardA11yLabel({
    pinned: notice.pinned,
    title: notice.title,
    dateText,
    viewCount: notice.viewCount,
  });

  return (
    <Card
      testID={`notice-card-${notice.id}`}
      variant="elevated"
      padding="md"
      accessibilityLabel={cardA11yLabel}
      onPress={() => onPress(notice.id)}
      style={styles.card}
    >
      <View style={styles.content}>
        {notice.pinned ? (
          <Chip
            testID={`notice-pinned-${notice.id}`}
            label={noticesStrings.pinnedBadge}
            tone="brand"
            icon="pin"
          />
        ) : null}
        <AppText variant="subheading" numberOfLines={2}>
          {notice.title}
        </AppText>
        {excerptText ? (
          <AppText variant="bodySmall" tone="secondary" numberOfLines={2}>
            {excerptText}
          </AppText>
        ) : null}
        <View style={styles.metaRow}>
          <AppText variant="caption" tone="secondary">
            {dateText}
          </AppText>
          <AppText variant="caption" tone="secondary">
            ·
          </AppText>
          <AppText variant="caption" tone="secondary">
            {viewCountText}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  content: {
    gap: theme.spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
});
