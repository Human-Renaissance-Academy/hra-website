/**
 * 역할: 한국어 다섯 탭(홈, 공지, 일정, 자료실, 내 정보)의 하단 탭 바 및 상단 헤더 레이아웃
 * 사용 위치: app/(app)/(tabs)/_layout.tsx (승인 완료 회원의 기본 탐색 셸)
 * 주요 기능:
 * - 각 탭의 활성/비활성 Ionicons 아이콘, 한국어 제목 및 탭 접근성 레이블(ko.ui.tabA11y) 설정
 * - 웹사이트와 일관된 브랜드 활성 색상(#2563EB)과 정돈된 상단 헤더/하단 탭 스타일 적용
 */
import { StyleSheet } from 'react-native';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { ko } from '../../../src/i18n/ko';
import { theme } from '../../../src/theme';
import { Icon } from '../../../src/ui';
import type { IconName } from '../../../src/ui';

function renderTabIcon(
  activeIcon: IconName,
  inactiveIcon: IconName,
  focused: boolean,
  color: ColorValue,
  size: number,
) {
  return <Icon name={focused ? activeIcon : inactiveIcon} color={color} size={size} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.secondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: ko.tabs.home,
          tabBarAccessibilityLabel: ko.ui.tabA11y.home,
          tabBarIcon: ({ color, focused, size }) =>
            renderTabIcon('home', 'home-outline', focused, color, size),
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: ko.tabs.notices,
          tabBarAccessibilityLabel: ko.ui.tabA11y.notices,
          tabBarIcon: ({ color, focused, size }) =>
            renderTabIcon('megaphone', 'megaphone-outline', focused, color, size),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: ko.tabs.schedule,
          tabBarAccessibilityLabel: ko.ui.tabA11y.schedule,
          tabBarIcon: ({ color, focused, size }) =>
            renderTabIcon('calendar', 'calendar-outline', focused, color, size),
        }}
      />
      <Tabs.Screen
        name="resources"
        options={{
          title: ko.tabs.resources,
          tabBarAccessibilityLabel: ko.ui.tabA11y.resources,
          tabBarIcon: ({ color, focused, size }) =>
            renderTabIcon('folder-open', 'folder-open-outline', focused, color, size),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: ko.tabs.profile,
          tabBarAccessibilityLabel: ko.ui.tabA11y.profile,
          tabBarIcon: ({ color, focused, size }) =>
            renderTabIcon('person', 'person-outline', focused, color, size),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    minHeight: 60,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  tabBarLabel: {
    fontSize: theme.typography.caption.fontSize,
    lineHeight: theme.typography.caption.lineHeight,
    fontWeight: '600',
  },
  header: {
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.subheading.fontSize,
    lineHeight: theme.typography.subheading.lineHeight,
    fontWeight: '700',
  },
});
