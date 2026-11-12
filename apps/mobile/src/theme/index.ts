/**
 * 역할: HRA 모바일 디자인 시스템 토큰 및 WCAG 명암비 유틸리티의 단일 진입점
 * 사용 위치: 앱 전역 화면(app/**), 인증 화면(src/auth/**), 공통 UI 키트(src/ui/**)
 * 주요 기능: 색상, 타이포그래피, 4pt 간격, 모서리 반경, 엘리베이션, 터치 영역 상수 및 명암비 계산 함수 재수출
 */
import {
  colors,
  declaredContrastPairs,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  touchTarget,
  typography,
} from './tokens';

export {
  colors,
  declaredContrastPairs,
  elevation,
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  spacing,
  touchTarget,
  typography,
};
export type {
  ContrastPairSpec,
  ElevationToken,
  SpacingToken,
  TypographyVariant,
} from './tokens';
export {
  getContrastRatio,
  getRelativeLuminance,
  meetsWcagAA,
  parseHexColor,
  WCAG_AA_LARGE_RATIO,
  WCAG_AA_NORMAL_RATIO,
} from './contrast';

/** 웹의 브랜드 색상과 모바일 여백·모서리·타이포그래피·그림자·터치 영역 크기 정본입니다. */
export const theme = {
  colors,
  typography,
  maxFontSizeMultiplier: MAX_FONT_SIZE_MULTIPLIER,
  spacing,
  radius,
  elevation,
  touchTarget,
} as const;
