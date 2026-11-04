/**
 * 역할: 공지 상세(/notices/[id]) 스택 네비게이션 헤더 레이아웃
 * 사용 위치: app/(app)/notices/_layout.tsx
 * 주요 기능:
 * - 공지 상세 화면의 한국어 상단 헤더('공지 상세') 및 뒤로가기 버튼 스타일 구성
 * - 디자인 토큰(theme.colors, theme.typography) 기반 일관된 헤더 적용
 */
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { noticesStrings } from '../../../src/features/notices';
import { theme } from '../../../src/theme';

export default function NoticesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        headerBackTitle: noticesStrings.headerTitle,
        contentStyle: styles.content,
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{ title: noticesStrings.detailHeaderTitle }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: theme.colors.background,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.subheading.fontSize,
    lineHeight: theme.typography.subheading.lineHeight,
    fontWeight: '700',
  },
  content: {
    backgroundColor: theme.colors.background,
  },
});
