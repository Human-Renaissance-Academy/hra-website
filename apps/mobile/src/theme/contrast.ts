/**
 * 역할: WCAG 2.1 상대 휘도(relative luminance) 및 명암비(contrast ratio) 계산 순수 함수 모듈
 * 사용 위치: src/theme 토큰 검증 및 UI 키트 접근성 명암비 단위 테스트
 * 주요 기능:
 * - #RRGGBB / #RGB 16진수 색상 문자열 파싱
 * - sRGB 감마 보정 기반 상대 휘도 계산
 * - 두 색상 간 명암비 계산 및 WCAG AA(일반 텍스트 4.5:1, 큰 텍스트 3.0:1) 충족 여부 판정
 */

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const WCAG_AA_NORMAL_RATIO = 4.5;
export const WCAG_AA_LARGE_RATIO = 3.0;

/** 16진수 색상 문자열(#RRGGBB 또는 #RGB)을 0~255 RGB 채널 값으로 변환합니다. */
export function parseHexColor(hex: string): RgbColor {
  const normalized = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    const rChar = normalized.charAt(0);
    const gChar = normalized.charAt(1);
    const bChar = normalized.charAt(2);
    return {
      r: Number.parseInt(rChar + rChar, 16),
      g: Number.parseInt(gChar + gChar, 16),
      b: Number.parseInt(bChar + bChar, 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }
  throw new Error(`유효하지 않은 16진수 색상 형식입니다: ${hex}`);
}

/** 단일 sRGB 채널(0~255)을 선형 광도 값으로 변환합니다. */
function channelToLinear(channel: number): number {
  const sRgb = channel / 255;
  return sRgb <= 0.03928 ? sRgb / 12.92 : Math.pow((sRgb + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 공식에 따라 16진수 색상의 상대 휘도(0.0 ~ 1.0)를 계산합니다. */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = parseHexColor(hex);
  const rLin = channelToLinear(r);
  const gLin = channelToLinear(g);
  const bLin = channelToLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/** 전경색과 배경색 사이의 WCAG 2.1 명암비(1.0 ~ 21.0)를 계산합니다. */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const lumA = getRelativeLuminance(foregroundHex);
  const lumB = getRelativeLuminance(backgroundHex);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 전경색과 배경색 조합이 WCAG AA 기준(일반 4.5:1, 대형 3.0:1)을 충족하는지 확인합니다. */
export function meetsWcagAA(
  foregroundHex: string,
  backgroundHex: string,
  level: 'normal' | 'large' = 'normal',
): boolean {
  const minRatio = level === 'large' ? WCAG_AA_LARGE_RATIO : WCAG_AA_NORMAL_RATIO;
  return getContrastRatio(foregroundHex, backgroundHex) >= minRatio;
}
