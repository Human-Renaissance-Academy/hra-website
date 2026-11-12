/**
 * 역할: 아이콘, 제목, 부제목, 우측 메타 텍스트 및 이동 화살표(chevron)를 포함한 표준 목록 행 컴포넌트
 * 사용 위치: 내 정보 메뉴 행(내 과제, 앱 버전, 로그아웃 등), 자료실 목록, 일정/과제 요약 행
 * 주요 기능:
 * - 선행 아이콘(leadingIcon), 제목(title), 부제목(subtitle), 메타 정보(meta), 화살표(chevron) 조합
 * - onPress 전달 시 최소 48dp 터치 영역, Android 물결 효과, 버튼 접근성 역할 부여
 * - 위험 동작(tone="danger") 시 텍스트와 아이콘에 경고 색상 적용
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Icon } from './icon';
import type { IconName } from './icon';

export interface ListRowProps {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly meta?: string | undefined;
  readonly leadingIcon?: IconName | undefined;
  readonly trailing?: ReactNode | undefined;
  readonly showChevron?: boolean | undefined;
  readonly tone?: 'default' | 'danger' | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 목록 및 설정 화면에서 반복 사용되는 48dp 이상 높이의 표준 행 컴포넌트입니다. */
export function ListRow({
  title,
  subtitle,
  meta,
  leadingIcon,
  trailing,
  showChevron,
  tone = 'default',
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ListRowProps) {
  const isInteractive = Boolean(onPress);
  const displayChevron = showChevron ?? isInteractive;
  const isDanger = tone === 'danger';
  const iconColor = isDanger ? theme.colors.danger : theme.colors.secondary;
  const computedA11yLabel =
    accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(', ');

  const content = (
    <>
      {leadingIcon ? (
        <View style={styles.leadingWrap}>
          <Icon name={leadingIcon} size={22} color={iconColor} />
        </View>
      ) : null}
      <View style={styles.textColumn}>
        <AppText
          variant="body"
          weight="600"
          tone={isDanger ? 'danger' : 'primary'}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" tone="secondary">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.trailingWrap}>
        {meta ? (
          <AppText variant="bodySmall" tone="secondary">
            {meta}
          </AppText>
        ) : null}
        {trailing}
        {displayChevron ? (
          <Icon name="chevron-forward" size={18} color={theme.colors.secondary} />
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={computedA11yLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        android_ripple={{ color: theme.colors.ripple }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} accessibilityLabel={computedA11yLabel} style={[styles.row, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s3,
    paddingVertical: theme.spacing.s3,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  leadingWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  trailingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pressed: {
    backgroundColor: theme.colors.surface,
  },
  disabled: {
    opacity: 0.55,
  },
});
