/**
 * 역할: @expo/vector-icons/Ionicons 위에 구축된 타입 안전 아이콘 래퍼 컴포넌트
 * 사용 위치: 탭 바, 버튼, 목록 행(ListRow), 배너(InlineBanner), 빈/오류 상태 화면
 * 주요 기능:
 * - 앱에서 허용된 아이콘 이름(IconName) 유니온 타입 강제
 * - 접근성 레이블 유무에 따라 장식용 아이콘 숨김 처리(importantForAccessibility / accessibilityElementsHidden)
 */
import type { ColorValue, StyleProp, TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

export type IconName =
  | 'home'
  | 'home-outline'
  | 'megaphone'
  | 'megaphone-outline'
  | 'calendar'
  | 'calendar-outline'
  | 'folder-open'
  | 'folder-open-outline'
  | 'person'
  | 'person-outline'
  | 'chevron-forward'
  | 'chevron-back'
  | 'chevron-down'
  | 'chevron-up'
  | 'arrow-back'
  | 'arrow-forward'
  | 'close'
  | 'close-circle'
  | 'search'
  | 'refresh'
  | 'open-outline'
  | 'download-outline'
  | 'cloud-upload-outline'
  | 'share-outline'
  | 'document-text'
  | 'document-text-outline'
  | 'document-attach-outline'
  | 'book-outline'
  | 'school-outline'
  | 'clipboard-outline'
  | 'time-outline'
  | 'pin'
  | 'pin-outline'
  | 'checkmark-circle'
  | 'checkmark-circle-outline'
  | 'checkmark'
  | 'alert-circle'
  | 'alert-circle-outline'
  | 'warning'
  | 'warning-outline'
  | 'information-circle'
  | 'information-circle-outline'
  | 'help-circle-outline'
  | 'mail-outline'
  | 'lock-closed-outline'
  | 'eye-outline'
  | 'eye-off-outline'
  | 'log-out-outline'
  | 'shield-checkmark-outline';

export interface IconProps {
  readonly name: IconName;
  readonly size?: number | undefined;
  readonly color?: ColorValue | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<TextStyle> | undefined;
}

/** Ionicons 부분 집합만 허용하는 공통 아이콘 컴포넌트입니다. */
export function Icon({
  name,
  size = 20,
  color = theme.colors.text,
  accessibilityLabel,
  testID,
  style,
}: IconProps) {
  const isDecorative = !accessibilityLabel;
  const resolvedColor =
    typeof color === 'number' || color === null || color === undefined
      ? theme.colors.text
      : color;

  return (
    <Ionicons
      name={name}
      size={size}
      color={resolvedColor}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityElementsHidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'yes'}
      style={style}
    />
  );
}
