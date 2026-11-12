/**
 * 역할: 내 정보(Profile) 화면의 선택적 외부 정책 링크 설정 상수
 * 사용 위치: src/features/profile/model.ts, app/(app)/(tabs)/profile.tsx
 * 주요 기능:
 * - 개인정보 처리방침 외부 URL 상수를 관리하며, 빈 문자열일 때 내 정보 화면에서 해당 행을 숨김
 */
export const profileConfig = {
  /** 개인정보 처리방침 안내 URL입니다. 비어 있으면 내 정보 화면에 행을 표시하지 않습니다. */
  privacyPolicyUrl: '',
} as const;
