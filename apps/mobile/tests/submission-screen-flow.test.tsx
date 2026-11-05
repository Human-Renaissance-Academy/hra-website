/**
 * 역할: 과제 제출 화면(AssignmentSubmitScreen) — 파일 선택·검증·확인 카드·제출 완료·재개 RNTL 통합 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - PDF 파일 선택 -> validatePdf 검증 오류("비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요.") 및 캐시 사본 삭제 검증
 * - 확인 카드 표시, 전체 제출 성공 시 쿼리 무효화·재개 기록 삭제·캐시 사본 삭제 검증
 * - 재개(resume) 성공 시 replayed: true 응답 안내 문구 검증
 */
import type { ReactNode } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import {
  getResumeStore,
  trackTransfer,
} from '../src/features/account/account-runtime';
import { AssignmentSubmitScreen } from '../src/features/assignments/assignment-submit-screen';
import { assignmentsStrings } from '../src/features/assignments/strings';
import type { ResumeRecord, ResumeStore } from '../src/features/submission/resume-store';
import { createSubmitRunner } from '../src/features/submission/submit-runner';
import { authValue } from './screen-fixtures';
import {
  assignmentId,
  fixture as createSubmissionFixture,
  saved,
  submitted,
} from './submission-fixtures';

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
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
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
  return { Wrapper, invalidateSpy };
}

function createFakeStore(initial: ResumeRecord | null = null): ResumeStore & {
  current: () => ResumeRecord | null;
} {
  let record = initial;
  return {
    current: () => record,
    read: jest.fn(async () => record),
    write: jest.fn(async (next: ResumeRecord) => {
      record = next;
    }),
    clear: jest.fn(async () => {
      record = null;
    }),
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

describe('AssignmentSubmitScreen — 파일 선택·검증·확인 카드·제출 완료', () => {
  test('유효하지 않은 파일 선택 시 지정된 한국어 검증 문구를 표시하고 캐시 사본을 즉시 삭제한다', async () => {
    // Given
    const cleanupPickedFile = jest.fn();
    const pickPdf = jest.fn(async () => [
      {
        uri: 'file:///cache/invalid-large.pdf',
        name: 'invalid-large.pdf',
        size: 55 * 1024 * 1024,
        mimeType: 'application/pdf',
      },
    ]);
    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen
          assignmentId={assignmentId}
          pickPdf={pickPdf}
          cleanupPickedFile={cleanupPickedFile}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(view.getByText('3주차 기말 보고서')).toBeTruthy();
    });

    // When
    await fireEvent.press(view.getByTestId('submit-pick-pdf-button'));

    // Then
    await waitFor(() => {
      expect(
        view.getByText('비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요.'),
      ).toBeTruthy();
    });
    expect(cleanupPickedFile).toHaveBeenCalledWith('file:///cache/invalid-large.pdf');
    expect(view.getByTestId('submit-primary-action-button')).toBeDisabled();
  });

  test('PDF 선택 후 확인 카드를 표시하고 전체 제출 성공 시 쿼리 무효화·재개 기록 삭제·캐시 파일 삭제를 수행한다', async () => {
    // Given
    const f = createSubmissionFixture();
    const store = createFakeStore(null);
    jest.mocked(getResumeStore).mockReturnValue(store);
    const untrackSpy = jest.fn();
    jest.mocked(trackTransfer).mockReturnValue(untrackSpy);
    const cleanupPickedFile = jest.fn();
    const pickPdf = jest.fn(async () => [
      {
        uri: 'file:///cache/picked-report.pdf',
        name: '기말보고서.pdf',
        size: 2048,
        mimeType: 'application/pdf',
      },
    ]);
    const runner = createSubmitRunner({ ...f.deps, store });
    const { Wrapper, invalidateSpy } = createTestWrapper();

    const view = await render(
      <Wrapper>
        <AssignmentSubmitScreen
          assignmentId={assignmentId}
          runner={runner}
          pickPdf={pickPdf}
          cleanupPickedFile={cleanupPickedFile}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(view.getByText('3주차 기말 보고서')).toBeTruthy();
    });

    // When: 파일 선택
    await fireEvent.press(view.getByTestId('submit-pick-pdf-button'));
    await waitFor(() => {
      expect(view.getByTestId('submit-confirmation-card')).toBeTruthy();
    });
    expect(view.getByTestId('submit-selected-file-name')).toHaveTextContent(
      '파일 이름: 기말보고서.pdf',
    );
    expect(view.getByTestId('submit-selected-file-size')).toHaveTextContent('파일 크기: 2.0 KiB');

    // When: 제출하기 실행
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));

    // Then: 완료 카드, 쿼리 무효화, trackTransfer 해제, 캐시 파일 삭제 확인
    await waitFor(() => {
      expect(view.getByTestId('submit-success-card')).toBeTruthy();
    });
    expect(view.getByText('제출이 완료되었습니다.')).toBeTruthy();
    expect(view.getByTestId('submit-completion-description')).toHaveTextContent(
      assignmentsStrings.submit.steps.successDescription,
    );
    expect(trackTransfer).toHaveBeenCalledTimes(1);
    expect(untrackSpy).toHaveBeenCalledTimes(1);
    expect(cleanupPickedFile).toHaveBeenCalledWith('file:///cache/picked-report.pdf');
    expect(invalidateSpy).toHaveBeenCalled();
    expect(store.current()).toBeNull();

    await fireEvent.press(view.getByTestId('submit-back-to-detail-button'));
    expect(mockReplace).toHaveBeenCalledWith(`/assignments/${assignmentId}`);
  });

  test('재개(resume) 성공 시 replayed: true 응답을 이미 접수된 제출 완료 안내로 표시한다', async () => {
    // Given
    const f = createSubmissionFixture();
    const store = createFakeStore({ ...saved, phase: 'finalizing' });
    jest.mocked(getResumeStore).mockReturnValue(store);
    const runner = createSubmitRunner({
      ...f.deps,
      store,
      api: {
        ...f.api,
        finalize: async () => ({ ...submitted, replayed: true }),
      },
    });
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
      expect(view.getByTestId('submit-resume-ready-box')).toBeTruthy();
    });
    expect(view.getByRole('button', { name: '이어서 제출' })).toBeTruthy();

    // When
    await fireEvent.press(view.getByTestId('submit-primary-action-button'));

    // Then
    await waitFor(() => {
      expect(view.getByTestId('submit-success-card')).toBeTruthy();
    });
    expect(view.getByTestId('submit-completion-description')).toHaveTextContent(
      assignmentsStrings.submit.steps.replayedDescription,
    );
  });
});
