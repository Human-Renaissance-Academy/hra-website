/**
 * 역할: 일정(Schedule) 탭의 날짜 그룹 아젠다 렌더링, 오늘 표시 및 자동 스크롤, 세부 세션·null 필드·1.6x 글꼴 확대 RNTL 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - KST 오늘 날짜 그룹("오늘" 배지) 표시 및 첫 로드 시 오늘 그룹으로의 자동 스크롤 검증
 * - 벽시계 시간 범위, 5개 세션 카테고리 한국어 표시, order 정렬, null 선택 필드 무공백 렌더링, 제목 무절단 검증
 */
import { render, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../src/auth/auth-context';
import { ScheduleScreen } from '../src/features/schedule';
import type {
  ScheduleApiPort,
  ScheduleEventDto,
  ScheduleResponseDto,
} from '../src/features/schedule';
import { createQueryClient } from '../src/query/client';
import { theme } from '../src/theme';
import { authValue } from './screen-fixtures';

const FIXED_CLOCK_MS = Date.parse('2026-10-31T03:00:00Z'); // KST 2026-10-31 12:00:00 (토)
const fixedClock = () => FIXED_CLOCK_MS;

function makeTestQueryClient() {
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, gcTime: 0 },
  });
  return client;
}

function makeResponse(
  year: number,
  month: number,
  events: ScheduleEventDto[] = [],
): ScheduleResponseDto {
  return { year, month, timeZone: 'Asia/Seoul', events };
}

function createSampleEvents(): ScheduleEventDto[] {
  return [
    {
      id: 'evt-early',
      calendarDate: '2026-10-10',
      startTime: '10:00',
      endTime: '12:00',
      eventType: 'EVENT',
      title: '입학 오리엔테이션 및 환영회',
      weekNumber: null,
      description: null,
      cohort: null,
      sessions: [],
    },
    {
      id: 'evt-today',
      calendarDate: '2026-10-31',
      startTime: '13:30',
      endTime: '17:45',
      eventType: 'CLASS',
      title:
        '제5주차 인문학 집중 세미나: 아주 긴 제목도 말줄임 없이 여러 줄로 안전하게 줄바꿈되어 전체 내용을 읽을 수 있어야 합니다',
      weekNumber: 5,
      description: '고전 강독 및 발표 토론을 진행합니다.',
      cohort: { id: 'cohort-15', name: '15기' },
      sessions: [
        {
          category: 'SPEECH',
          content: '자유 주제 3분 스피치',
          reportCategory: '스피치 원고',
          subTitle: '설득의 수사학',
          subDescription: '청중 분석과 메시지 구조화',
          faculty: { id: 'fac-2', name: '이순신' },
          order: 2,
        },
        {
          category: 'CLASSICS',
          content: '아리스토텔레스 니코마코스 윤리학',
          reportCategory: '독서 에세이',
          subTitle: '행복과 덕의 관계',
          subDescription: '제1권~제2권 핵심 논증 토론',
          faculty: { id: 'fac-1', name: '정약용' },
          order: 1,
        },
        {
          category: 'ENGLISH',
          content: null,
          reportCategory: null,
          subTitle: null,
          subDescription: null,
          faculty: null,
          order: 3,
        },
        {
          category: 'SPECIAL_LECTURE',
          content: '과학기술과 인간',
          reportCategory: null,
          subTitle: null,
          subDescription: null,
          faculty: null,
          order: 4,
        },
        {
          category: 'CASE_STUDY',
          content: '조직 의사결정 사례',
          reportCategory: null,
          subTitle: null,
          subDescription: null,
          faculty: null,
          order: 5,
        },
      ],
    },
  ];
}

describe('ScheduleScreen 렌더링, 오늘 표시, 자동 스크롤 및 세부 세션', () => {
  test('오늘 날짜 그룹 표시, 자동 스크롤, 벽시계 시간, 5개 세션 카테고리 및 null 필드 무공백 렌더링을 수행한다', async () => {
    // Given
    const scrollSpy = jest
      .spyOn(FlatList.prototype, 'scrollToIndex')
      .mockImplementation(() => undefined);
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => {
        const { year, month } = init.params.query;
        return {
          data: makeResponse(
            year,
            month,
            year === 2026 && month === 10 ? createSampleEvents() : [],
          ),
        };
      }),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'user-1', name: '홍길동', role: 'MEMBER' },
      role: 'MEMBER',
    });

    // When
    const view = await render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <ScheduleScreen clock={fixedClock} client={client} />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByTestId('schedule-visible-month-label')).toHaveTextContent('2026년 10월');
      expect(view.getByTestId('schedule-date-header-2026-10-31')).toHaveTextContent(
        '10월 31일 (토)',
      );
    });

    expect(view.getByTestId('schedule-today-badge-2026-10-31')).toHaveTextContent('오늘');
    expect(view.queryByTestId('schedule-today-badge-2026-10-10')).toBeNull();
    expect(scrollSpy).toHaveBeenCalledWith({ index: 1, animated: false });

    expect(view.getByTestId('schedule-event-time-evt-today')).toHaveTextContent('13:30 – 17:45');
    expect(view.getByTestId('schedule-event-type-evt-today')).toHaveTextContent('수업');
    expect(view.getByTestId('schedule-event-week-evt-today')).toHaveTextContent('5주차');
    expect(view.getByTestId('schedule-event-cohort-evt-today')).toHaveTextContent('15기');
    expect(view.getByTestId('schedule-event-description-evt-today')).toHaveTextContent(
      '고전 강독 및 발표 토론을 진행합니다.',
    );

    const titleNode = view.getByTestId('schedule-event-title-evt-today');
    expect(titleNode).toHaveProp('maxFontSizeMultiplier', theme.maxFontSizeMultiplier);
    expect(titleNode.props.numberOfLines).toBeUndefined();

    expect(view.getByTestId('schedule-session-category-evt-today-0')).toHaveTextContent('고전');
    expect(view.getByTestId('schedule-session-faculty-evt-today-0')).toHaveTextContent(
      '정약용 교수',
    );
    expect(view.getByTestId('schedule-session-subtitle-evt-today-0')).toHaveTextContent(
      '행복과 덕의 관계',
    );
    expect(view.getByTestId('schedule-session-content-evt-today-0')).toHaveTextContent(
      '아리스토텔레스 니코마코스 윤리학',
    );
    expect(view.getByTestId('schedule-session-subdescription-evt-today-0')).toHaveTextContent(
      '제1권~제2권 핵심 논증 토론',
    );
    expect(view.getByTestId('schedule-session-report-evt-today-0')).toHaveTextContent(
      '과제 분류: 독서 에세이',
    );

    expect(view.getByTestId('schedule-session-category-evt-today-1')).toHaveTextContent('스피치');
    expect(view.getByTestId('schedule-session-category-evt-today-2')).toHaveTextContent('영어');
    expect(view.getByTestId('schedule-session-category-evt-today-3')).toHaveTextContent('특강');
    expect(view.getByTestId('schedule-session-category-evt-today-4')).toHaveTextContent(
      '케이스 스터디',
    );

    expect(view.queryByTestId('schedule-event-week-evt-early')).toBeNull();
    expect(view.queryByTestId('schedule-event-cohort-evt-early')).toBeNull();
    expect(view.queryByTestId('schedule-event-description-evt-early')).toBeNull();
    expect(view.queryByTestId('schedule-event-sessions-evt-early')).toBeNull();
    expect(view.queryByTestId('schedule-session-faculty-evt-today-2')).toBeNull();
    expect(view.queryByTestId('schedule-session-subtitle-evt-today-2')).toBeNull();
    expect(view.queryByTestId('schedule-session-content-evt-today-2')).toBeNull();

    scrollSpy.mockRestore();
    await view.unmount();
    queryClient.clear();
  });
});
