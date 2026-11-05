/**
 * 역할: 홈(Home) 화면 및 하위 섹션에서 사용하는 한국어 UI 문구 모음
 * 사용 위치: src/features/home/model.ts, src/features/home/components.tsx, app/(app)/(tabs)/index.tsx
 * 주요 기능:
 * - 인사말, 역할 배지, 다가오는 일정·최근 공지·내 과제 섹션의 제목과 상태 안내 문구 제공
 * - 공용 ko.ts를 수정하지 않고 홈 기능 전용 한국어 문자열을 격리 관리
 */
export const homeStrings = {
  fallbackName: '회원',
  greeting: (name: string) => `안녕하세요, ${name}님`,
  greetingSubtitle: '오늘의 학사 일정과 새로운 소식을 확인해 주세요.',
  roles: {
    ADMIN: '관리자',
    FACULTY: '교수진',
    MEMBER: '회원',
    PENDING: '승인 대기',
  },
  schedule: {
    title: '다가오는 일정',
    subtitle: '이번 달 예정된 주요 일정',
    viewAll: '일정 전체 보기',
    viewAllA11y: '일정 전체 보기 화면으로 이동',
    emptyTitle: '예정된 일정이 없습니다.',
    emptyDescription: '이번 달에 남은 예정 일정이 없습니다.',
    loadingA11y: '다가오는 일정을 불러오는 중입니다',
    eventTypes: {
      CLASS: '수업',
      EVENT: '행사',
    },
    weekBadge: (week: number) => `${week}주차`,
  },
  notices: {
    title: '최근 공지',
    subtitle: '새로 등록된 안내 사항',
    viewAll: '전체 보기',
    viewAllA11y: '공지사항 전체 목록으로 이동',
    pinnedBadge: '고정',
    emptyTitle: '등록된 공지가 없습니다.',
    emptyDescription: '새로운 공지사항이 등록되면 이곳에 표시됩니다.',
    loadingA11y: '최근 공지를 불러오는 중입니다',
    viewCount: (count: number) => `조회 ${count.toLocaleString('ko-KR')}`,
    itemA11y: (title: string, dateText: string) => `${title}, 등록일 ${dateText}`,
  },
  assignments: {
    title: '내 과제',
    subtitle: '제출이 필요한 학사 과제 현황',
    viewAll: '전체 보기',
    viewAllA11y: '내 과제 목록으로 이동',
    loadingA11y: '내 과제 현황을 불러오는 중입니다',
    pendingCountLabel: (count: number) => `미제출 과제 ${count}건`,
    completedBadge: '완료',
    nearestDueLabel: (dueText: string, dueDateTime: string) =>
      `가장 가까운 마감: ${dueText} (${dueDateTime})`,
    nearestTitleLabel: (title: string) => `다음 과제: ${title}`,
    allSubmittedDescription: '현재 제출 대기 중인 공개 과제가 없습니다.',
    cardA11y: (count: number) => `내 과제 목록 열기, 미제출 과제 ${count}건`,
    roleUnavailable: '이 계정에서는 과제 기능을 사용할 수 없습니다.',
    academicDisabled: '학사 기능이 아직 열리지 않았습니다.',
  },
} as const;
