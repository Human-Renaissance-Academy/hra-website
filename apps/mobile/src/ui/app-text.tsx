/**
 * 역할: 한국어 가독성(행간 >= 1.4x)과 시스템 글꼴 확대 상한을 보장하는 공통 텍스트 컴포넌트
 * 사용 위치: 모든 화면 및 src/ui 내부 컴포넌트의 문자열 표시
 * 주요 기능:
 * - 디자인 토큰의 타이포그래피 변형(title, heading, subheading, body, bodySmall, caption, label) 적용
 * - 의미론적 색상 톤(primary, secondary, brand, success, warning, danger, info, onBrand) 지원
 * - title/heading 변형 시 기본 accessibilityRole="header" 자동 부여 및 maxFontSizeMultiplier(기본 1.6) 적용
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { theme } from '../theme';
import type { TypographyVariant } from '../theme';

export type AppTextTone =
  | 'primary'
  | 'secondary'
  | 'brand'
  | 'brandText'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'onBrand';

export interface AppTextProps extends TextProps {
  readonly children?: ReactNode | undefined;
  readonly variant?: TypographyVariant | undefined;
  readonly tone?: AppTextTone | undefined;
  readonly weight?: TextStyle['fontWeight'] | undefined;
  readonly align?: TextStyle['textAlign'] | undefined;
  readonly style?: StyleProp<TextStyle> | undefined;
}

const toneColors: Readonly<Record<AppTextTone, string>> = {
  primary: theme.colors.text,
  secondary: theme.colors.secondary,
  brand: theme.colors.brand,
  brandText: theme.colors.brandText,
  success: theme.colors.success,
  warning: theme.colors.warning,
  danger: theme.colors.danger,
  info: theme.colors.info,
  onBrand: theme.colors.onBrand,
};

/** 앱 전역에서 사용하는 한국어 타이포그래피 컴포넌트입니다. */
export function AppText({
  children,
  variant = 'body',
  tone = 'primary',
  weight,
  align,
  maxFontSizeMultiplier = theme.maxFontSizeMultiplier,
  accessibilityRole,
  style,
  ...rest
}: AppTextProps) {
  const defaultRole = variant === 'title' || variant === 'heading' ? 'header' : undefined;
  const resolvedRole = accessibilityRole ?? defaultRole;

  return (
    <Text
      accessibilityRole={resolvedRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        variantStyles[variant],
        { color: toneColors[tone] },
        weight ? { fontWeight: weight } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const variantStyles = StyleSheet.create({
  title: theme.typography.title,
  heading: theme.typography.heading,
  subheading: theme.typography.subheading,
  body: theme.typography.body,
  bodySmall: theme.typography.bodySmall,
  caption: theme.typography.caption,
  label: theme.typography.label,
});
