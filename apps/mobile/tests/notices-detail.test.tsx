/**
 * 역할: 공지 상세 화면(NoticeDetailScreen) 및 스택 레이아웃(NoticesStackLayout) 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 상세 화면 제목, KST 작성일, 조회수, MarkdownView 본문 및 외부 링크 확인 대화상자 흐름 검증
 * - 404("삭제되었거나 없는 공지입니다.") 및 일반 오류 재시도 복구 검증
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Linking } from 'react-native';
import NoticesStackLayout from '../app/(app)/notices/_layout';
import NoticeDetailScreen from '../app/(app)/notices/[id]';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import * as runtimeModule from '../src/auth/runtime';
import type { NoticeDetailResponse } from '../src/features/notices';
import { ko } from '../src/i18n/ko';
import { createQueryClient } from '../src/query/client';
import { authValue } from './screen-fixtures';

let mockRouteParams: { id?: string | string[] } = { id: 'notice-1' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  Stack: Object.assign(
    ({ children }: { readonly children?: unknown }) => children ?? null,
    { Screen: () => null },
  ),
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

describe('NoticeDetailScreen (공지 상세 화면)', () => {
  const mockGet = jest.fn();

  beforeEach(() => {
    mockGet.mockReset();
    mockRouteParams = { id: 'notice-1' };
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
    jest.restoreAllMocks();
  });

  test('제목, KST 작성일, 조회수, Markdown 본문을 렌더링하고 링크 탭 시 확인 대화상자 후 연다', async () => {
    // Given
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const detailResponse: NoticeDetailResponse = {
      notice: {
        id: 'notice-1',
        title: '모집 요강 발표',
        content:
          '## 지원 안내\n\n자세한 내용은 [공식 홈페이지](https://hra-website-theta.vercel.app)를 참고해 주세요.',
        viewCount: 54,
        createdAt: '2026-10-30T15:00:00.000Z',
      },
    };
    mockGet.mockResolvedValueOnce({ data: detailResponse });

    // When
    const detailView = await renderWithProviders(<NoticeDetailScreen />);
    await waitFor(() => {
      expect(detailView.getByRole('header', { name: '모집 요강 발표' })).toBeTruthy();
    });

    // Then
    expect(detailView.getByText('작성일 2026.10.31')).toBeTruthy();
    expect(detailView.getByText('조회 54')).toBeTruthy();
    expect(detailView.getByRole('header', { name: '지원 안내' })).toBeTruthy();

    await fireEvent.press(detailView.getByRole('link', { name: '공식 홈페이지' }));
    expect(alertSpy).toHaveBeenCalledWith(
      '외부 링크를 엽니다',
      'https://hra-website-theta.vercel.app/',
      expect.any(Array),
      expect.any(Object),
    );
    const buttons = alertSpy.mock.calls[0]?.[2];
    buttons?.find((b) => b.text === ko.ui.confirm)?.onPress?.();
    expect(openUrlSpy).toHaveBeenCalledWith('https://hra-website-theta.vercel.app/');
  });

  test('404(NOT_FOUND) 응답 시 "삭제되었거나 없는 공지입니다." 안내를 표시한다', async () => {
    // Given
    mockGet.mockRejectedValueOnce(new ApiError({ status: 404, code: 'NOT_FOUND' }));

    // When
    const view = await renderWithProviders(<NoticeDetailScreen />);

    // Then
    await waitFor(() => {
      expect(view.getByText('삭제되었거나 없는 공지입니다.')).toBeTruthy();
    });
  });

  test('상세 조회 일시적 실패 시 한국어 오류 문구와 다시 시도 버튼으로 복구하며 스택 레이아웃을 마운트한다', async () => {
    // Given
    const detailResponse: NoticeDetailResponse = {
      notice: {
        id: 'notice-1',
        title: '복구된 공지 제목',
        content: '본문입니다.',
        viewCount: 7,
        createdAt: '2026-10-31T00:00:00.000Z',
      },
    };
    mockGet
      .mockRejectedValueOnce(new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 10 }))
      .mockResolvedValueOnce({ data: detailResponse });

    // When
    await render(<NoticesStackLayout />);
    const view = await renderWithProviders(<NoticeDetailScreen />);
    await waitFor(() => {
      expect(view.getByRole('alert')).toHaveTextContent(ko.waitSeconds(10));
    });
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));

    // Then
    await waitFor(() => {
      expect(view.getByRole('header', { name: '복구된 공지 제목' })).toBeTruthy();
    });
  });
});
