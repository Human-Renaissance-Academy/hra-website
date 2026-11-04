/**
 * 역할: 섹션 또는 목록 행 사이를 시각적으로 구분하는 1dp 구분선(Divider) 컴포넌트
 * 사용 위치: 카드 내부, 내 정보 설정 목록, 공지/과제 상세 본문 구분
 * 주요 기능:
 * - 웹과 동일한 테두리 토큰(theme.colors.border, #D9D9D9) 적용
 * - 선택적 상하 여백(spacing) 및 좌우 들여쓰기(inset) 지원
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { theme } from '../theme';
import type { SpacingToken } from '../theme';

export interface DividerProps {
  readonly spacing?: SpacingToken | undefined;
  readonly inset?: SpacingToken | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 화면과 카드 내부 항목을 나누는 수평 구분선입니다. */
export function Divider({ spacing, inset, testID, style }: DividerProps) {
  return (
    <View
      testID={testID}
      importantForAccessibility="no"
      style={[
        styles.line,
        spacing ? { marginVertical: theme.spacing[spacing] } : null,
        inset ? { marginHorizontal: theme.spacing[inset] } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  line: {
    height: 1,
    width: '100%',
    backgroundColor: theme.colors.border,
  },
});
