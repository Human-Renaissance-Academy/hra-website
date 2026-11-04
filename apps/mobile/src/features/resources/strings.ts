/**
 * 역할: 자료실(Resources) 탭에서 사용하는 한국어 표시 문구, 접근성 레이블, 오류 매핑 상수 정의
 * 사용 위치: src/features/resources 하위 상태 머신, 다운로드 실행기, 화면·행 컴포넌트 및 테스트
 * 주요 기능:
 * - 가이드북 목록 상태(로딩, 빈 목록, 403 권한 안내, 페이지 추가 로딩/오류) 한국어 문구 제공
 * - PDF 다운로드·열기 진행 상태(퍼센트/크기 미확인, 취소, 열기 중, 완료, 취소됨, 오류) 한국어 문구 제공
 * - 403/404/503/뷰어 없음 등 자료실 전용 정중한 한국어 오류 메시지 상수 제공
 */

export const resourcesStrings = {
  screenTitle: '자료실',
  subtitle: '승인 회원 전용 가이드북 및 학습 자료',
  list: {
    loading: '자료를 불러오는 중입니다.',
    emptyTitle: '등록된 자료가 없습니다.',
    emptyDescription: '새로운 가이드북이 등록되면 이곳에서 확인하고 열람할 수 있습니다.',
    loadingMore: '다음 자료를 불러오는 중입니다.',
    loadMoreError: '추가 자료를 불러오지 못했습니다.',
    retryLoadMore: '다시 불러오기',
    documentSubtitle: 'PDF 문서 · 눌러서 열기',
    itemA11yHint: '누르면 PDF 파일을 내려받아 열람합니다.',
  },
  roleGuard: {
    forbiddenTitle: '자료실 이용 권한 안내',
    forbiddenMessage: '승인된 회원만 자료실을 이용할 수 있습니다. 관리자 승인 후 다시 이용해 주세요.',
  },
  download: {
    idleAction: '열기',
    downloadingIndeterminate: '내려받는 중입니다...',
    downloadingPercentage: (percent: number) => `내려받는 중입니다 (${percent}%)`,
    opening: '문서를 여는 중입니다...',
    done: '열기 완료',
    cancelled: '내려받기가 취소되었습니다.',
    cancelAction: '취소',
    cancelA11yLabel: (title: string) => `${title} 내려받기 취소`,
    retryAction: '다시 시도',
  },
  errors: {
    forbidden: '승인된 회원만 자료를 열람할 수 있습니다.',
    notFound: '자료를 찾을 수 없습니다.',
    unavailable: '잠시 후 다시 시도해 주세요.',
    noViewer: 'PDF 파일을 열 수 있는 앱이 없습니다. PDF 뷰어를 설치한 뒤 다시 시도해 주세요.',
  },
} as const;
