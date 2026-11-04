/**
 * 역할: HRA 모바일 앱의 디자인 토큰(색상, 타이포그래피, 4pt 그리드 간격, 반경, 그림자, 터치 영역) 정의
 * 사용 위치: src/theme/index.ts 및 모든 src/ui 컴포넌트, 화면 레이아웃
 * 주요 기능:
 * - 웹사이트(globals.css, AGENTS.md)와 일관된 브랜드 및 텍스트 색상 정의
 * - 한국어 가독성을 보장하는 행간(lineHeight >= 1.4x) 중심 타이포그래피 스케일 정의
 * - Android Material 3 및 iOS 공통 그림자/엘리베이션과 최소 터치 영역(48dp) 상수 제공
 * - 모든 텍스트/배경 조합의 WCAG AA 검증용 쌍 목록 선언
 */

export const colors = {
  /** 주 본문 및 제목 색상 (웹 text-[#1a1a1a]와 동일) */
  text: '#1a1a1a',
  /** 보조 설명 및 메타 정보 색상 (웹 text-[#666666]과 동일) */
  secondary: '#666666',
  /** 기본 구분선 및 입력창 테두리 색상 (웹 border-[#D9D9D9]와 동일) */
  border: '#D9D9D9',
  /** HRA 브랜드 블루 (웹 #2563EB와 동일) */
  brand: '#2563EB',
  /** 브랜드 버튼 눌림 상태 색상 */
  brandPressed: '#1D4ED8',
  /** 부드러운 브랜드 배경 틴트 */
  brandSoft: '#EFF6FF',
  /** 브랜드 소프트 배경 위의 고대비 텍스트 색상 */
  brandText: '#1E40AF',
  /** 브랜드 단색 배경 위의 텍스트/아이콘 색상 */
  onBrand: '#FFFFFF',
  /** 기본 화면 배경 색상 */
  background: '#FFFFFF',
  /** 카드·그룹 섹션 등 보조 표면 색상 (웹 --surface-subtle과 조화) */
  surface: '#F9FAFB',
  /** 스켈레톤 및 중립 칩 배경용 차분한 표면 색상 */
  surfaceMuted: '#F3F4F6',
  /** Android 기본 물결(ripple) 효과 색상 */
  ripple: 'rgba(26, 26, 26, 0.12)',
  /** 어두운/브랜드 버튼 위의 물결(ripple) 효과 색상 */
  rippleOnDark: 'rgba(255, 255, 255, 0.22)',
  /** 의미론적 색상: 성공(제출 완료 등) */
  success: '#166534',
  successSoft: '#F0FDF4',
  onSuccess: '#FFFFFF',
  /** 의미론적 색상: 주의/경고(미제출, 네트워크 재확인 등) */
  warning: '#92400E',
  warningSoft: '#FFFBEB',
  onWarning: '#FFFFFF',
  /** 의미론적 색상: 위험/오류(마감됨, 삭제/로그아웃 경고 등) */
  danger: '#B91C1C',
  dangerPressed: '#991B1B',
  dangerSoft: '#FEF2F2',
  onDanger: '#FFFFFF',
  /** 의미론적 색상: 안내/정보 */
  info: '#1E40AF',
  infoSoft: '#EFF6FF',
  onInfo: '#FFFFFF',
} as const;

/** 한국어 문장 호흡과 가독성을 위해 모든 단계에 lineHeight >= 1.4x를 보장하는 타이포그래피 스케일입니다. */
export const typography = {
  title: {
    fontSize: 28,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: 0.1,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
} as const;

export type TypographyVariant = keyof typeof typography;

/** 시스템 글꼴 크기 확대 시 레이아웃 깨짐을 방지하면서 접근성을 지키는 기본 최대 배율입니다. */
export const MAX_FONT_SIZE_MULTIPLIER = 1.6;

/** 4pt 그리드 기반 여백 스케일입니다. */
export const spacing = {
  xs: 4,
  sm: 8,
  s3: 12,
  md: 16,
  s5: 20,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** 모서리 반경 스케일입니다. */
export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/** Android elevation과 iOS shadow를 동시에 지원하는 그림자 프리셋입니다. */
export const elevation = {
  none: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

export type ElevationToken = keyof typeof elevation;

/** Android 접근성 권장 기준(48dp x 48dp)을 만족하는 최소 터치 영역 상수입니다. */
export const touchTarget = {
  minHeight: 48,
  minWidth: 48,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export interface ContrastPairSpec {
  readonly name: string;
  readonly foreground: string;
  readonly background: string;
  readonly level: 'normal' | 'large';
}

/** UI 키트에서 사용하는 모든 전경/배경 색상 조합 목록입니다. 단위 테스트에서 전수 검증합니다. */
export const declaredContrastPairs: readonly ContrastPairSpec[] = [
  { name: 'text on background', foreground: colors.text, background: colors.background, level: 'normal' },
  { name: 'text on surface', foreground: colors.text, background: colors.surface, level: 'normal' },
  { name: 'text on surfaceMuted', foreground: colors.text, background: colors.surfaceMuted, level: 'normal' },
  { name: 'secondary on background', foreground: colors.secondary, background: colors.background, level: 'normal' },
  { name: 'secondary on surface', foreground: colors.secondary, background: colors.surface, level: 'normal' },
  { name: 'secondary on surfaceMuted', foreground: colors.secondary, background: colors.surfaceMuted, level: 'normal' },
  { name: 'brand on background', foreground: colors.brand, background: colors.background, level: 'normal' },
  { name: 'brand on surface', foreground: colors.brand, background: colors.surface, level: 'normal' },
  { name: 'onBrand on brand', foreground: colors.onBrand, background: colors.brand, level: 'normal' },
  { name: 'onBrand on brandPressed', foreground: colors.onBrand, background: colors.brandPressed, level: 'normal' },
  { name: 'brandText on brandSoft', foreground: colors.brandText, background: colors.brandSoft, level: 'normal' },
  { name: 'onBrand on secondary (disabled button)', foreground: colors.onBrand, background: colors.secondary, level: 'normal' },
  { name: 'success on background', foreground: colors.success, background: colors.background, level: 'normal' },
  { name: 'success on successSoft', foreground: colors.success, background: colors.successSoft, level: 'normal' },
  { name: 'onSuccess on success', foreground: colors.onSuccess, background: colors.success, level: 'normal' },
  { name: 'warning on background', foreground: colors.warning, background: colors.background, level: 'normal' },
  { name: 'warning on warningSoft', foreground: colors.warning, background: colors.warningSoft, level: 'normal' },
  { name: 'onWarning on warning', foreground: colors.onWarning, background: colors.warning, level: 'normal' },
  { name: 'danger on background', foreground: colors.danger, background: colors.background, level: 'normal' },
  { name: 'danger on dangerSoft', foreground: colors.danger, background: colors.dangerSoft, level: 'normal' },
  { name: 'onDanger on danger', foreground: colors.onDanger, background: colors.danger, level: 'normal' },
  { name: 'onDanger on dangerPressed', foreground: colors.onDanger, background: colors.dangerPressed, level: 'normal' },
  { name: 'info on background', foreground: colors.info, background: colors.background, level: 'normal' },
  { name: 'info on infoSoft', foreground: colors.info, background: colors.infoSoft, level: 'normal' },
  { name: 'onInfo on info', foreground: colors.onInfo, background: colors.info, level: 'normal' },
] as const;
