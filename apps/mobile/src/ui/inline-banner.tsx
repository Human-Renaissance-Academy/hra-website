/**
 * 역할: 화면 상단 또는 폼 내부에서 상태 안내·주의·오류를 알리는 인라인 배너(InlineBanner) 컴포넌트
 * 사용 위치: 세션 재확인 배너(SessionNotice), 로그인 오류/대기 안내, 오프라인/제출 주의 안내
 * 주요 기능:
 * - 세 가지 톤(info, warning, danger)별 WCAG AA 충족 배경·텍스트·아이콘 색상 제공
 * - 보조기술용 alert 역할 및 최대 2개의 인라인 액션 버튼(재시도, 로그아웃 등) 지원
 */
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import { AppText } from './app-text';
import type { AppTextTone } from './app-text';
import { Icon } from './icon';
import type { IconName } from './icon';

export type InlineBannerTone = 'info' | 'warning' | 'danger';

export interface InlineBannerAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

export interface InlineBannerProps {
  readonly message: string;
  readonly title?: string | undefined;
  readonly tone?: InlineBannerTone | undefined;
  readonly actionLabel?: string | undefined;
  readonly onActionPress?: (() => void) | undefined;
  readonly actionDisabled?: boolean | undefined;
  readonly secondaryActionLabel?: string | undefined;
  readonly onSecondaryActionPress?: (() => void) | undefined;
  readonly actions?: readonly InlineBannerAction[] | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

const bannerConfig: Readonly<
  Record<
    InlineBannerTone,
    {
      readonly backgroundColor: string;
      readonly borderColor: string;
      readonly iconColor: string;
      readonly textTone: AppTextTone;
      readonly icon: IconName;
    }
  >
> = {
  info: {
    backgroundColor: theme.colors.infoSoft,
    borderColor: theme.colors.info,
    iconColor: theme.colors.info,
    textTone: 'info',
    icon: 'information-circle-outline',
  },
  warning: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.warning,
    iconColor: theme.colors.warning,
    textTone: 'warning',
    icon: 'warning-outline',
  },
  danger: {
    backgroundColor: theme.colors.dangerSoft,
    borderColor: theme.colors.danger,
    iconColor: theme.colors.danger,
    textTone: 'danger',
    icon: 'alert-circle-outline',
  },
};

/** 화면 흐름을 막지 않고 주요 상태나 경고를 알리는 인라인 배너입니다. */
export function InlineBanner({
  message,
  title,
  tone = 'info',
  actionLabel,
  onActionPress,
  actionDisabled = false,
  secondaryActionLabel,
  onSecondaryActionPress,
  actions,
  testID,
  style,
}: InlineBannerProps) {
  const config = bannerConfig[tone];
  const resolvedActions: InlineBannerAction[] = [
    ...(actions ?? []),
    ...(actionLabel && onActionPress
      ? [{ label: actionLabel, onPress: onActionPress, disabled: actionDisabled }]
      : []),
    ...(secondaryActionLabel && onSecondaryActionPress
      ? [{ label: secondaryActionLabel, onPress: onSecondaryActionPress }]
      : []),
  ];

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <Icon name={config.icon} size={20} color={config.iconColor} style={styles.icon} />
        <View style={styles.textWrap}>
          {title ? (
            <AppText variant="label" tone={config.textTone}>
              {title}
            </AppText>
          ) : null}
          <AppText
            variant="bodySmall"
            tone={config.textTone}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {message}
          </AppText>
        </View>
      </View>
      {resolvedActions.length > 0 ? (
        <View style={styles.actionsRow}>
          {resolvedActions.map((action) => (
            <Pressable
              key={action.label}
              testID={action.testID}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: Boolean(action.disabled) }}
              disabled={action.disabled}
              android_ripple={{ color: theme.colors.ripple }}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.actionButton,
                action.disabled ? styles.actionDisabled : null,
                pressed && !action.disabled ? styles.actionPressed : null,
              ]}
            >
              <AppText variant="label" tone={config.textTone}>
                {action.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  icon: {
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  actionButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.s3,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionPressed: {
    opacity: 0.75,
  },
});
