/**
 * 역할: API/네트워크 오류 발생 시 정형화된 한국어 오류 문구와 '다시 시도' 버튼을 표시하는 오류 상태 컴포넌트
 * 사용 위치: 홈 섹션, 공지, 일정, 자료실, 내 과제 등 모든 데이터 조회 실패 화면
 * 주요 기능:
 * - 보조기술 즉시 알림을 위한 accessibilityRole="alert" 및 accessibilityLiveRegion="polite" 설정
 * - onRetry 전달 시 한국어 '다시 시도'(ko.ui.retry) 버튼 렌더링 및 로딩 상태 연동
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ko } from '../i18n/ko';
import { theme } from '../theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import type { IconName } from './icon';

export interface ErrorStateProps {
  readonly message: string;
  readonly title?: string | undefined;
  readonly retryLabel?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly retrying?: boolean | undefined;
  readonly icon?: IconName | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 한국어 오류 안내와 재시도 동작을 일관되게 제공하는 오류 상태 컴포넌트입니다. */
export function ErrorState({
  message,
  title = ko.ui.errorTitle,
  retryLabel = ko.ui.retry,
  onRetry,
  retrying = false,
  icon = 'alert-circle-outline',
  testID,
  style,
}: ErrorStateProps) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.iconBadge}>
        <Icon name={icon} size={28} color={theme.colors.danger} />
      </View>
      <AppText variant="subheading" align="center">
        {title}
      </AppText>
      <AppText
        variant="body"
        tone="secondary"
        align="center"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {message}
      </AppText>
      {onRetry ? (
        <Button
          variant="secondary"
          size="md"
          label={retryLabel}
          loading={retrying}
          onPress={onRetry}
          leadingIcon="refresh"
          style={styles.retryButton}
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
    backgroundColor: theme.colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  retryButton: {
    marginTop: theme.spacing.sm,
  },
});
