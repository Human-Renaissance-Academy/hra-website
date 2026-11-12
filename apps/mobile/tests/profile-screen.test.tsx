/**
 * 역할: 내 정보(Profile) 탭 화면(app/(app)/(tabs)/profile.tsx) UI 및 로그아웃 확인 흐름 테스트
 * 사용 위치: apps/mobile/tests/profile-screen.test.tsx
 * 주요 기능:
 * - 저장 프로필 즉시 표시, GET /api/v1/me 표시 갱신, MEMBER 전용 내 과제 행 및 버전 표시 검증
 * - 로그아웃 및 모든 기기에서 로그아웃 확인 창(취소 시 미실행, 확인 시 실행, 실패 시 한국어 배너) 검증
 */
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from '../app/(app)/(tabs)/profile';
import { createApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { profileStrings } from '../src/features/profile/strings';
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

function renderProfile(auth: AuthContextValue, client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <ProfileScreen />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockedGetApiClient.mockReset();
});

afterEach(() => {
  for (const client of activeClients.splice(0)) {
    client.clear();
  }
});

function mockMeUser(overrides: Partial<{ id: string; name: string | null; email: string | null; role: 'ADMIN' | 'FACULTY' | 'MEMBER' | 'PENDING' }> = {}) {
  return jest.fn(async () =>
    jsonResponse({
      user: {
        id: 'member-1', name: '홍길동', email: 'hong@hra.kr', role: 'MEMBER', cohortId: null, imageUrl: null,
        ...overrides,
      },
    }),
  );
}

describe('ProfileScreen UI and interactions', () => {
  test('저장된 프로필을 즉시 표시하고 GET /api/v1/me 결과로 이메일과 이름을 갱신한다', async () => {
    // Given
    const send = mockMeUser({ name: '정약용', email: 'dasan@hra.kr' });
    mockedGetApiClient.mockReturnValue(createApiClient({ baseUrl: 'https://example.test', fetch: send }));
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'member-1', name: '초기이름', role: 'MEMBER' },
      role: 'MEMBER',
    });

    // When
    const view = await renderProfile(auth);

    // Then: 초기에는 저장된 이름과 이메일 기본 안내 표시 후 /me 응답으로 갱신
    await waitFor(() => {
      expect(view.getByTestId('profile-name-text')).toHaveTextContent('정약용');
      expect(view.getByTestId('profile-email-text')).toHaveTextContent('dasan@hra.kr');
    });
    expect(view.getByLabelText('회원')).toBeTruthy();
    expect(view.getByText('0.1.0')).toBeTruthy();
    expect(view.queryByTestId('profile-privacy-row')).toBeNull();

    // When: 내 과제 행 터치
    await fireEvent.press(view.getByTestId('profile-assignments-row'));
    // Then
    expect(mockPush).toHaveBeenCalledWith('/assignments');
    await view.unmount();
  });

  test('이메일이 null이면 기본 안내 문구를 표시하고 ADMIN/FACULTY에서는 내 과제 행을 숨긴다', async () => {
    // Given
    const send = mockMeUser({ id: 'admin-1', name: '관리자계정', email: null, role: 'ADMIN' });
    mockedGetApiClient.mockReturnValue(createApiClient({ baseUrl: 'https://example.test', fetch: send }));
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'admin-1', name: '관리자계정', role: 'ADMIN' },
      role: 'ADMIN',
    });

    // When
    const view = await renderProfile(auth);
    await waitFor(() => {
      expect(view.getByLabelText('관리자')).toBeTruthy();
    });

    // Then
    expect(view.getByTestId('profile-email-text')).toHaveTextContent(profileStrings.emptyEmail);
    expect(view.queryByTestId('profile-assignments-row')).toBeNull();
    await view.unmount();
  });

  test('로그아웃 확인 창에서 취소하면 아무 동작도 하지 않고 확인하면 logout을 호출한다', async () => {
    // Given
    mockedGetApiClient.mockReturnValue(createApiClient({ baseUrl: 'https://example.test', fetch: mockMeUser() }));
    const logout = jest.fn(async () => undefined);
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
      role: 'MEMBER',
      logout,
    });
    const alertSpy = jest.spyOn(Alert, 'alert');

    const view = await renderProfile(auth);

    // When 1: 로그아웃 클릭 후 취소 선택
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    await fireEvent.press(view.getByTestId('profile-logout-row'));
    expect(logout).not.toHaveBeenCalled();

    // When 2: 로그아웃 클릭 후 확인 선택
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(view.getByTestId('profile-logout-row'));

    // Then 2: logout 1회 호출됨
    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
    alertSpy.mockRestore();
    await view.unmount();
  });

  test('모든 기기에서 로그아웃은 모바일 기기 안내 문구를 포함하며 실패 시 한국어 오류 배너를 표시한다', async () => {
    // Given
    mockedGetApiClient.mockReturnValue(createApiClient({ baseUrl: 'https://example.test', fetch: mockMeUser() }));
    const logoutAll = jest.fn(async () => {
      throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
    });
    const auth = authValue({
      status: 'signedIn',
      user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
      role: 'MEMBER',
      logoutAll,
    });
    const alertSpy = jest.spyOn(Alert, 'alert');

    const view = await renderProfile(auth);

    // When 1: 취소 선택
    alertSpy.mockImplementationOnce((_title, message, buttons) => {
      expect(message).toContain('모바일 기기');
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    await fireEvent.press(view.getByTestId('profile-logout-all-row'));
    expect(logoutAll).not.toHaveBeenCalled();

    // When 2: 확인 선택 -> 서버 503 실패
    alertSpy.mockImplementationOnce((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await fireEvent.press(view.getByTestId('profile-logout-all-row'));

    // Then 2: 한국어 오류 배너가 표시되고 닫기 버튼으로 닫을 수 있음
    await waitFor(() => {
      expect(view.getByRole('alert')).toHaveTextContent(ko.errors.UNAVAILABLE);
    });
    await fireEvent.press(view.getByRole('button', { name: profileStrings.banners.dismissAction }));
    expect(view.queryByTestId('profile-action-error-banner')).toBeNull();
    alertSpy.mockRestore();
    await view.unmount();
  });
});
