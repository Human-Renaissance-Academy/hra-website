/**
 * 역할: 목록이나 섹션에 표시할 데이터가 없을 때 안내 문구와 선택적 액션을 보여주는 빈 상태 컴포넌트
 * 사용 위치: 공지 목록, 월별 일정, 자료실, 내 과제 목록의 빈 데이터 상태
 * 주요 기능:
 * - 아이콘, 한국어 기본 제목(ko.ui.emptyTitle), 상세 설명(description) 표시
 * - 선택적 보조 액션 버튼(actionLabel + onActionPress) 지원
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ko } from '../i18n/ko';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import type { IconName } from './icon';

export interface EmptyStateProps {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly icon?: IconName | undefined;
  readonly actionLabel?: string | undefined;
  readonly onActionPress?: (() => void) | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 데이터가 비어 있을 때 차분하고 명확한 한국어 안내를 제공하는 빈 상태 컴포넌트입니다. */
export function EmptyState({
  title = ko.ui.emptyTitle,
  description,
  icon = 'folder-open-outline',
  actionLabel,
  onActionPress,
  testID,
  style,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.iconBadge}>
        <Icon name={icon} size={28} color={theme.colors.secondary} />
      </View>
      <AppText variant="subheading" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="bodySmall" tone="secondary" align="center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onActionPress ? (
        <Button
          variant="secondary"
          size="md"
          label={actionLabel}
          onPress={onActionPress}
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  actionButton: {
    marginTop: theme.spacing.sm,
  },
});
