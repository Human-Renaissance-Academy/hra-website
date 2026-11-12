/**
 * 역할: 내 정보(Profile) 순수 헬퍼 및 /api/v1/me 오류 복구·계정 격리 테스트
 * 사용 위치: apps/mobile/tests/profile-model.test.tsx
 * 주요 기능:
 * - 이메일 폴백, 앱 버전 정규화, 개인정보 처리방침 HTTPS 검증 및 권한 불변성 검증
 * - GET /api/v1/me 실패 시 저장된 프로필 유지 및 재시도 복구, 사용자별 쿼리 키 격리 검증
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfileScreen from '../app/(app)/(tabs)/profile';
import { createApiClient } from '../src/api/client';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import {
  buildProfileDisplayView,
  profileQueryKeys,
  resolveAppVersion,
  resolvePrivacyPolicyUrl,
} from '../src/features/profile/model';
import { ko } from '../src/i18n/ko';
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
  mockedGetApiClient.mockReset();
});

afterEach(() => {
  for (const client of activeClients.splice(0)) {
    client.clear();
  }
});

describe('profile pure model helpers and recovery', () => {
  test('이메일 폴백, 버전 정규화, 개인정보 처리방침 HTTPS 검증 및 쿼리 키 격리를 수행한다', () => {
    // Given / When / Then
    expect(resolveAppVersion(' 1.2.3 ')).toBe('1.2.3');
    expect(resolveAppVersion('')).toBe('0.1.0');
    expect(resolvePrivacyPolicyUrl('')).toBeNull();
    expect(resolvePrivacyPolicyUrl('http://insecure.example.com/privacy')).toBeNull();
    expect(resolvePrivacyPolicyUrl('https://hra.example.com/privacy')).toBe(
      'https://hra.example.com/privacy',
    );
    expect(profileQueryKeys.me('user-a')).not.toEqual(profileQueryKeys.me('user-b'));
  });

  test('/api/v1/me 응답은 표시만 갱신하며 내 과제 권한(showAssignmentsRow)을 부여하지 않는다', () => {
    // Given: 세션은 FACULTY이나 /me 응답이 MEMBER를 반환한 경우
    const view = buildProfileDisplayView({
      sessionUser: { id: 'u-1', name: '저장 이름', role: 'FACULTY' },
      sessionRole: 'FACULTY',
      meUser: {
        id: 'u-1',
        name: '최신 이름',
        email: 'faculty@hra.kr',
        role: 'MEMBER',
        cohortId: null,
        imageUrl: null,
      },
    });

    // Then: 이름·이메일은 갱신되지만 내 과제 행은 숨겨짐
    expect(view.name).toBe('최신 이름');
    expect(view.emailText).toBe('faculty@hra.kr');
    expect(view.showAssignmentsRow).toBe(false);
  });

  test('GET /api/v1/me 조회가 실패해도 저장된 프로필을 유지하고 재시도 배너를 제공한다', async () => {
    // Given
    let attempts = 0;
    const send = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse(
          { error: { code: 'UNAVAILABLE', message: '장애', requestId: 'req-1' } },
          503,
        );
      }
      return jsonResponse({
        user: {
          id: 'member-1',
          name: '복구된이름',
          email: 'recovered@hra.kr',
          role: 'MEMBER',
          cohortId: null,
          imageUrl: null,
        },
      });
    });
    mockedGetApiClient.mockReturnValue(
      createApiClient({ baseUrl: 'https://example.test', fetch: send }),
    );

    const auth = authValue({
      status: 'signedIn',
      user: { id: 'member-1', name: '저장된이름', role: 'MEMBER' },
      role: 'MEMBER',
    });

    // When
    const view = await renderProfile(auth);
    await waitFor(() => {
      expect(view.getByTestId('profile-me-error-banner')).toBeTruthy();
    });

    // Then: 저장된 이름은 그대로 보이며 다시 시도로 복구 가능
    expect(view.getByTestId('profile-name-text')).toHaveTextContent('저장된이름');
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));
    await waitFor(() => {
      expect(view.getByTestId('profile-name-text')).toHaveTextContent('복구된이름');
      expect(view.getByTestId('profile-email-text')).toHaveTextContent('recovered@hra.kr');
    });
    await view.unmount();
  });
});
