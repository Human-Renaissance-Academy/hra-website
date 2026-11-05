/**
 * 역할: 데이터 로딩 중 레이아웃 이동을 방지하는 스켈레톤(Skeleton) 및 목록형 스켈레톤(SkeletonList) 컴포넌트
 * 사용 위치: 홈 카드, 공지 목록, 일정, 자료실, 과제 목록/상세의 초기 로딩 상태
 * 주요 기능:
 * - AccessibilityInfo.isReduceMotionEnabled() 및 변경 이벤트를 구독해 동작 줄이기 설정 준수
 * - 동작 줄이기 활성화 시 애니메이션 루프를 실행하지 않고 고정 불투명도 유지
 */
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  useAnimatedValue,
  View,
} from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { ko } from '../i18n/ko';
import { theme } from '../theme';
import type { radius as radiusTokens } from '../theme';

export interface SkeletonProps {
  readonly width?: DimensionValue | undefined;
  readonly height?: number | undefined;
  readonly radius?: keyof typeof radiusTokens | number | undefined;
  readonly reduceMotion?: boolean | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 시스템 동작 줄이기(reduced motion) 설정을 자동으로 감지하는 내부 훅입니다. */
export function useReducedMotion(override?: boolean): boolean {
  const [systemReduceMotion, setSystemReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    if (override !== undefined) return;
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setSystemReduceMotion(Boolean(enabled));
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        if (active) setSystemReduceMotion(Boolean(enabled));
      },
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [override]);

  return override ?? systemReduceMotion;
}

/** 단일 영역의 로딩 자리표시자를 그리는 스켈레톤 컴포넌트입니다. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'md',
  reduceMotion: reduceMotionProp,
  testID,
  style,
}: SkeletonProps) {
  const reduceMotion = useReducedMotion(reduceMotionProp);
  const opacity = useAnimatedValue(reduceMotion ? 0.75 : 0.45);

  useEffect(() => {
    if (reduceMotion) {
      opacity.stopAnimation();
      opacity.setValue(0.75);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => {
      pulse.stop();
    };
  }, [opacity, reduceMotion]);

  const borderRadius = typeof radius === 'number' ? radius : theme.radius[radius];

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

export interface SkeletonListProps {
  readonly count?: number | undefined;
  readonly itemHeight?: number | undefined;
  readonly reduceMotion?: boolean | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** 목록 화면 로딩 시 여러 개의 카드 형태 스켈레톤을 표시하는 컴포넌트입니다. */
export function SkeletonList({
  count = 3,
  itemHeight = 84,
  reduceMotion,
  accessibilityLabel = ko.ui.loading,
  testID,
  style,
}: SkeletonListProps) {
  const safeCount = Math.max(1, count);
  const items = Array.from({ length: safeCount }, (_, index) => index);

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      style={[styles.list, style]}
    >
      {items.map((index) => (
        <View
          key={index}
          style={[styles.cardPlaceholder, { minHeight: itemHeight }]}
        >
          <Skeleton
            width="35%"
            height={14}
            radius="sm"
            reduceMotion={reduceMotion}
            testID={testID ? `${testID}-line-title-${index}` : undefined}
          />
          <Skeleton
            width="85%"
            height={18}
            radius="sm"
            reduceMotion={reduceMotion}
            testID={testID ? `${testID}-line-body-${index}` : undefined}
          />
          <Skeleton
            width="55%"
            height={14}
            radius="sm"
            reduceMotion={reduceMotion}
            testID={testID ? `${testID}-line-meta-${index}` : undefined}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  list: {
    gap: theme.spacing.s3,
  },
  cardPlaceholder: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
});
