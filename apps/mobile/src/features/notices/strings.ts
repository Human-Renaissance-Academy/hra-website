/**
 * 역할: 공지 목록·상세 기능에서 사용하는 한국어 UI 문구 정의
 * 사용 위치: src/features/notices/** 및 app/(app)/(tabs)/notices.tsx, app/(app)/notices/**
 * 주요 기능:
 * - 공지 탭·상세 헤더, 검색창 플레이스홀더·접근성 레이블, 고정 배지 문구 정의
 * - 빈 상태("등록된 공지가 없습니다.", "검색 결과가 없습니다.") 및 404("삭제되었거나 없는 공지입니다.") 정본 문구 제공
 */
export const noticesStrings = {
  /** 공지 탭 상단 제목 (ko.tabs.notices와 일치) */
  headerTitle: '공지',
  /** 공지 탭 부제 설명 */
  headerSubtitle: 'HRA의 주요 학사 공지와 소식을 확인해 주세요.',
  /** 공지 상세 스택 헤더 제목 */
  detailHeaderTitle: '공지 상세',
  /** 검색창 플레이스홀더 */
  searchPlaceholder: '공지 제목 검색',
  /** 검색창 접근성 레이블 */
  searchInputA11yLabel: '공지 검색어 입력',
  /** 검색어 지우기 버튼 접근성 레이블 */
  clearSearchA11yLabel: '검색어 지우기',
  /** 고정 공지 배지 레이블 */
  pinnedBadge: '고정',
  /** 검색어가 없을 때의 빈 목록 안내 문구 (요구사항 정본) */
  emptyDefault: '등록된 공지가 없습니다.',
  /** 검색 결과가 없을 때의 빈 목록 안내 문구 (요구사항 정본) */
  emptySearchResult: '검색 결과가 없습니다.',
  /** 404 공지 미존재/삭제 안내 문구 (요구사항 정본) */
  notFoundMessage: '삭제되었거나 없는 공지입니다.',
  /** 무한 스크롤 추가 로딩 안내 */
  loadingMore: '다음 공지를 불러오는 중입니다',
  /** 무한 스크롤 다음 페이지 오류 안내 */
  loadMoreErrorTitle: '다음 공지를 불러오지 못했습니다.',
  /** 목록으로 돌아가기 버튼 레이블 */
  backToList: '공지 목록으로 돌아가기',
  /** 조회수 포맷터 */
  formatViewCount: (viewCount: number) => `조회 ${viewCount.toLocaleString('ko-KR')}`,
  /** 작성일 포맷터 */
  formatCreatedDate: (kstDate: string) => `작성일 ${kstDate}`,
  /** 공지 카드 보조기술 통합 레이블 */
  formatCardA11yLabel: (params: {
    readonly pinned: boolean;
    readonly title: string;
    readonly dateText: string;
    readonly viewCount: number;
  }) => {
    const prefix = params.pinned ? '고정 공지, ' : '';
    return `${prefix}${params.title}, 작성일 ${params.dateText}, 조회 ${params.viewCount}`;
  },
} as const;
