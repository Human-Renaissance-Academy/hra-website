/**
 * 역할: 내 정보(Profile) 화면에서 사용하는 한국어 UI 문구 모음
 * 사용 위치: src/features/profile/model.ts, src/features/profile/components.tsx, app/(app)/(tabs)/profile.tsx
 * 주요 기능:
 * - 프로필 기본값, 역할 레이블, 내 과제·앱 버전·개인정보 처리방침 행 문구 제공
 * - 단일 기기 로그아웃 및 모든 모바일 기기 로그아웃 확인 대화상자 문구 정의
 */
export const profileStrings = {
  fallbackName: '회원',
  emptyEmail: '표시할 이메일이 없습니다',
  roles: {
    ADMIN: '관리자',
    FACULTY: '교수진',
    MEMBER: '회원',
    PENDING: '승인 대기',
  },
  sections: {
    menu: '학습 및 앱 정보',
    session: '세션 관리',
  },
  rows: {
    assignmentsTitle: '내 과제',
    assignmentsSubtitle: '과제 제출 현황 및 제출 파일 확인',
    versionTitle: '앱 버전',
    privacyPolicyTitle: '개인정보 처리방침',
    privacyPolicySubtitle: '브라우저에서 개인정보 처리방침 열기',
    logoutTitle: '로그아웃',
    logoutSubtitle: '현재 기기에서 로그아웃합니다',
    logoutAllTitle: '모든 기기에서 로그아웃',
    logoutAllSubtitle: '이 계정이 로그인된 모든 모바일 기기의 세션을 종료합니다',
  },
  dialogs: {
    logoutTitle: '로그아웃',
    logoutMessage: '현재 기기에서 로그아웃하시겠습니까?',
    logoutConfirm: '로그아웃',
    logoutAllTitle: '모든 기기에서 로그아웃',
    logoutAllMessage:
      '이 계정이 로그인된 모든 모바일 기기에서 세션을 종료합니다. 계속하시겠습니까?',
    logoutAllConfirm: '모두 로그아웃',
    privacyPolicyTitle: '개인정보 처리방침 열기',
    privacyPolicyMessage: '외부 브라우저로 개인정보 처리방침 페이지를 여시겠습니까?',
    privacyPolicyConfirm: '열기',
  },
  banners: {
    profileRefreshErrorTitle: '프로필 정보를 새로 불러오지 못했습니다',
    logoutErrorTitle: '로그아웃 처리 중 문제가 발생했습니다',
    dismissAction: '닫기',
  },
} as const;
