/**
 * 역할: 홈(Home) 탭 화면(app/(app)/(tabs)/index.tsx) 섹션 상태·라우팅 RNTL 통합 테스트
 * 사용 위치: apps/mobile/tests/home-screen.test.tsx
 * 주요 기능:
 * - 초기 스켈레톤 로딩, 성공 시 KST 벽시계 일정·최근 공지·미제출 과제 카드 렌더링 및 이동 검증
 * - 섹션별 독립 빈 상태·오류+재시도 및 503 DISABLED 중립 안내 카드 검증
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../app/(app)/(tabs)/index';
import { createApiClient } from '../src/api/client';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { homeStrings } from '../src/features/home/strings';
import { ko } from '../src/i18n/ko';
import { authValue } from './screen-fixtures';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../src/auth/runtime', () => ({
  getApiClient: jest.fn(),
  getSessionManager: jest.fn(),
}));

const mockedGetApiClient = jest.mocked(getApiClient);
const activeClients: QueryClient[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeClients.push(client);
  return client;
}

function renderHome(auth: AuthContextValue, client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <HomeScreen />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  jest.setSystemTime(new Date('2026-10-15T01:00:00.000Z'));
  mockPush.mockReset();
  mockedGetApiClient.mockReset();
});

afterEach(() => {
  for (const client of activeClients.splice(0)) {
    client.clear();
  }
  jest.useRealTimers();
});

test('초기 로딩 중에는 세 섹션 모두 독립 스켈레톤을 표시한다', async () => {
  // Given: 응답이 보류 중인 API 클라이언트
  const neverResolves = () => new Promise<Response>(() => undefined);
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: neverResolves }),
  );
  const auth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '이순신', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When
  const view = await renderHome(auth);

  // Then
  expect(view.getByText('안녕하세요, 이순신님')).toBeTruthy();
  expect(view.getByLabelText('회원')).toBeTruthy();
  expect(view.getByTestId('home-schedule-skeleton')).toBeTruthy();
  expect(view.getByTestId('home-notices-skeleton')).toBeTruthy();
  expect(view.getByTestId('home-assignments-skeleton')).toBeTruthy();
  await view.unmount();
});

test('성공 시 일정·공지·과제 요약을 표시하고 각 경로로 이동한다', async () => {
  // Given
  const send = jest.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/schedule') {
      return jsonResponse({
        year: 2026,
        month: 10,
        timeZone: 'Asia/Seoul',
        events: [
          {
            id: 'sched-1',
            calendarDate: '2026-10-18',
            startTime: '19:00',
            endTime: '21:00',
            eventType: 'CLASS',
            title: '인문학 세미나',
            weekNumber: 4,
            description: null,
            cohort: { id: 'c-1', name: '15기' },
            sessions: [],
          },
        ],
      });
    }
    if (url.pathname === '/api/v1/notices') {
      return jsonResponse({
        notices: [
          {
            id: 'notice-42',
            title: '가을 학기 안내',
            excerpt: '수업 장소를 확인해 주세요.',
            pinned: true,
            viewCount: 15,
            createdAt: '2026-10-14T02:00:00.000Z',
            updatedAt: '2026-10-14T02:00:00.000Z',
          },
        ],
        page: { page: 1, pageSize: 3, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });
    }
    return jsonResponse({
      assignments: [
        {
          assignmentId: 'asg-1',
          targetId: 't-1',
          title: '독서 에세이 제출',
          status: 'PUBLISHED',
          dueAt: '2026-10-17T14:59:00.000Z',
          publishedAt: '2026-10-01T00:00:00.000Z',
          submission: null,
        },
      ],
      page: { page: 1, pageSize: 5, hasNextPage: false },
    });
  });
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: send }),
  );

  const auth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When
  const view = await renderHome(auth);
  await waitFor(() => {
    expect(view.getByText('인문학 세미나')).toBeTruthy();
  });

  // Then: KST 벽시계 시각 그대로 표시 및 공지/과제 데이터 렌더링
  expect(view.getByText('2026-10-18 (일) 19:00–21:00')).toBeTruthy();
  expect(view.getByText('가을 학기 안내')).toBeTruthy();
  expect(view.getByText('미제출 과제 1건')).toBeTruthy();
  expect(view.getByText('D-2')).toBeTruthy();

  // When: 링크 및 카드 터치
  await fireEvent.press(view.getByRole('button', { name: homeStrings.schedule.viewAllA11y }));
  expect(mockPush).toHaveBeenLastCalledWith('/(app)/(tabs)/schedule');

  await fireEvent.press(view.getByRole('button', { name: homeStrings.notices.viewAllA11y }));
  expect(mockPush).toHaveBeenLastCalledWith('/(app)/(tabs)/notices');

  await fireEvent.press(view.getByTestId('home-notice-item-notice-42'));
  expect(mockPush).toHaveBeenLastCalledWith('/notices/notice-42');

  await fireEvent.press(view.getByTestId('home-assignments-card'));
  expect(mockPush).toHaveBeenLastCalledWith('/assignments');
  await view.unmount();
});

test('각 섹션이 비어 있거나 오류가 발생해도 독립적으로 표시하고 재시도한다', async () => {
  // Given: 일정은 실패 후 재시도 성공, 공지는 빈 배열, 과제는 503 DISABLED
  let scheduleAttempts = 0;
  const send = jest.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/schedule') {
      scheduleAttempts += 1;
      if (scheduleAttempts === 1) {
        throw new TypeError('network down');
      }
      return jsonResponse({ year: 2026, month: 10, timeZone: 'Asia/Seoul', events: [] });
    }
    if (url.pathname === '/api/v1/notices') {
      return jsonResponse({
        notices: [],
        page: { page: 1, pageSize: 3, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });
    }
    return jsonResponse(
      { error: { code: 'DISABLED', message: '학사 비활성', requestId: 'req-1' } },
      503,
    );
  });
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: send }),
  );

  const auth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When
  const view = await renderHome(auth);
  await waitFor(() => {
    expect(view.getByTestId('home-schedule-error')).toBeTruthy();
  });

  // Then: 공지는 빈 상태, 과제는 중립 안내가 표시됨
  await waitFor(() => {
    expect(view.getByTestId('home-notices-empty')).toBeTruthy();
    expect(view.getByText(homeStrings.assignments.academicDisabled)).toBeTruthy();
  });

  // When: 일정 섹션 다시 시도 버튼 클릭
  await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));

  // Then: 일정 섹션이 빈 상태로 전환됨
  await waitFor(() => {
    expect(view.getByTestId('home-schedule-empty')).toBeTruthy();
  });
  await view.unmount();
});
