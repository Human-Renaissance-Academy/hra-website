/**
 * 역할: 가이드북 목록의 개별 행(문서 아이콘, 제목, 우측 상태 표시기)과 다운로드 진행/취소/오류 UI 렌더링
 * 사용 위치: src/features/resources/resources-screen.tsx
 * 주요 기능:
 * - ListRow 기반으로 문서 아이콘('document-text-outline'), 가이드북 제목, 상태별 부제목 및 우측 상태 배지(Chip) 표시
 * - downloading 상태에서 퍼센트(Content-Length 확인 시) 또는 불확정 진행 안내와 48dp '취소' 버튼 렌더링
 * - error 상태에서 인라인 한국어 오류 메시지 배너와 '다시 시도' 액션 제공
 */
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { theme } from '../../../theme';
import { AppText, Button, Card, Chip, InlineBanner, ListRow } from '../../../ui';
import type { DownloadState, GuidebookSummary } from '../download-state';
import { isDownloadBusy } from '../download-state';
import { resourcesStrings } from '../strings';

export interface GuidebookRowProps {
  readonly item: GuidebookSummary;
  readonly state: DownloadState;
  readonly onPress: (item: GuidebookSummary) => void;
  readonly onCancel: (id: string) => void;
}

function resolveSubtitle(state: DownloadState): string {
  switch (state.status) {
    case 'idle':
      return resourcesStrings.list.documentSubtitle;
    case 'downloading':
      return state.progress.percentage !== null
        ? resourcesStrings.download.downloadingPercentage(state.progress.percentage)
        : resourcesStrings.download.downloadingIndeterminate;
    case 'opening':
      return resourcesStrings.download.opening;
    case 'done':
      return resourcesStrings.download.done;
    case 'cancelled':
      return resourcesStrings.download.cancelled;
    case 'error':
      return resourcesStrings.list.documentSubtitle;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

function renderTrailingIndicator(state: DownloadState) {
  switch (state.status) {
    case 'idle':
      return <Chip label={resourcesStrings.download.idleAction} tone="brand" icon="download-outline" />;
    case 'downloading':
      return (
        <View style={styles.progressIndicator}>
          <ActivityIndicator size="small" color={theme.colors.brand} />
          {state.progress.percentage !== null ? (
            <AppText variant="label" tone="brand">
              {`${state.progress.percentage}%`}
            </AppText>
          ) : null}
        </View>
      );
    case 'opening':
      return (
        <View style={styles.progressIndicator}>
          <ActivityIndicator size="small" color={theme.colors.brand} />
          <Chip label={resourcesStrings.download.opening} tone="brand" />
        </View>
      );
    case 'done':
      return <Chip label={resourcesStrings.download.done} tone="success" icon="checkmark-circle" />;
    case 'cancelled':
      return <Chip label={resourcesStrings.download.cancelled} tone="neutral" />;
    case 'error':
      return <Chip label={resourcesStrings.download.retryAction} tone="danger" icon="refresh" />;
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

/** 가이드북 항목 하나와 그에 따른 다운로드 진행률·취소·오류 상태를 표시하는 카드 행입니다. */
export function GuidebookRow({ item, state, onPress, onCancel }: GuidebookRowProps) {
  const busy = isDownloadBusy(state);
  const subtitle = resolveSubtitle(state);

  return (
    <Card variant="outlined" padding="none" testID={`guidebook-card-${item.id}`}>
      <ListRow
        testID={`guidebook-row-${item.id}`}
        leadingIcon="document-text-outline"
        title={item.title}
        subtitle={subtitle}
        trailing={renderTrailingIndicator(state)}
        showChevron={!busy}
        accessibilityLabel={`${item.title}, ${subtitle}`}
        accessibilityHint={resourcesStrings.list.itemA11yHint}
        onPress={() => onPress(item)}
      />

      {state.status === 'downloading' ? (
        <View style={styles.downloadingFooter} testID={`guidebook-downloading-${item.id}`}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width:
                    state.progress.percentage !== null
                      ? `${state.progress.percentage}%`
                      : '40%',
                },
              ]}
            />
          </View>
          <Button
            testID={`guidebook-cancel-${item.id}`}
            variant="secondary"
            size="sm"
            label={resourcesStrings.download.cancelAction}
            accessibilityLabel={resourcesStrings.download.cancelA11yLabel(item.title)}
            onPress={() => onCancel(item.id)}
          />
        </View>
      ) : null}

      {state.status === 'error' ? (
        <View style={styles.bannerWrap}>
          <InlineBanner
            testID={`guidebook-error-${item.id}`}
            tone="danger"
            message={state.message}
            actionLabel={resourcesStrings.download.retryAction}
            onActionPress={() => onPress(item)}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  progressIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  downloadingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.s3,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  progressTrack: {
    flex: 1,
    height: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brand,
  },
  bannerWrap: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.s3,
  },
});
