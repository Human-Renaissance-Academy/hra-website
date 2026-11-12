/** Jest에서 네이티브 글꼴 로딩만 대체하며 아이콘의 접근성·스타일 계약은 유지합니다. */
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import type Ionicons from '@expo/vector-icons/Ionicons';

export function MockIonicons({ name, size, color, style, ...props }: ComponentProps<typeof Ionicons>) {
  return <Text {...props} style={[{ fontSize: size, color }, style]}>{name}</Text>;
}
