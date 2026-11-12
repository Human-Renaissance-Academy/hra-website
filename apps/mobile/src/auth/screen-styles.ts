/**
 * 역할: 인증 화면(로그인, 승인 대기, 세션 재확인)에서 공유하는 폼·레이아웃 스타일 정의
 * 사용 위치: src/auth/login-screen.tsx, src/auth/pending-screen.tsx, src/auth/session-notice.tsx
 * 주요 기능:
 * - 디자인 토큰(theme) 기반 입력창, 보조 토글 버튼, 배너 래퍼 및 48dp 최소 터치 영역 정의
 */
import { StyleSheet } from 'react-native';
import { theme } from '../theme';

export const authStyles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  title: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  text: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  secondary: {
    ...theme.typography.body,
    color: theme.colors.secondary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.s3,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
  },
  button: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
  },
  buttonText: {
    ...theme.typography.body,
    color: theme.colors.onBrand,
    fontWeight: '600',
  },
  secondaryButton: {
    minHeight: theme.touchTarget.minHeight,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  noticeWrapper: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  disabled: {
    backgroundColor: theme.colors.secondary,
  },
  pressed: {
    opacity: 0.8,
  },
});
