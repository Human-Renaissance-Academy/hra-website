/**
 * 역할: 과제 상세 화면(AssignmentDetailScreen) RNTL 통합 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 일반 텍스트 지침(줄바꿈 유지·selectable), 상태 칩(마감 경계), 재개 배너("이어서 제출" / "처음부터 다시"), "내 제출 파일 열기"(진행률·취소·열기), "제출하기"/"다시 제출하기" 노출 조건 검증
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import {
  getProtectedCache,
  getResumeStore,
  trackTransfer,
} from '../src/features/account/account-runtime';
import { AssignmentDetailScreen } from '../src/features/assignments/assignment-detail-screen';
import { assignmentsStrings } from '../src/features/assignments/strings';
import { downloadProtectedFile } from '../src/features/files/download-protected-file';
import { openProtectedFile } from '../src/features/files/open-file';
import type { ResumeRecord, ResumeStore } from '../src/features/submission/resume-store';
import { memoryFiles } from './file-fixtures';
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
  getSessionManager: jest.fn(),
}));

jest.mock('../src/features/account/account-runtime', () => ({
  getResumeStore: jest.fn(),
  getProtectedCache: jest.fn(),
  trackTransfer: jest.fn(() => () => undefined),
}));

jest.mock('../src/features/files/download-protected-file', () => {
  const actual = jest.requireActual<typeof import('../src/features/files/download-protected-file')>(
    '../src/features/files/download-protected-file',
  );
  return {
    ...actual,
    downloadProtectedFile: jest.fn(),
  };
});

jest.mock('../src/features/files/open-file', () => ({
  openProtectedFile: jest.fn(async () => undefined),
}));

const FIXED_NOW = '2026-11-05T10:00:00.000Z';

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
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

function createFakeResumeStore(initial: ResumeRecord | null = null): ResumeStore & {
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
const mockDelete = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getApiClient).mockReturnValue({
    GET: mockGet,
    DELETE: mockDelete,
  } as unknown as ReturnType<typeof getApiClient>);
  jest.mocked(getProtectedCache).mockReturnValue({
    sweepProtectedCache: jest.fn(async () => undefined),
    clearProtectedCache: jest.fn(async () => undefined),
  });
  jest.mocked(getResumeStore).mockReturnValue(createFakeResumeStore(null));
});

describe('AssignmentDetailScreen', () => {
  test('일반 텍스트 지침(줄바꿈·selectable)을 표시하고 재개 배너의 이어서 제출/처음부터 다시를 처리한다', async () => {
    // Given
    const store = createFakeResumeStore(saved);
    jest.mocked(getResumeStore).mockReturnValue(store);
    mockDelete.mockResolvedValue({ data: { state: 'CANCELLED' } });
    mockGet.mockResolvedValue({
      data: {
        assignment: {
          assignmentId,
          targetId: 'target-detail-1',
          title: '과제 상세 제목',
          status: 'PUBLISHED',
          dueAt: '2026-11-07T14:59:00.000Z',
          publishedAt: '2026-11-01T00:00:00.000Z',
          instructions: '첫째 줄 지침\n# 마크다운 아님\n셋째 줄 지침',
          submission: null,
          file: null,
        },
      },
    });
    const { Wrapper } = createTestWrapper();

    // When
    const view = await render(
      <Wrapper>
        <AssignmentDetailScreen assignmentId={assignmentId} clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByText('과제 상세 제목')).toBeTruthy();
    });
    const instructionsNode = view.getByTestId('assignment-instructions-text');
    expect(instructionsNode).toHaveProp('selectable', true);
    expect(instructionsNode).toHaveTextContent('첫째 줄 지침\n# 마크다운 아님\n셋째 줄 지침');
    expect(view.getByTestId('assignment-resume-banner')).toBeTruthy();
    expect(view.getByRole('button', { name: '제출하기' })).toBeTruthy();

    // When: 이어서 제출 클릭
    await fireEvent.press(view.getByTestId('assignment-resume-continue-button'));
    expect(mockPush).toHaveBeenCalledWith(`/assignments/${assignmentId}/submit?mode=resume`);

    // When: 처음부터 다시 클릭
    await fireEvent.press(view.getByTestId('assignment-resume-reset-button'));
    await waitFor(() => {
      expect(view.queryByTestId('assignment-resume-banner')).toBeNull();
    });
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/uploads/intents/{id}', {
      params: { path: { id: saved.uploadIntentId } },
      body: { assignmentId },
    });
    expect(store.current()).toBeNull();
  });

  test('제출 내역이 있으면 다시 제출하기와 내 제출 파일 열기(진행률·취소·열기)를 제공한다', async () => {
    // Given
    const { fs } = memoryFiles();
    mockGet.mockResolvedValue({
      data: {
        assignment: {
          assignmentId,
          targetId: 'target-detail-2',
          title: '제출 완료 과제',
          status: 'PUBLISHED',
          dueAt: '2026-11-07T14:59:00.000Z',
          publishedAt: '2026-11-01T00:00:00.000Z',
          instructions: '안내 문구',
          submission: {
            submissionId: 'sub-99',
            submittedAt: '2026-11-04T03:00:00.000Z',
          },
          file: {
            fileId: 'file-99',
            originalName: '최종본.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024 * 512,
          },
        },
      },
    });

    let resolveDownload: ((value: { uri: string; fileName: string; sizeBytes: number }) => void) | undefined;
    jest.mocked(downloadProtectedFile).mockImplementationOnce((options) => {
      options.onProgress?.({ receivedBytes: 256, totalBytes: 512 });
      return new Promise((resolve) => {
        resolveDownload = resolve;
      });
    });

    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentDetailScreen
          assignmentId={assignmentId}
          clock={() => FIXED_NOW}
          fileSystemPort={fs}
        />
      </Wrapper>,
    );

    // Then: 파일 메타데이터와 다시 제출하기 버튼 표시
    await waitFor(() => {
      expect(view.getByTestId('assignment-submitted-file-meta')).toHaveTextContent(
        '최종본.pdf (512.0 KiB)',
      );
    });
    expect(view.getByRole('button', { name: '다시 제출하기' })).toBeTruthy();

    // When: 내 제출 파일 열기 클릭 -> 진행률(50%) 표시 후 완료
    await fireEvent.press(view.getByTestId('assignment-open-file-button'));
    expect(trackTransfer).toHaveBeenCalledTimes(1);
    expect(view.getByText('제출 파일을 내려받는 중입니다 (50%)')).toBeTruthy();

    await act(async () => {
      resolveDownload?.({
        uri: 'cache://최종본.pdf',
        fileName: '최종본.pdf',
        sizeBytes: 524288,
      });
    });

    await waitFor(() => {
      expect(openProtectedFile).toHaveBeenCalledWith('cache://최종본.pdf', fs);
    });

    // When: 두 번째 다운로드 시작 후 취소 버튼 클릭
    jest.mocked(downloadProtectedFile).mockImplementationOnce((options) => {
      options.onProgress?.({ receivedBytes: 100, totalBytes: 500 });
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new ApiError({ status: 0, code: 'NETWORK' }));
        });
      });
    });

    await fireEvent.press(view.getByTestId('assignment-open-file-button'));
    await fireEvent.press(
      view.getByRole('button', { name: assignmentsStrings.fileDownload.cancelAction }),
    );

    await waitFor(() => {
      expect(view.getByText(assignmentsStrings.fileDownload.cancelled)).toBeTruthy();
    });
  });

  test('마감이 지났거나 CLOSED인 과제는 제출하기 버튼을 숨기고 마감 안내를 표시한다', async () => {
    // Given
    mockGet.mockResolvedValue({
      data: {
        assignment: {
          assignmentId,
          targetId: 'target-closed',
          title: '마감된 과제',
          status: 'PUBLISHED',
          dueAt: FIXED_NOW, // dueAt <= now
          publishedAt: '2026-11-01T00:00:00.000Z',
          instructions: '안내',
          submission: null,
          file: null,
        },
      },
    });
    const { Wrapper } = createTestWrapper();

    // When
    const view = await render(
      <Wrapper>
        <AssignmentDetailScreen assignmentId={assignmentId} clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByText('마감된 과제')).toBeTruthy();
    });
    expect(view.queryByTestId('assignment-primary-submit-button')).toBeNull();
    expect(view.getByText(assignmentsStrings.detail.closedNotice)).toBeTruthy();
  });
});
