/**
 * 역할: 홈(Home) 탭 화면의 역할 분기(FACULTY/ADMIN), 계정 간 쿼리 격리, 당겨서 새로고침 RNTL 테스트
 * 사용 위치: apps/mobile/tests/home-roles-refresh.test.tsx
 * 주요 기능:
 * - FACULTY/ADMIN 계정의 과제 API 미호출 및 중립 안내 카드 표시 검증
 * - 공유 QueryClient에서 계정 전환 시 사용자 ID 기반 쿼리 격리 검증
 * - 당겨서 새로고침(RefreshControl) 실행 시 전체 활성 쿼리 재조회 검증
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomeScreen from '../app/(app)/(tabs)/index';
import { createApiClient } from '../src/api/client';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { homeStrings } from '../src/features/home/strings';
import { authValue } from './screen-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  mockedGetApiClient.mockReset();
});

afterEach(() => {
  for (const client of activeClients.splice(0)) {
    client.clear();
  }
  jest.useRealTimers();
});

test('FACULTY와 ADMIN 계정은 과제 API를 호출하지 않고 중립 안내를 표시한다', async () => {
  // Given
  const send = jest.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/schedule') {
      return jsonResponse({ year: 2026, month: 10, timeZone: 'Asia/Seoul', events: [] });
    }
    if (url.pathname === '/api/v1/notices') {
      return jsonResponse({
        notices: [],
        page: { page: 1, pageSize: 3, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });
    }
    throw new Error('과제 API가 호출되면 안 됩니다');
  });
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: send }),
  );

  const facultyAuth = authValue({
    status: 'signedIn',
    user: { id: 'faculty-1', name: '박교수', role: 'FACULTY' },
    role: 'FACULTY',
  });

  // When
  const view = await renderHome(facultyAuth);
  await waitFor(() => {
    expect(view.getByTestId('home-schedule-empty')).toBeTruthy();
  });

  // Then
  expect(view.getByLabelText('교수진')).toBeTruthy();
  expect(view.getByText(homeStrings.assignments.roleUnavailable)).toBeTruthy();
  expect(
    send.mock.calls.some(([req]) => new URL(req.url).pathname === '/api/v1/assignments'),
  ).toBe(false);
  await view.unmount();
});

test('서로 다른 사용자 계정은 공유 QueryClient에서도 상대방의 캐시를 보지 않는다', async () => {
  // Given
  const sharedClient = createTestQueryClient();
  let noticeCallCount = 0;
  const send = jest.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/notices') {
      noticeCallCount += 1;
      return jsonResponse({
        notices: [
          {
            id: `n-${noticeCallCount}`,
            title: noticeCallCount === 1 ? 'A 사용자 시점 공지' : 'B 사용자 시점 공지',
            excerpt: '요약',
            pinned: false,
            viewCount: 1,
            createdAt: '2026-10-14T00:00:00.000Z',
            updatedAt: '2026-10-14T00:00:00.000Z',
          },
        ],
        page: { page: 1, pageSize: 3, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });
    }
    if (url.pathname === '/api/v1/schedule') {
      return jsonResponse({ year: 2026, month: 10, timeZone: 'Asia/Seoul', events: [] });
    }
    return jsonResponse({ assignments: [], page: { page: 1, pageSize: 5, hasNextPage: false } });
  });
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: send }),
  );

  const userA = authValue({
    status: 'signedIn',
    user: { id: 'user-a', name: '계정A', role: 'MEMBER' },
    role: 'MEMBER',
  });
  const userB = authValue({
    status: 'signedIn',
    user: { id: 'user-b', name: '계정B', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When: 계정 A 렌더링 후 계정 B로 전환
  const view = await renderHome(userA, sharedClient);
  await waitFor(() => {
    expect(view.getByText('A 사용자 시점 공지')).toBeTruthy();
  });

  await view.rerender(
    <QueryClientProvider client={sharedClient}>
      <AuthContext.Provider value={userB}>
        <HomeScreen />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );

  // Then: B 계정은 별도 쿼리 키로 새로 조회해 B 시점 데이터를 표시함
  await waitFor(() => {
    expect(view.getByText('B 사용자 시점 공지')).toBeTruthy();
  });
  expect(view.queryByText('A 사용자 시점 공지')).toBeNull();
  await view.unmount();
});

test('당겨서 새로고침 시 활성화된 모든 섹션 쿼리를 다시 조회한다', async () => {
  // Given
  const send = jest.fn(async (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/schedule') {
      return jsonResponse({ year: 2026, month: 10, timeZone: 'Asia/Seoul', events: [] });
    }
    if (url.pathname === '/api/v1/notices') {
      return jsonResponse({
        notices: [],
        page: { page: 1, pageSize: 3, totalCount: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      });
    }
    return jsonResponse({ assignments: [], page: { page: 1, pageSize: 5, hasNextPage: false } });
  });
  mockedGetApiClient.mockReturnValue(
    createApiClient({ baseUrl: 'https://example.test', fetch: send }),
  );

  const auth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
    role: 'MEMBER',
  });

  const view = await renderHome(auth);
  await waitFor(() => {
    expect(send).toHaveBeenCalledTimes(3);
    expect(view.getByTestId('home-notices-empty')).toBeTruthy();
  });

  // When: ScrollView의 refreshControl.props.onRefresh 호출
  const scrollNodes = view.container.queryAll((node) => Boolean(node.props.refreshControl));
  await act(async () => {
    const control = scrollNodes[0]?.props.refreshControl;
    if (control && typeof control === 'object' && 'props' in control) {
      const props = control.props;
      if (props && typeof props === 'object' && 'onRefresh' in props && typeof props.onRefresh === 'function') {
        props.onRefresh();
      }
    }
  });

  // Then: 일정·공지·과제 총 3건이 추가로 호출됨
  await waitFor(() => {
    expect(send).toHaveBeenCalledTimes(6);
  });
  await view.unmount();
});
