/**
 * 역할: 섹션 제목과 선택적 전체 보기/이동 액션 링크를 배치하는 섹션 헤더 컴포넌트
 * 사용 위치: 홈 화면(다가오는 일정, 최근 공지, 내 과제), 일정 월별 구획, 내 정보 섹션
 * 주요 기능:
 * - 제목에 보조기술용 header 역할 자동 부여
 * - 우측 액션 버튼 제공 시 최소 48dp 터치 영역 및 브랜드 색상/화살표 아이콘 적용
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Icon } from './icon';

export interface SectionHeaderProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly actionLabel?: string | undefined;
  readonly onActionPress?: (() => void) | undefined;
  readonly actionAccessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 화면 내 구획 제목과 선택적 더보기 액션을 표시하는 헤더입니다. */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  actionAccessibilityLabel,
  testID,
  style,
}: SectionHeaderProps) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.titleBlock}>
        <AppText variant="subheading" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          hitSlop={theme.touchTarget.hitSlop}
          android_ripple={{ color: theme.colors.ripple }}
          onPress={onActionPress}
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressed : null]}
        >
          <AppText variant="label" tone="brand">
            {actionLabel}
          </AppText>
          <Icon name="chevron-forward" size={16} color={theme.colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  titleBlock: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  actionButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  pressed: {
    opacity: 0.75,
  },
});
