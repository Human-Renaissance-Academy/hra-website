/**
 * 역할: 디자인 토큰(색상, 타이포그래피, 간격, 터치 영역) 불변식 및 WCAG 2.1 AA 명암비 검증 테스트
 * 사용 위치: Jest 단위 테스트 스위트 (npm test)
 * 주요 기능:
 * - 선언된 모든 전경/배경 색상 쌍의 WCAG AA(4.5:1 / 3.0:1) 충족 검증
 * - 한국어 타이포그래피 스케일의 최소 행간(lineHeight >= 1.4x) 검증
 * - 4pt 그리드 여백 및 48dp 최소 터치 영역 상수 검증
 */
import {
  declaredContrastPairs,
  getContrastRatio,
  getRelativeLuminance,
  meetsWcagAA,
  parseHexColor,
  theme,
  WCAG_AA_LARGE_RATIO,
  WCAG_AA_NORMAL_RATIO,
} from '../src/theme';

describe('theme contrast helper', () => {
  test('6자리 및 3자리 16진수 색상을 RGB로 정확히 파싱한다', () => {
    // Given / When / Then
    expect(parseHexColor('#2563EB')).toEqual({ r: 37, g: 99, b: 235 });
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(() => parseHexColor('invalid')).toThrow('유효하지 않은 16진수 색상 형식입니다');
  });

  test('흑백 극단값의 상대 휘도와 명암비를 정확히 계산한다', () => {
    // Given / When / Then
    expect(getRelativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(getRelativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(getContrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(meetsWcagAA('#767676', '#FFFFFF', 'normal')).toBe(true);
    expect(meetsWcagAA('#949494', '#FFFFFF', 'normal')).toBe(false);
    expect(meetsWcagAA('#949494', '#FFFFFF', 'large')).toBe(true);
  });

  test.each(declaredContrastPairs)(
    '선언된 색상 조합 "$name"($foreground on $background)이 WCAG AA 기준을 충족한다',
    ({ foreground, background, level }) => {
      // Given
      const threshold = level === 'large' ? WCAG_AA_LARGE_RATIO : WCAG_AA_NORMAL_RATIO;
      // When
      const ratio = getContrastRatio(foreground, background);
      // Then
      expect(ratio).toBeGreaterThanOrEqual(threshold);
      expect(meetsWcagAA(foreground, background, level)).toBe(true);
    },
  );
});

describe('theme tokens invariants', () => {
  test('모든 타이포그래피 단계가 한국어 가독성을 위해 lineHeight >= 1.4x를 보장한다', () => {
    // Given
    const entries = Object.entries(theme.typography);
    // When / Then
    for (const [, spec] of entries) {
      expect(spec.lineHeight / spec.fontSize).toBeGreaterThanOrEqual(1.4);
    }
  });

  test('모든 간격 토큰이 4pt 그리드 배수이며 최소 터치 영역이 48dp 이상이다', () => {
    // Given / When / Then
    for (const value of Object.values(theme.spacing)) {
      expect(value % 4).toBe(0);
    }
    expect(theme.touchTarget.minHeight).toBeGreaterThanOrEqual(48);
    expect(theme.touchTarget.minWidth).toBeGreaterThanOrEqual(48);
  });
});
