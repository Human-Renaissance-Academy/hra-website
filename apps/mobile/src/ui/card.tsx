/**
 * 역할: 콘텐츠 그룹핑 및 선택적 터치 액션(Android 물결 효과 포함)을 제공하는 카드 컨테이너
 * 사용 위치: 홈 요약 카드, 공지/일정/과제 목록 아이템, 프로필 요약 영역
 * 주요 기능:
 * - 변형(elevated, outlined, subtle) 및 내부 패딩(none, sm, md, lg) 지원
 * - onPress 전달 시 Pressable로 렌더링하며 최소 48dp 터치 높이와 Android 물결(ripple) 효과 적용
 * - onPress 미전달 시 순수 View 컨테이너로 렌더링
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';

export type CardVariant = 'elevated' | 'outlined' | 'subtle';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  readonly children?: ReactNode | undefined;
  readonly variant?: CardVariant | undefined;
  readonly padding?: CardPadding | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 정적 컨테이너와 터치형 카드를 모두 지원하는 공통 카드 컴포넌트입니다. */
export function Card({
  children,
  variant = 'outlined',
  padding = 'md',
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const containerStyles: StyleProp<ViewStyle> = [
    styles.base,
    variantStyles[variant],
    paddingStyles[padding],
    onPress ? styles.pressableMinTarget : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        android_ripple={{ color: theme.colors.ripple }}
        onPress={onPress}
        style={({ pressed }) => [
          containerStyles,
          pressed && !disabled ? styles.pressed : null,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} accessibilityLabel={accessibilityLabel} style={containerStyles}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  pressableMinTarget: {
    minHeight: theme.touchTarget.minHeight,
  },
  pressed: {
    opacity: 0.88,
  },
});

const variantStyles = StyleSheet.create({
  elevated: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.elevation.sm,
  },
  outlined: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  subtle: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});

const paddingStyles = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: theme.spacing.s3 },
  md: { padding: theme.spacing.md },
  lg: { padding: theme.spacing.lg },
});
