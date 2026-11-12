/**
 * 역할: 상태(제출 완료, 미제출, 마감됨), 분류(수업, 행사), 고정 여부 등을 표시하는 소형 배지(Chip) 컴포넌트
 * 사용 위치: 공지 고정 배지, 일정 구분 칩, 과제 제출 상태 칩, 역할 표시
 * 주요 기능:
 * - 다섯 가지 의미론적 톤(neutral, brand, success, warning, danger) 제공
 * - 모든 톤 조합이 WCAG AA(4.5:1 이상) 명암비를 만족하는 소프트 배경 + 고대비 전경색 사용
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Icon } from './icon';
import type { IconName } from './icon';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface ChipProps {
  readonly label: string;
  readonly tone?: ChipTone | undefined;
  readonly icon?: IconName | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

const chipPalette: Readonly<
  Record<ChipTone, { readonly backgroundColor: string; readonly textColor: string }>
> = {
  neutral: {
    backgroundColor: theme.colors.surfaceMuted,
    textColor: theme.colors.text,
  },
  brand: {
    backgroundColor: theme.colors.brandSoft,
    textColor: theme.colors.brandText,
  },
  success: {
    backgroundColor: theme.colors.successSoft,
    textColor: theme.colors.success,
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
    textColor: theme.colors.warning,
  },
  danger: {
    backgroundColor: theme.colors.dangerSoft,
    textColor: theme.colors.danger,
  },
};

/** 상태나 카테고리를 간결하게 표현하는 고대비 칩 컴포넌트입니다. */
export function Chip({
  label,
  tone = 'neutral',
  icon,
  accessibilityLabel,
  testID,
  style,
}: ChipProps) {
  const palette = chipPalette[tone];
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.container,
        { backgroundColor: palette.backgroundColor },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={14} color={palette.textColor} /> : null}
      <AppText
        variant="caption"
        weight="600"
        style={{ color: palette.textColor }}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
});
