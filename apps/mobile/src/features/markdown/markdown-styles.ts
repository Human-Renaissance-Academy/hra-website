/**
 * 역할: MarkdownView에서 사용하는 디자인 토큰 기반 스타일시트 정의
 * 사용 위치: src/features/markdown/markdown-view.tsx, markdown-inline-view.tsx
 * 주요 기능:
 * - 디자인 토큰(theme.colors, theme.spacing, theme.radius, theme.typography) 기반 마크다운 스타일 제공
 * - 코드 블록, 인용문, 목록, 이미지 컨테이너, 가로 스크롤 GFM 표 레이아웃 스타일 정의
 */
import { Platform, StyleSheet } from 'react-native';
import { theme } from '../../theme';

export const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const markdownStyles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  inlineFlowContainer: {
    gap: theme.spacing.sm,
  },
  headingBox: {
    marginTop: theme.spacing.xs,
  },
  headingLevel2Box: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  strong: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  emphasis: {
    fontStyle: 'italic',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  inlineCode: {
    fontFamily: MONOSPACE_FONT,
    fontSize: theme.typography.bodySmall.fontSize,
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.brandText,
  },
  link: {
    color: theme.colors.brand,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  inlineImageAlt: {
    color: theme.colors.secondary,
  },
  codeBlockContainer: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  codeBlockText: {
    fontFamily: MONOSPACE_FONT,
    color: theme.colors.text,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.s3,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    gap: theme.spacing.sm,
  },
  listContainer: {
    gap: theme.spacing.sm,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  listMarker: {
    minWidth: theme.spacing.md,
  },
  listItemContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  imageContainer: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: theme.radius.sm,
  },
  imageFallbackBox: {
    padding: theme.spacing.s3,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  table: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  tableHeaderRow: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    minWidth: 120,
    maxWidth: 280,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.s3,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    justifyContent: 'center',
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
});
