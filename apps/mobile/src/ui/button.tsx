/**
 * 역할: 최소 48dp 터치 영역과 로딩·비활성 접근성 상태를 갖춘 공통 버튼 컴포넌트
 * 사용 위치: 로그인, 승인 대기, 오류 재시도, 과제 제출, 내 정보 등 모든 주요/보조 액션
 * 주요 기능:
 * - 변형(primary, secondary, danger, ghost) 및 크기(sm, md, lg), 전체 너비(fullWidth) 지원
 * - 로딩(loading) 시 ActivityIndicator 표시 및 accessibilityState={{ disabled, busy }} 노출
 * - Android Material 물결(android_ripple) 및 iOS 눌림 피드백 동시 제공
 */
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { AccessibilityState, StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Icon } from './icon';
import type { IconName } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly fullWidth?: boolean | undefined;
  readonly loading?: boolean | undefined;
  readonly loadingLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly leadingIcon?: IconName | undefined;
  readonly trailingIcon?: IconName | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly accessibilityState?: AccessibilityState | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 접근성과 Android/iOS 터치 피드백을 모두 갖춘 공통 버튼입니다. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingLabel,
  disabled = false,
  leadingIcon,
  trailingIcon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const displayedLabel = loading && loadingLabel ? loadingLabel : label;
  const isSolid = variant === 'primary' || variant === 'danger';
  const textColor = isSolid ? theme.colors.onBrand : theme.colors.text;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading,
      }}
      disabled={isDisabled}
      hitSlop={theme.touchTarget.hitSlop}
      android_ripple={{
        color: isSolid ? theme.colors.rippleOnDark : theme.colors.ripple,
      }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth ? styles.fullWidth : null,
        isDisabled ? (isSolid ? styles.disabledSolid : styles.disabledOutline) : null,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={textColor}
            testID={testID ? `${testID}-spinner` : 'button-loading-spinner'}
          />
        ) : leadingIcon ? (
          <Icon name={leadingIcon} size={18} color={textColor} />
        ) : null}
        <AppText
          variant={size === 'sm' ? 'label' : 'body'}
          weight="600"
          style={{ color: textColor }}
        >
          {displayedLabel}
        </AppText>
        {!loading && trailingIcon ? (
          <Icon name={trailingIcon} size={18} color={textColor} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  disabledSolid: {
    backgroundColor: theme.colors.secondary,
    borderColor: theme.colors.secondary,
  },
  disabledOutline: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.82,
  },
});

const sizeStyles = StyleSheet.create({
  sm: {
    paddingHorizontal: theme.spacing. s3,
    paddingVertical: theme.spacing.sm,
  },
  md: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.s3,
  },
  lg: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: theme.colors.brand,
  },
  secondary: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
});
