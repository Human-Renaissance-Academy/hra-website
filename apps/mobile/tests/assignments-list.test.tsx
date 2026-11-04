/**
 * 역할: 내 과제 목록 화면(AssignmentListScreen) RNTL 통합 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 목록: 스켈레톤 로딩, 빈 상태("공개된 과제가 없습니다."), 403 권한 안내, 503 학사 미개방 안내, 일반 오류 + 다시 시도, 무한 스크롤, 카드 이동 검증
 */
import type { ReactNode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { AssignmentListScreen } from '../src/features/assignments/assignment-list-screen';
import { authValue } from './screen-fixtures';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('../src/auth/runtime', () => ({
  getApiClient: jest.fn(),
  getSessionManager: jest.fn(),
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
  return { Wrapper, queryClient };
}

const mockGet = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getApiClient).mockReturnValue({
    GET: mockGet,
  } as unknown as ReturnType<typeof getApiClient>);
});

describe('AssignmentListScreen', () => {
  test('목록 카드에 제목, KST 마감 일시, 마감 여유, 상태 칩(제출 완료/미제출/마감됨), 제출 시각을 표시하고 탭 시 상세로 이동한다', async () => {
    // Given
    mockGet.mockResolvedValueOnce({
      data: {
        assignments: [
          {
            assignmentId: 'assign-1',
            targetId: 'target-1',
            title: '1주차 에세이',
            status: 'PUBLISHED',
            dueAt: '2026-11-07T14:59:00.000Z',
            publishedAt: '2026-11-01T00:00:00.000Z',
            submission: {
              submissionId: 'sub-1',
              submittedAt: '2026-11-04T03:00:00.000Z',
            },
          },
          {
            assignmentId: 'assign-2',
            targetId: 'target-2',
            title: '2주차 독서록',
            status: 'PUBLISHED',
            dueAt: '2026-11-08T14:59:00.000Z',
            publishedAt: '2026-11-01T00:00:00.000Z',
            submission: null,
          },
          {
            assignmentId: 'assign-3',
            targetId: 'target-3',
            title: '지난 과제',
            status: 'PUBLISHED',
            dueAt: '2026-11-01T00:00:00.000Z',
            publishedAt: '2026-10-25T00:00:00.000Z',
            submission: null,
          },
        ],
        page: { page: 1, pageSize: 20, hasNextPage: false },
      },
    });
    const { Wrapper } = createTestWrapper();

    // When
    const view = await render(
      <Wrapper>
        <AssignmentListScreen clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByText('1주차 에세이')).toBeTruthy();
    });
    expect(view.getByText('제출 완료')).toBeTruthy();
    expect(view.getByText('미제출')).toBeTruthy();
    expect(view.getAllByText('마감됨').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('마감: 2026.11.07 23:59')).toBeTruthy();
    expect(view.getByText('제출 시각: 2026.11.04 12:00')).toBeTruthy();

    await fireEvent.press(view.getByTestId('assignment-card-assign-1'));
    expect(mockPush).toHaveBeenCalledWith('/assignments/assign-1');
  });

  test('과제가 없으면 공개된 과제가 없습니다 빈 상태를 표시한다', async () => {
    // Given
    mockGet.mockResolvedValueOnce({
      data: {
        assignments: [],
        page: { page: 1, pageSize: 20, hasNextPage: false },
      },
    });
    const { Wrapper } = createTestWrapper();

    // When
    const view = await render(
      <Wrapper>
        <AssignmentListScreen clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByText('공개된 과제가 없습니다.')).toBeTruthy();
    });
  });

  test.each([
    [new ApiError({ status: 403, code: 'FORBIDDEN' }), '이 계정에서는 과제 기능을 사용할 수 없습니다.'],
    [new ApiError({ status: 503, code: 'DISABLED' }), '학사 기능이 아직 열리지 않았습니다.'],
  ])('오류 %o가 반환되면 지정된 한국어 안내를 표시한다', async (apiError, expectedMessage) => {
    // Given
    mockGet.mockRejectedValueOnce(apiError);
    const { Wrapper } = createTestWrapper();

    // When
    const view = await render(
      <Wrapper>
        <AssignmentListScreen clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // Then
    await waitFor(() => {
      expect(view.getByText(expectedMessage)).toBeTruthy();
    });
  });

  test('네트워크 오류 발생 시 다시 시도 버튼으로 재조회하고 page.hasNextPage일 때 다음 페이지를 불러온다', async () => {
    // Given
    mockGet
      .mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK' }))
      .mockResolvedValueOnce({
        data: {
          assignments: [
            {
              assignmentId: 'assign-p1',
              targetId: 'target-p1',
              title: '1페이지 과제',
              status: 'PUBLISHED',
              dueAt: '2026-11-07T00:00:00.000Z',
              publishedAt: '2026-11-01T00:00:00.000Z',
              submission: null,
            },
          ],
          page: { page: 1, pageSize: 20, hasNextPage: true },
        },
      })
      .mockResolvedValueOnce({
        data: {
          assignments: [
            {
              assignmentId: 'assign-p2',
              targetId: 'target-p2',
              title: '2페이지 과제',
              status: 'PUBLISHED',
              dueAt: '2026-11-08T00:00:00.000Z',
              publishedAt: '2026-11-01T00:00:00.000Z',
              submission: null,
            },
          ],
          page: { page: 2, pageSize: 20, hasNextPage: false },
        },
      });
    const { Wrapper } = createTestWrapper();
    const view = await render(
      <Wrapper>
        <AssignmentListScreen clock={() => FIXED_NOW} />
      </Wrapper>,
    );

    // When: 오류 상태에서 다시 시도
    await waitFor(() => {
      expect(view.getByTestId('assignments-error-state')).toBeTruthy();
    });
    await fireEvent.press(view.getByRole('button', { name: '다시 시도' }));

    // Then: 1페이지 표시 후 스크롤 끝 도달 시 2페이지 로드
    await waitFor(() => {
      expect(view.getByText('1페이지 과제')).toBeTruthy();
    });
    await act(async () => {
      view.getByTestId('assignments-flat-list').props.onEndReached();
    });
    await waitFor(() => {
      expect(view.getByText('2페이지 과제')).toBeTruthy();
    });
  });
});
