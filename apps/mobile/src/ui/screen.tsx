/**
 * 역할: Edge-to-Edge 안전 영역(SafeAreaView), 선택적 스크롤, 키보드 회피, 당겨서 새로고침을 통합한 화면 래퍼
 * 사용 위치: 모든 탭/스택 화면(FlatList 화면은 scroll={false}, 일반/폼 화면은 scroll={true})
 * 주요 기능:
 * - SafeAreaView 인셋 제어(edges 기본값: 상·하·좌·우)
 * - 패딩 프리셋(none, sm, md, lg) 및 수직 중앙 정렬(centered) 옵션
 * - ScrollView 모드에서 RefreshControl(onRefresh + refreshing) 및 KeyboardAvoidingView 지원
 */
import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { RefreshControlProps, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Edge } from 'react-native-safe-area-context';
import { ko } from '../i18n/ko';
import { theme } from '../theme';

export type ScreenPadding = 'none' | 'sm' | 'md' | 'lg';

export interface ScreenProps {
  readonly children?: ReactNode | undefined;
  readonly scroll?: boolean | undefined;
  readonly keyboardAvoiding?: boolean | undefined;
  readonly padding?: ScreenPadding | undefined;
  readonly centered?: boolean | undefined;
  readonly edges?: readonly Edge[] | undefined;
  readonly refreshing?: boolean | undefined;
  readonly onRefresh?: (() => void) | undefined;
  readonly refreshControl?: ReactElement<RefreshControlProps> | undefined;
  readonly backgroundColor?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly contentContainerStyle?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

const defaultEdges: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

/** FlatList 및 ScrollView 화면 모두에서 일관된 여백·안전 영역을 제공하는 최상위 화면 컨테이너입니다. */
export function Screen({
  children,
  scroll = false,
  keyboardAvoiding = false,
  padding = 'md',
  centered = false,
  edges = defaultEdges,
  refreshing = false,
  onRefresh,
  refreshControl,
  backgroundColor = theme.colors.background,
  style,
  contentContainerStyle,
  testID,
}: ScreenProps) {
  const resolvedRefreshControl =
    refreshControl ??
    (onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={theme.colors.brand}
        colors={[theme.colors.brand]}
        title={ko.ui.refreshing}
      />
    ) : undefined);

  const innerContent = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      refreshControl={resolvedRefreshControl}
      contentContainerStyle={[
        styles.scrollContent,
        paddingStyles[padding],
        centered ? styles.centered : null,
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.staticContent,
        paddingStyles[padding],
        centered ? styles.centered : null,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.safeArea, { backgroundColor }, style]}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {innerContent}
        </KeyboardAvoidingView>
      ) : (
        innerContent
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    gap: theme.spacing.md,
  },
  staticContent: {
    flex: 1,
    gap: theme.spacing.md,
  },
  centered: {
    justifyContent: 'center',
  },
});

const paddingStyles = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: theme.spacing.sm },
  md: { padding: theme.spacing.md },
  lg: { padding: theme.spacing.lg },
});
