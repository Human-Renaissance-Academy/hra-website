/**
 * 역할: 과제 제출 화면(AssignmentSubmitScreen) — 단계별 취소·중복 탭 방지·언마운트 중단·오류 매핑·429 카운트다운 RNTL 통합 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - validating ~ finalizing 각 단계에서의 취소 버튼 동작 검증
 * - 진행 중 중복 탭 방지(double-tap guard) 및 언마운트 시 안전한 중단 + 재개 레코드 보존 검증
 * - 429 retryAt 카운트다운 및 409/413/503/401/403/404 오류 매핑, canResume 분기("이어서 제출" vs "다시 시도") 검증
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { getResumeStore } from '../src/features/account/account-runtime';
import { AssignmentSubmitScreen } from '../src/features/assignments/assignment-submit-screen';
import { assignmentsStrings } from '../src/features/assignments/strings';
import type { ResumeRecord, ResumeStore } from '../src/features/submission/resume-store';
import type { createSubmitRunner } from '../src/features/submission/submit-runner';
import { authValue } from './screen-fixtures';
import { assignmentId, saved } from './submission-fixtures';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));

jest.mock('../src/auth/runtime', () => ({
  getApiClient: jest.fn(),
  getSessionManager: () => ({ getGeneration: () => 1 }),
}));

jest.mock('../src/features/account/account-runtime', () => ({
  getResumeStore: jest.fn(),
  getProtectedCache: jest.fn(),
  trackTransfer: jest.fn(() => () => undefined),
}));

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const auth = authValue({
    status: 'signedIn',
    user: { id: 'user-member-1', name: '김학사', role: 'MEMBER' },
    role: 'MEMBER',
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  }
  return { Wrapper };
}

function createFakeStore(initial: ResumeRecord | null = null): ResumeStore & {
  current: () => ResumeRecord | null;
} {
  let record = initial;
  return {
    current: () => record,
    read: jest.fn(async () => record),
    write: jest.fn(async (next: ResumeRecord) => { record = next; }),
    clear: jest.fn(async () => { record = null; }),
  };
}

const mockGet = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockResolvedValue({
    data: {
      assignment: {
        assignmentId,
        targetId: 'target-submit-1',
        title: '3주차 기말 보고서',
        status: 'PUBLISHED',
        dueAt: '2026-11-10T14:59:00.000Z',
        publishedAt: '2026-11-01T00:00:00.000Z',
        instructions: 'PDF 한 개를 제출하세요.',
        submission: null,
        file: null,
      },
    },
  });
  jest.mocked(getApiClient).mockReturnValue({
    GET: mockGet,
  } as unknown as ReturnType<typeof getApiClient>);
  jest.mocked(getResumeStore).mockReturnValue(createFakeStore(null));
});

describe('AssignmentSubmitScreen — 취소·중복 탭 방지·언마운트 중단·오류 매핑', () => {
  test.each([
    'validating',
    'creatingIntent',
    'authorizing',
    'uploading',
    'verifying',
    'finalizing',
  ] as const)('%s 단계에서 제출 취소 버튼을 누르면 최종화하지 않고 취소 상태를 표시한다', async (targetStage) => {
    // Given
    const store = createFakeStore(null);
    jest.mocked(getResumeStore).mockReturnValue(store);

    const runner: ReturnType<typeof createSubmitRunner> = async (command, controls) => {
      if (command.kind === 'new') {
        if (targetStage === 'uploading') {
          controls?.onEvent?.({ state: 'uploading', percentage: 65 });
        } else {
          controls?.onEvent?.({ state: targetStage });
        }
        await new Promise<void>((resolve) => {
          controls?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        controls?.onEvent?.({ state: 'cancelling' });
        controls?.onEvent?.({ state: 'cancelled' });
        return { kind: 'cancelled' };
      }
      return { kind: 'cancelled' };
    };

    const pickPdf = jest.fn(async () => [
      { uri: 'file:///cache/step.pdf', name: 'step.pdf', size: 1024, mimeType: 'application/pdf' },
    ]);
    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen assignmentId={assignmentId} runner={runner} pickPdf={pickPdf} />
      </Wrapper>,
    );

    await waitFor(() => expect(view.getByText('3주차 기말 보고서')).toBeTruthy());
    await fireEvent.press(view.getByTestId('submit-pick-pdf-button'));
    await waitFor(() => expect(view.getByTestId('submit-confirmation-card')).toBeTruthy());

    // When: 제출 시작 후 진행 단계에서 취소 버튼 클릭
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));
    await waitFor(() => expect(view.getByTestId('submit-cancel-button')).toBeTruthy());
    await fireEvent.press(view.getByTestId('submit-cancel-button'));

    // Then
    await waitFor(() => expect(view.getByText(assignmentsStrings.submit.steps.cancelled)).toBeTruthy());
  });

  test('제출 진행 중에는 중복 탭을 차단하고 언마운트 시 진행 중인 요청을 중단하되 재개 레코드는 보존한다', async () => {
    // Given
    const store = createFakeStore(saved);
    jest.mocked(getResumeStore).mockReturnValue(store);
    let capturedSignal: AbortSignal | undefined;
    const runner = jest.fn(
      (
        _command: unknown,
        controls?: {
          readonly signal?: AbortSignal;
          readonly onEvent?: (e: { state: 'uploading'; percentage: number }) => void;
        },
      ) =>
        new Promise<{ readonly kind: 'cancelled' }>((resolve) => {
          capturedSignal = controls?.signal;
          controls?.onEvent?.({ state: 'uploading', percentage: 30 });
          controls?.signal?.addEventListener('abort', () => resolve({ kind: 'cancelled' }), { once: true });
        }),
    );

    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen assignmentId={assignmentId} initialMode="resume" runner={runner} />
      </Wrapper>,
    );

    await waitFor(() => expect(view.getByTestId('submit-primary-action-button')).toBeEnabled());

    // When: 첫 번째 탭으로 제출 시작 후 두 번째 탭 시도
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));
    await waitFor(() => expect(view.getByTestId('submit-primary-action-button')).toBeDisabled());
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));
    expect(runner).toHaveBeenCalledTimes(1);

    // When: 진행 중 화면 언마운트
    await view.unmount();

    // Then: AbortController 중단 및 재개 레코드 유지
    expect(capturedSignal?.aborted).toBe(true);
    expect(store.current()).toEqual(saved);
  });

  test('429 RATE_LIMITED 응답 시 retryAt 카운트다운 동안 제출 버튼을 비활성화하고 시간 경과 후 활성화한다', async () => {
    // Given
    let currentNow = 10_000;
    const store = createFakeStore(saved);
    jest.mocked(getResumeStore).mockReturnValue(store);
    const runner = jest.fn(async () => ({
      kind: 'error' as const,
      error: new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 2 }),
      retryAt: currentNow + 2000,
      canResume: true,
    }));

    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen assignmentId={assignmentId} initialMode="resume" now={() => currentNow} runner={runner} />
      </Wrapper>,
    );

    await waitFor(() => expect(view.getByTestId('submit-primary-action-button')).toBeEnabled());

    jest.useFakeTimers();
    try {
      // When
      await fireEvent.press(view.getByTestId('submit-primary-action-button'));

      // Then: 2초 카운트다운 표시 및 버튼 비활성화
      expect(view.getByText('요청이 많습니다. 2초 후 다시 시도해 주세요.')).toBeTruthy();
      expect(view.getByTestId('submit-primary-action-button')).toBeDisabled();

      // When: 2초 경과
      currentNow += 2000;
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Then: 다시 이어서 제출 가능
      expect(view.getByTestId('submit-primary-action-button')).toBeEnabled();
      await view.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    [new ApiError({ status: 409, code: 'CONFLICT' }), false, assignmentsStrings.errors.conflictSubmission, '다시 시도'],
    [new ApiError({ status: 413, code: 'TOO_LARGE' }), false, assignmentsStrings.errors.tooLarge, '다시 시도'],
    [new ApiError({ status: 503, code: 'DISABLED' }), true, assignmentsStrings.errors.academicDisabled, '이어서 제출'],
    [new ApiError({ status: 503, code: 'STORAGE_UNAVAILABLE' }), true, assignmentsStrings.errors.storageUnavailable, '이어서 제출'],
    [new ApiError({ status: 503, code: 'UNAVAILABLE' }), true, assignmentsStrings.errors.serviceUnavailable, '이어서 제출'],
    [new ApiError({ status: 401, code: 'UNAUTHENTICATED' }), true, assignmentsStrings.errors.unauthenticated, '이어서 제출'],
    [new ApiError({ status: 403, code: 'FORBIDDEN' }), false, assignmentsStrings.errors.forbiddenRole, '다시 시도'],
    [new ApiError({ status: 404, code: 'NOT_FOUND' }), false, assignmentsStrings.errors.notFoundAssignment, '다시 시도'],
  ])('제출 오류 %o (canResume=%s) 발생 시 한국어 안내와 %s 버튼을 표시한다', async (error, canResume, expectedMessage, expectedActionLabel) => {
    // Given
    const store = createFakeStore(saved);
    jest.mocked(getResumeStore).mockReturnValue(store);
    const runner = jest.fn(async () => ({
      kind: 'error' as const,
      error,
      retryAt: null,
      canResume,
    }));

    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen
          assignmentId={assignmentId}
          initialMode="resume"
          runner={runner}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(view.getByTestId('submit-primary-action-button')).toBeTruthy();
    });

    // When
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));

    // Then
    await waitFor(() => {
      expect(view.getByText(expectedMessage)).toBeTruthy();
    });
    expect(view.getByRole('button', { name: expectedActionLabel })).toBeTruthy();
  });
});
