/**
 * 역할: 일정(Schedule) 탭의 월 이동·placeholder 유지·경계 비활성화·오류/타임아웃/새로고침·사용자 쿼리 격리 RNTL 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 월 이동(이전 달, 다음 달, 오늘), placeholderData 유지 및 실패 시 ErrorState 전환 검증
 * - 허용 경계(1900.01 / 2100.12) 버튼 비활성화, 당겨서 새로고침, 타임아웃/오프라인 재시도, 사용자 간 캐시 격리 검증
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { ScheduleScreen, scheduleStrings } from '../src/features/schedule';
import type {
  ScheduleApiPort,
  ScheduleEventDto,
  ScheduleMonth,
  ScheduleResponseDto,
} from '../src/features/schedule';
import { ko } from '../src/i18n/ko';
import { createQueryClient } from '../src/query/client';
import { authValue } from './screen-fixtures';

const FIXED_CLOCK_MS = Date.parse('2026-10-31T03:00:00Z');
const fixedClock = () => FIXED_CLOCK_MS;

function makeTestQueryClient() {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, gcTime: 0 } });
  return client;
}
function makeResponse(year: number, month: number, events: ScheduleEventDto[] = []): ScheduleResponseDto {
  return { year, month, timeZone: 'Asia/Seoul', events };
}
const sampleEvents: ScheduleEventDto[] = [
  { id: 'evt-early', calendarDate: '2026-10-10', startTime: '10:00', endTime: '12:00', eventType: 'EVENT', title: '입학 오리엔테이션 및 환영회', weekNumber: null, description: null, cohort: null, sessions: [] },
];
function wrapScreen(queryClient: ReturnType<typeof makeTestQueryClient>, auth: AuthContextValue, client: ScheduleApiPort, initialMonth?: ScheduleMonth): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <ScheduleScreen clock={fixedClock} client={client} initialMonth={initialMonth} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('월 이동, placeholderData 유지, 경계 버튼 비활성화', () => {
  test('다음 달 로딩 중 이전 달 데이터를 placeholder로 유지하고 완료 후 빈 달 안내를 표시한다', async () => {
    // Given
    let resolveNov: ((value: { data: ScheduleResponseDto }) => void) | undefined;
    const client: ScheduleApiPort = {
      GET: jest.fn((_path, init) => {
        const { year, month } = init.params.query;
        if (year === 2026 && month === 10) {
          return Promise.resolve({ data: makeResponse(2026, 10, sampleEvents) });
        }
        if (year === 2026 && month === 11) {
          return new Promise((resolve) => {
            resolveNov = resolve;
          });
        }
        return Promise.resolve({ data: makeResponse(year, month, []) });
      }),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'user-1', name: '홍길동', role: 'MEMBER' },
    });

    const view = await render(wrapScreen(queryClient, auth, client));
    await waitFor(() => expect(view.getByText('입학 오리엔테이션 및 환영회')).toBeTruthy());

    // When
    await fireEvent.press(
      view.getByRole('button', { name: scheduleStrings.navigation.nextMonth }),
    );

    // Then
    expect(view.getByTestId('schedule-visible-month-label')).toHaveTextContent('2026년 11월');
    expect(view.getByTestId('schedule-placeholder-indicator')).toHaveTextContent(
      scheduleStrings.states.updatingMonthBanner,
    );
    expect(view.getByText('입학 오리엔테이션 및 환영회')).toBeTruthy();

    await act(async () => {
      resolveNov?.({ data: makeResponse(2026, 11, []) });
    });

    await waitFor(() =>
      expect(view.getByText(scheduleStrings.states.emptyMonthTitle)).toBeTruthy(),
    );

    await fireEvent.press(view.getByRole('button', { name: scheduleStrings.navigation.today }));
    await waitFor(() => {
      expect(view.getByTestId('schedule-visible-month-label')).toHaveTextContent('2026년 10월');
      expect(view.getByText('입학 오리엔테이션 및 환영회')).toBeTruthy();
    });

    await view.unmount();
    queryClient.clear();
  });

  test('1900년 1월에서는 이전 달 버튼이, 2100년 12월에서는 다음 달 버튼이 비활성화된다', async () => {
    // Given
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => ({
        data: makeResponse(init.params.query.year, init.params.query.month, []),
      })),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({ status: 'signedIn', user: { id: 'u-1', name: '회원', role: 'MEMBER' } });

    // When
    const minView = await render(wrapScreen(queryClient, auth, client, { year: 1900, month: 1 }));

    // Then
    expect(
      minView.getByRole('button', { name: scheduleStrings.navigation.previousMonth }),
    ).toBeDisabled();
    expect(
      minView.getByRole('button', { name: scheduleStrings.navigation.nextMonth }),
    ).toBeEnabled();
    await minView.unmount();

    const maxView = await render(wrapScreen(queryClient, auth, client, { year: 2100, month: 12 }));
    expect(
      maxView.getByRole('button', { name: scheduleStrings.navigation.nextMonth }),
    ).toBeDisabled();
    expect(
      maxView.getByRole('button', { name: scheduleStrings.navigation.previousMonth }),
    ).toBeEnabled();
    await maxView.unmount();
    queryClient.clear();
  });
});

describe('오류/타임아웃/재시도, 당겨서 새로고침 및 사용자 간 쿼리 격리', () => {
  test('타임아웃/오류 발생 시 한국어 오류 상태와 다시 시도 버튼을 표시하고 재시도로 복구한다', async () => {
    // Given
    let attempt = 0;
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => {
        attempt += 1;
        if (attempt === 1) {
          throw new ApiError({ status: 0, code: 'TIMEOUT' });
        }
        return {
          data: makeResponse(init.params.query.year, init.params.query.month, sampleEvents),
        };
      }),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({ status: 'signedIn', user: { id: 'u-1', name: '회원', role: 'MEMBER' } });

    const view = await render(wrapScreen(queryClient, auth, client));
    await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent(ko.errors.TIMEOUT));

    // When
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));

    // Then
    await waitFor(() => expect(view.getByText('입학 오리엔테이션 및 환영회')).toBeTruthy());

    await view.unmount();
    queryClient.clear();
  });

  test('당겨서 새로고침 실행 시 현재 월 데이터를 다시 요청한다', async () => {
    // Given
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => ({
        data: makeResponse(
          init.params.query.year,
          init.params.query.month,
          init.params.query.month === 10 ? sampleEvents : [],
        ),
      })),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({ status: 'signedIn', user: { id: 'u-1', name: '회원', role: 'MEMBER' } });

    const view = await render(wrapScreen(queryClient, auth, client));
    await waitFor(() => expect(view.getByTestId('schedule-agenda-list')).toBeTruthy());
    const callsBeforeRefresh = (client.GET as jest.Mock).mock.calls.filter(
      (call) => call[1].params.query.month === 10,
    ).length;

    // When
    const agendaList = view.getByTestId('schedule-agenda-list');
    await act(async () => {
      agendaList.props.refreshControl.props.onRefresh();
    });

    // Then
    await waitFor(() => {
      const callsAfterRefresh = (client.GET as jest.Mock).mock.calls.filter(
        (call) => call[1].params.query.month === 10,
      ).length;
      expect(callsAfterRefresh).toBe(callsBeforeRefresh + 1);
    });

    await view.unmount();
    queryClient.clear();
  });

  test('사용자 ID가 바뀌면 이전 사용자의 캐시를 재사용하지 않고 새 사용자 키로 다시 조회한다', async () => {
    // Given
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => ({
        data: makeResponse(init.params.query.year, init.params.query.month, []),
      })),
    };
    const queryClient = makeTestQueryClient();
    const userAAuth = authValue({
      status: 'signedIn',
      user: { id: 'user-a', name: '김철수', role: 'MEMBER' },
    });
    const userBAuth = authValue({
      status: 'signedIn',
      user: { id: 'user-b', name: '박영희', role: 'MEMBER' },
    });

    const view = await render(wrapScreen(queryClient, userAAuth, client));
    await waitFor(() =>
      expect(view.getByText(scheduleStrings.states.emptyMonthTitle)).toBeTruthy(),
    );

    // When
    await view.rerender(wrapScreen(queryClient, userBAuth, client));

    // Then
    await waitFor(() => {
      const octCallsTotal = (client.GET as jest.Mock).mock.calls.filter(
        (call) => call[1].params.query.year === 2026 && call[1].params.query.month === 10,
      ).length;
      expect(octCallsTotal).toBe(2);
    });

    await view.unmount();
    queryClient.clear();
  });

  test('다음 달 조회가 실패하면 이전 달 placeholder를 현재 달 일정으로 보여주지 않고 오류 상태를 표시한다', async () => {
    // Given
    const client: ScheduleApiPort = {
      GET: jest.fn(async (_path, init) => {
        const { year, month } = init.params.query;
        if (year === 2026 && month === 10) {
          return { data: makeResponse(2026, 10, sampleEvents) };
        }
        throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
      }),
    };
    const queryClient = makeTestQueryClient();
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'user-1', name: '홍길동', role: 'MEMBER' },
    });

    const view = await render(wrapScreen(queryClient, auth, client));
    await waitFor(() => expect(view.getByText('입학 오리엔테이션 및 환영회')).toBeTruthy());

    // When
    await fireEvent.press(
      view.getByRole('button', { name: scheduleStrings.navigation.nextMonth }),
    );

    // Then
    await waitFor(() => {
      expect(view.getByTestId('schedule-error-state')).toBeTruthy();
      expect(view.getByRole('alert')).toHaveTextContent(ko.errors.INVALID_INPUT);
      expect(view.queryByText('입학 오리엔테이션 및 환영회')).toBeNull();
    });

    await view.unmount();
    queryClient.clear();
  });
});
