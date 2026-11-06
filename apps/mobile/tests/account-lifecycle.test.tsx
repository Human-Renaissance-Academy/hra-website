/**
 * 역할: 승인 영역 레이아웃(app/(app)/_layout.tsx) 및 계정 수명 주기(src/features/account/account-runtime.ts) 통합 테스트
 * 사용 위치: apps/mobile/tests/account-lifecycle.test.tsx
 * 주요 기능:
 * - RouteGuard(scope="app")를 통한 PENDING·미인증 차단 및 승인 계정 마운트 시 startAccountLifecycle 단일 시작 검증
 * - 세션 세대 변경(로그아웃·계정 전환) 시 진행 중 전송(trackTransfer) 중단 및 보호 캐시·재개 저장소 삭제 검증
 * - 캐시 정리 오류 보고 시 닫을 수 있는 한국어 InlineBanner 표시 검증
 */
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AppLayout from '../app/(app)/_layout';
import { AccountLifecycle } from '../src/features/account/account-lifecycle';
import { AuthContext } from '../src/auth/auth-context';
import {
  getProtectedCache,
  getResumeStore,
  startAccountLifecycle,
  trackTransfer,
} from '../src/features/account/account-runtime';
import { profileStrings } from '../src/features/profile/strings';
import { ko } from '../src/i18n/ko';
import { authValue } from './screen-fixtures';

let mockGeneration = 1;
const sessionListeners = new Set<() => void>();
const mockSubscribe = jest.fn((listener: () => void) => {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
});
const mockSweepProtectedCache = jest.fn(async () => undefined);
const mockClearProtectedCache = jest.fn(async () => undefined);
const clearedResumeUsers: string[] = [];

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => (
      <MockText testID="redirect">{href}</MockText>
    ),
    Slot: () => <MockText testID="approved-slot">승인 영역 콘텐츠</MockText>,
  };
});

jest.mock('../src/auth/runtime', () => ({
  getSessionManager: () => ({
    getGeneration: () => mockGeneration,
    getSnapshot: () => ({ user: null }),
    subscribe: (listener: () => void) => mockSubscribe(listener),
  }),
  getApiClient: jest.fn(),
}));

jest.mock('../src/features/files/expo-file-system-port', () => ({
  createExpoFileSystemPort: jest.fn(() => ({})),
}));
jest.mock('../src/features/files/submission-files', () => ({ sweepSubmissionFiles: async () => undefined }));

jest.mock('../src/features/files/protected-cache', () => ({
  createProtectedCache: jest.fn(() => ({
    sweepProtectedCache: () => mockSweepProtectedCache(),
    clearProtectedCache: () => mockClearProtectedCache(),
  })),
}));

jest.mock('../src/features/submission/secure-resume-store', () => ({
  createSecureResumeStore: jest.fn((userId: string) => ({
    read: jest.fn(async () => null),
    write: jest.fn(async () => undefined),
    clear: jest.fn(async () => {
      clearedResumeUsers.push(userId);
    }),
  })),
}));

beforeEach(() => {
  mockGeneration = 1;
  sessionListeners.clear();
  mockSubscribe.mockClear();
  mockSweepProtectedCache.mockReset().mockResolvedValue(undefined);
  mockClearProtectedCache.mockReset().mockResolvedValue(undefined);
  clearedResumeUsers.length = 0;
});

test('PENDING 또는 미인증 사용자는 승인 영역에 진입하지 못하며 계정 수명 주기를 시작하지 않는다', async () => {
  // Given
  const pendingAuth = authValue({
    status: 'signedIn',
    user: { id: 'pending-1', name: '대기자', role: 'PENDING' },
    role: 'PENDING',
    isPending: true,
  });

  // When
  const view = await render(
    <AuthContext.Provider value={pendingAuth}>
      <AppLayout />
    </AuthContext.Provider>,
  );

  // Then
  expect(view.getByTestId('redirect')).toHaveTextContent('/pending');
  expect(view.queryByTestId('approved-slot')).toBeNull();
  expect(mockSubscribe).not.toHaveBeenCalled();
  await view.unmount();
});

test('승인 영역 마운트 동안 수명 주기를 한 번만 시작하고 세대 변경 시 전송 중단·캐시·재개 기록을 지운다', async () => {
  // Given
  const memberAuth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When: 승인 영역 마운트 및 리렌더
  const view = await render(
    <AuthContext.Provider value={memberAuth}>
      <AccountLifecycle />
      <AppLayout />
    </AuthContext.Provider>,
  );
  await view.rerender(
    <AuthContext.Provider value={memberAuth}>
      <AccountLifecycle />
      <AppLayout />
    </AuthContext.Provider>,
  );

  // Then: 세션 구독 및 초기 24시간 캐시 정리는 단 1회만 시작됨
  expect(view.getByTestId('approved-slot')).toBeTruthy();
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockClearProtectedCache).toHaveBeenCalledTimes(1);
  expect(getProtectedCache()).toBeDefined();

  // Given: 진행 중 전송 controller 및 재개 저장소 등록
  getResumeStore('member-1');
  const controller = new AbortController();
  const untrack = trackTransfer(controller);
  controller.signal.addEventListener('abort', untrack);

  // When: 세션 세대 변경(로그아웃 또는 계정 전환) 발생
  await act(async () => {
    mockGeneration += 1;
    for (const listener of sessionListeners) {
      listener();
    }
  });

  // Then: 진행 중 전송이 즉시 중단되고 보호 캐시와 이전 계정의 재개 기록이 삭제됨
  await waitFor(() => {
    expect(controller.signal.aborted).toBe(true);
    expect(mockClearProtectedCache).toHaveBeenCalledTimes(2);
    expect(clearedResumeUsers).toEqual(['member-1']);
  });

  untrack();
  await view.unmount();
  expect(sessionListeners.size).toBe(0);
});

test('캐시 정리 중 오류가 보고되면 닫을 수 있는 한국어 InlineBanner를 표시한다', async () => {
  // Given: 초기 캐시 정리가 실패하는 상태
  mockClearProtectedCache.mockRejectedValueOnce(new Error('disk full'));
  const memberAuth = authValue({
    status: 'signedIn',
    user: { id: 'member-1', name: '홍길동', role: 'MEMBER' },
    role: 'MEMBER',
  });

  // When
  const view = await render(
    <AuthContext.Provider value={memberAuth}>
      <AccountLifecycle />
      <AppLayout />
    </AuthContext.Provider>,
  );

  // Then: STORAGE_UNAVAILABLE 한국어 배너가 표시되고 닫기 버튼으로 해제 가능
  await waitFor(() => {
    expect(view.getByRole('alert')).toHaveTextContent(ko.errors.STORAGE_UNAVAILABLE);
  });

  await fireEvent.press(
    view.getByRole('button', { name: profileStrings.banners.dismissAction }),
  );
  expect(view.queryByTestId('account-cleanup-error-banner')).toBeNull();
  await view.unmount();
});

test('startAccountLifecycle 직접 호출 시 중복 호출을 멱등하게 처리하고 해제 시 진행 중 전송을 중단한다', () => {
  // Given
  const onError = jest.fn();
  const stopFirst = startAccountLifecycle(onError);
  const stopSecond = startAccountLifecycle(onError);
  const controller = new AbortController();
  trackTransfer(controller);

  // When
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  stopFirst();
  stopSecond();

  // Then
  expect(controller.signal.aborted).toBe(true);
  expect(<Text>정상</Text>).toBeTruthy();
});
