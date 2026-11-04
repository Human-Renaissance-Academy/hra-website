/**
 * 역할: 일정(Schedule) 탭에서 사용하는 한국어 표시 문구와 유형·분류 레이블 상수 정의
 * 사용 위치: src/features/schedule 하위 모델, 컴포넌트, 화면 및 테스트
 * 주요 기능:
 * - 월 이동(이전 달, 다음 달, 오늘), 로딩/빈 상태/오류 상태의 정중한 한국어 문구 제공
 * - 일정 구분(CLASS 수업 / EVENT 행사) 및 세부 세션 카테고리(고전, 영어, 스피치, 특강, 케이스 스터디) 한국어 매핑
 */
import type { components } from '../../api/schema';

export type ScheduleEventType = components['schemas']['ScheduleEvent']['eventType'];
export type ScheduleSessionCategory = components['schemas']['ScheduleSession']['category'];

export const scheduleStrings = {
  screenTitle: '일정',
  navigation: {
    previousMonth: '이전 달',
    nextMonth: '다음 달',
    today: '오늘',
    previousMonthA11y: '이전 달 보기',
    nextMonthA11y: '다음 달 보기',
    todayA11y: '오늘이 포함된 달로 이동',
    monthHeaderFormat: (year: number, month: number) => `${year}년 ${month}월`,
  },
  dateGroup: {
    todayBadge: '오늘',
    headerFormat: (month: number, day: number, weekday: string) =>
      `${month}월 ${day}일 (${weekday})`,
    todayA11ySuffix: ', 오늘',
  },
  eventTypes: {
    CLASS: '수업',
    EVENT: '행사',
  } as const satisfies Readonly<Record<ScheduleEventType, string>>,
  sessionCategories: {
    CLASSICS: '고전',
    ENGLISH: '영어',
    SPEECH: '스피치',
    SPECIAL_LECTURE: '특강',
    CASE_STUDY: '케이스 스터디',
  } as const satisfies Readonly<Record<ScheduleSessionCategory, string>>,
  labels: {
    weekFormat: (weekNumber: number) => `${weekNumber}주차`,
    timeRangeFormat: (startTime: string, endTime: string | null) =>
      endTime && endTime.trim().length > 0 ? `${startTime} – ${endTime}` : startTime,
    facultyFormat: (name: string) => `${name} 교수`,
    reportCategoryPrefix: '과제 분류:',
    sessionsHeader: '세부 세션',
  },
  states: {
    emptyMonthTitle: '이번 달에는 일정이 없습니다.',
    emptyMonthDescription: '이전 달이나 다음 달을 선택해 다른 학사 일정을 확인해 주세요.',
    loadingMonth: '일정을 불러오는 중입니다.',
    updatingMonthBanner: '선택한 달의 일정을 불러오는 중입니다.',
    staleErrorBannerTitle: '선택한 달의 일정을 불러오지 못했습니다.',
    retryButton: '다시 시도',
  },
} as const;
