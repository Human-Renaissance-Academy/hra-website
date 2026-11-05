/**
 * 역할: 내 과제(목록·상세·제출) 스택 네비게이션 레이아웃
 * 사용 위치: app/(app)/assignments/_layout.tsx
 * 주요 기능:
 * - 내 과제 목록(index), 과제 상세([id]), 과제 제출([id]/submit) 화면의 한국어 상단 헤더와 뒤로가기 구성
 * - 디자인 토큰(theme.colors, theme.typography) 기반 헤더 스타일 적용
 */
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { assignmentsStrings } from '../../../src/features/assignments/strings';
import { theme } from '../../../src/theme';

export default function AssignmentsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        headerBackTitle: assignmentsStrings.stack.backLabel,
        contentStyle: styles.content,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: assignmentsStrings.stack.listTitle }}
      />
      <Stack.Screen
        name="[id]"
        options={{ title: assignmentsStrings.stack.detailTitle }}
      />
      <Stack.Screen
        name="[id]/submit"
        options={{ title: assignmentsStrings.stack.submitTitle }}
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
