/**
 * 역할: 공지 목록 상단의 검색어 입력창(100자 상한, 키보드 검색 액션, 지우기 버튼) 컴포넌트
 * 사용 위치: app/(app)/(tabs)/notices.tsx
 * 주요 기능:
 * - 최대 100자 입력 제한(maxLength=100) 및 returnKeyType="search" 키보드 검색 이벤트 연결
 * - 입력값이 있을 때 48dp 터치 영역을 보장하는 '검색어 지우기' 버튼 노출
 */
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { theme } from '../../../theme';
import { Icon } from '../../../ui';
import { MAX_NOTICE_QUERY_LENGTH } from '../notices-core';
import { noticesStrings } from '../strings';

export interface NoticeSearchBarProps {
  readonly value: string;
  readonly onChangeText: (nextText: string) => void;
  readonly onSubmitSearch: () => void;
  readonly onClearSearch: () => void;
}

/** 공지 제목 검색을 위한 접근 가능한 검색 바 컴포넌트입니다. */
export function NoticeSearchBar({
  value,
  onChangeText,
  onSubmitSearch,
  onClearSearch,
}: NoticeSearchBarProps) {
  return (
    <View style={styles.searchBox}>
      <View style={styles.leadingIconWrapper}>
        <Icon name="search" size={20} color={theme.colors.secondary} />
      </View>
      <TextInput
        testID="notices-search-input"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitSearch}
        placeholder={noticesStrings.searchPlaceholder}
        placeholderTextColor={theme.colors.secondary}
        accessibilityLabel={noticesStrings.searchInputA11yLabel}
        returnKeyType="search"
        maxLength={MAX_NOTICE_QUERY_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        maxFontSizeMultiplier={theme.maxFontSizeMultiplier}
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          testID="notices-search-clear"
          accessibilityRole="button"
          accessibilityLabel={noticesStrings.clearSearchA11yLabel}
          hitSlop={theme.touchTarget.hitSlop}
          android_ripple={{ color: theme.colors.ripple, borderless: true }}
          onPress={onClearSearch}
          style={({ pressed }) => [
            styles.clearButton,
            pressed ? styles.clearButtonPressed : null,
          ]}
        >
          <Icon name="close-circle" size={20} color={theme.colors.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.touchTarget.minHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    paddingLeft: theme.spacing.s3,
    paddingRight: theme.spacing.xs,
  },
  leadingIconWrapper: {
    marginRight: theme.spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: theme.touchTarget.minHeight,
    color: theme.colors.text,
    fontSize: theme.typography.body.fontSize,
    lineHeight: theme.typography.body.lineHeight,
    paddingVertical: theme.spacing.sm,
  },
  clearButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonPressed: {
    opacity: 0.72,
  },
});
