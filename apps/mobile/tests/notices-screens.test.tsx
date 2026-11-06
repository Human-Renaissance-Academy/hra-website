/**
 * 역할: 공지 목록 화면(NoticesScreen) 통합 렌더링·상호작용 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 목록 로딩 스켈레톤, 고정 배지/제목/발췌문/KST 날짜/조회수 표시, 카드 탭 시 /notices/{id} 이동 검증
 * - 검색 입력 400ms 디바운스, 키보드 검색 즉시 실행, 지우기 버튼, 빈 목록 문구 분기 검증
 * - 무한 스크롤(hasNextPage) 추가 페이지 병합·중복 제거 및 오류+다시 시도 복구 검증
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import NoticesScreen from '../app/(app)/(tabs)/notices';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import * as runtimeModule from '../src/auth/runtime';
import type { NoticeListResponse } from '../src/features/notices';
import { ko } from '../src/i18n/ko';
import { createQueryClient } from '../src/query/client';
import { authValue } from './screen-fixtures';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

const signedInAuth = authValue({
  status: 'signedIn',
  user: { id: 'member-1', name: '김회원', role: 'MEMBER' },
  role: 'MEMBER',
});

const activeClients: ReturnType<typeof createQueryClient>[] = [];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  activeClients.push(queryClient);
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={signedInAuth}>{ui}</AuthContext.Provider>
    </QueryClientProvider>,
  );
}

function makeNotice(id: string, title: string, pinned = false) {
  return {
    id,
    title,
    excerpt: `${title} 요약`,
    pinned,
    viewCount: 128,
    createdAt: '2026-10-30T15:30:00.000Z',
    updatedAt: '2026-10-30T15:30:00.000Z',
  };
}

function makeListPage(
  notices: ReturnType<typeof makeNotice>[],
  page = 1,
  hasNextPage = false,
): NoticeListResponse {
  return {
    notices,
    page: {
      page,
      pageSize: 10,
      totalCount: notices.length,
      totalPages: hasNextPage ? page + 1 : page,
      hasNextPage,
      hasPreviousPage: page > 1,
    },
  };
}

describe('NoticesScreen (공지 목록 화면)', () => {
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    mockPush.mockClear();
    mockGet.mockReset();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(runtimeModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
    } as unknown as ReturnType<typeof runtimeModule.getApiClient>);
  });

  afterEach(async () => {
    await cleanup();
    for (const client of activeClients.splice(0, activeClients.length)) {
      client.clear();
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('고정 배지, 제목, 발췌문, KST 날짜, 조회수를 표시하고 카드 탭 시 /notices/{id}로 이동한다', async () => {
    // Given
    mockGet.mockResolvedValueOnce({
      data: makeListPage([makeNotice('notice-pinned', '필독 학사 운영 안내', true)]),
    });

    // When
    const view = await renderWithProviders(<NoticesScreen />);
    await waitFor(() => {
      expect(view.getByText('필독 학사 운영 안내')).toBeTruthy();
    });

    // Then
    expect(view.getByText('고정')).toBeTruthy();
    expect(view.getByText('필독 학사 운영 안내 요약')).toBeTruthy();
    expect(view.getByText('2026.10.31')).toBeTruthy();
    expect(view.getByText('조회 128')).toBeTruthy();

    await fireEvent.press(view.getByTestId('notice-card-notice-pinned'));
    expect(mockPush).toHaveBeenCalledWith('/notices/notice-pinned');
  });

  test('검색 입력은 400ms 디바운스 후 요청하며, 키보드 검색·지우기 버튼과 빈 상태 문구를 전환한다', async () => {
    // Given
    mockGet.mockResolvedValue({ data: makeListPage([]) });

    const view = await renderWithProviders(<NoticesScreen />);
    await waitFor(() => {
      expect(view.getByText('등록된 공지가 없습니다.')).toBeTruthy();
    });

    // When: 검색어 입력 후 300ms 경과(아직 디바운스 전)
    const searchInput = view.getByTestId('notices-search-input');
    await fireEvent.changeText(searchInput, '  장학금  ');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    // When: 400ms 도달 시 정규화된 검색어로 조회
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/api/v1/notices', {
        params: { query: { page: 1, pageSize: 10, q: '장학금' } },
        signal: expect.any(Object),
      });
    });
    await waitFor(() => {
      expect(view.getByText('검색 결과가 없습니다.')).toBeTruthy();
    });

    // When: 검색어 지우기 버튼 탭 시 즉시 초기화
    await fireEvent.press(view.getByTestId('notices-search-clear'));
    await waitFor(() => {
      expect(view.getByText('등록된 공지가 없습니다.')).toBeTruthy();
    });

    // When: 키보드 'search' 액션 호출 시 대기 없이 즉시 요청
    await fireEvent.changeText(searchInput, '  긴급공지  ');
    await fireEvent(searchInput, 'submitEditing');
    await waitFor(() => {
      expect(mockGet).toHaveBeenLastCalledWith('/api/v1/notices', {
        params: { query: { page: 1, pageSize: 10, q: '긴급공지' } },
        signal: expect.any(Object),
      });
    });
  });

  test('무한 스크롤(onEndReached) 시 다음 페이지를 요청하고 중복된 공지 행을 제거한다', async () => {
    // Given
    const page1 = makeListPage([makeNotice('n-1', '첫 페이지 공지')], 1, true);
    const page2 = makeListPage(
      [makeNotice('n-1', '첫 페이지 공지'), makeNotice('n-2', '두 번째 페이지 공지')],
      2,
      false,
    );
    mockGet.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 });

    const view = await renderWithProviders(<NoticesScreen />);
    await waitFor(() => {
      expect(view.getByText('첫 페이지 공지')).toBeTruthy();
    });

    // When
    await fireEvent(view.getByTestId('notices-list'), 'onEndReached');
    await waitFor(() => {
      expect(view.getByText('두 번째 페이지 공지')).toBeTruthy();
    });

    // Then
    expect(view.getAllByText('첫 페이지 공지')).toHaveLength(1);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  test('목록 조회 실패 시 한국어 오류 안내와 다시 시도 버튼을 통해 복구한다', async () => {
    // Given
    mockGet
      .mockRejectedValueOnce(new ApiError({ status: 400, code: 'INVALID_INPUT' }))
      .mockResolvedValueOnce({ data: makeListPage([]) });

    // When
    const listView = await renderWithProviders(<NoticesScreen />);
    await waitFor(() => {
      expect(listView.getByRole('alert')).toHaveTextContent(ko.errors.INVALID_INPUT);
    });
    await fireEvent.press(listView.getByRole('button', { name: ko.ui.retry }));

    // Then
    await waitFor(() => {
      expect(listView.getByText('등록된 공지가 없습니다.')).toBeTruthy();
    });
  });
});
