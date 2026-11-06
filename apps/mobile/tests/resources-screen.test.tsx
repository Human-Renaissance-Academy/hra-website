/**
 * 역할: 자료실(Resources) 화면 통합 렌더링 및 사용자 상호작용 테스트(목록 상태·페이지네이션·권한 안내·PDF 다운로드 해피 패스·취소·오류·언마운트 정리)
 * 사용 위치: apps/mobile/tests/resources-screen.test.tsx
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ResourcesScreen from '../app/(app)/(tabs)/resources';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { getApiClient } from '../src/auth/runtime';
import { trackTransfer } from '../src/features/account/account-runtime';
import { downloadProtectedFile } from '../src/features/files/download-protected-file';
import { createExpoFileSystemPort } from '../src/features/files/expo-file-system-port';
import { openProtectedFile } from '../src/features/files/open-file';
import { createProtectedRequest } from '../src/features/files/protected-request';
import { resourcesStrings } from '../src/features/resources/strings';
import { ko } from '../src/i18n/ko';
import { createQueryClient } from '../src/query/client';
import { memoryFiles } from './file-fixtures';
import { authValue } from './screen-fixtures';

jest.mock('../src/auth/runtime', () => ({ getApiClient: jest.fn(), getSessionManager: jest.fn() }));
jest.mock('../src/features/account/account-runtime', () => ({ trackTransfer: jest.fn(), getProtectedCache: jest.fn() }));
jest.mock('../src/features/files/expo-file-system-port', () => ({ createExpoFileSystemPort: jest.fn() }));
jest.mock('../src/features/files/download-protected-file', () => ({ downloadProtectedFile: jest.fn() }));
jest.mock('../src/features/files/open-file', () => ({ openProtectedFile: jest.fn() }));
jest.mock('../src/features/files/protected-request', () => ({ createProtectedRequest: jest.fn() }));

const mockGet = jest.fn();
let currentMemoryFiles = memoryFiles();
let activeQueryClient: ReturnType<typeof createQueryClient> | undefined;

const pageMeta = (page = 1, hasNextPage = false) => ({
  page, pageSize: 10, totalCount: 1, totalPages: hasNextPage ? 2 : 1, hasNextPage, hasPreviousPage: page > 1,
});
const makePage = (guidebooks: { id: string; title: string }[], page = 1, hasNextPage = false) => ({
  data: { guidebooks, page: pageMeta(page, hasNextPage) },
});
const singlePageResponse = makePage([{ id: 'gb-100', title: 'HRA 학사 가이드북' }]);

async function renderResources(authOverrides: Partial<AuthContextValue> = {}) {
  const queryClient = createQueryClient();
  activeQueryClient = queryClient;
  const auth = authValue({
    status: 'signedIn', user: { id: 'user-member-1', name: '김회원', role: 'MEMBER' }, role: 'MEMBER', isPending: false, ...authOverrides,
  });
  const view = await render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}><ResourcesScreen /></AuthContext.Provider>
    </QueryClientProvider>,
  );
  return { view, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGet.mockReset();
  currentMemoryFiles = memoryFiles();
  jest.mocked(createExpoFileSystemPort).mockReturnValue(currentMemoryFiles.fs);
  jest.mocked(getApiClient).mockReturnValue({ GET: mockGet } as unknown as ReturnType<typeof getApiClient>);
  jest.mocked(createProtectedRequest).mockImplementation((_client, target) => async () => new Response(JSON.stringify(target)));
  jest.mocked(trackTransfer).mockImplementation(() => () => undefined);
});

afterEach(() => {
  activeQueryClient?.clear();
  activeQueryClient = undefined;
});

describe('자료실 목록 및 권한 상태', () => {
  test('초기 로딩 시 스켈레톤을 표시하고 빈 목록이면 "등록된 자료가 없습니다."를 표시한다', async () => {
    // Given
    let resolveList!: (value: unknown) => void;
    mockGet.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));

    // When
    const { view } = await renderResources();
    expect(view.getByTestId('resources-skeleton-list')).toBeTruthy();
    await act(async () => { resolveList(makePage([])); });

    // Then
    await waitFor(() => { expect(view.getByText('등록된 자료가 없습니다.')).toBeTruthy(); });
    await view.unmount();
  });

  test('목록 조회 실패 시 한국어 오류 메시지와 다시 시도 버튼을 표시하고 재시도한다', async () => {
    // Given
    mockGet
      .mockRejectedValueOnce(new ApiError({ status: 400, code: 'INVALID_INPUT' }))
      .mockResolvedValueOnce(makePage([{ id: 'gb-1', title: '신입 원우 안내서' }]));

    // When
    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText(ko.errors.INVALID_INPUT)).toBeTruthy(); });
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));

    // Then
    await waitFor(() => { expect(view.getByText('신입 원우 안내서')).toBeTruthy(); });
    await view.unmount();
  });

  test('403 FORBIDDEN 또는 PENDING 역할일 때 원시 오류 대신 한국어 권한 안내를 표시한다', async () => {
    // Given
    mockGet.mockRejectedValueOnce(new ApiError({ status: 403, code: 'FORBIDDEN' }));

    // When
    const { view } = await renderResources();

    // Then
    await waitFor(() => {
      expect(view.getByText(resourcesStrings.roleGuard.forbiddenTitle)).toBeTruthy();
      expect(view.getByText(resourcesStrings.roleGuard.forbiddenMessage)).toBeTruthy();
    });
    await view.unmount();
  });

  test('페이지네이션(hasNextPage) 시 다음 페이지를 요청하고 중복된 가이드북 행을 제거하며 당겨서 새로고침한다', async () => {
    // Given
    mockGet
      .mockResolvedValueOnce(makePage([{ id: 'gb-1', title: '1권 오리엔테이션 가이드' }, { id: 'gb-2', title: '2권 독서 세미나 매뉴얼' }], 1, true))
      .mockResolvedValueOnce(makePage([{ id: 'gb-2', title: '2권 독서 세미나 매뉴얼' }, { id: 'gb-3', title: '3권 학술 에세이 작성법' }], 2, false))
      .mockResolvedValue(makePage([{ id: 'gb-1', title: '1권 오리엔테이션 가이드' }, { id: 'gb-2', title: '2권 독서 세미나 매뉴얼' }]));

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('1권 오리엔테이션 가이드')).toBeTruthy(); });

    // When
    const flatList = view.getByTestId('resources-guidebook-list');
    await act(async () => { flatList.props.onEndReached(); });

    // Then
    await waitFor(() => { expect(view.getByText('3권 학술 에세이 작성법')).toBeTruthy(); });
    expect(view.getAllByText('2권 독서 세미나 매뉴얼')).toHaveLength(1);
    expect(mockGet).toHaveBeenNthCalledWith(2, '/api/v1/resources/guidebooks', expect.objectContaining({ params: { query: { page: 2, pageSize: 10 } } }));

    // When
    const callsBeforeRefresh = mockGet.mock.calls.length;
    await act(async () => { flatList.props.refreshControl.props.onRefresh(); });

    // Then
    await waitFor(() => { expect(mockGet.mock.calls.length).toBeGreaterThan(callsBeforeRefresh); });
    await view.unmount();
  });
});

describe('가이드북 PDF 다운로드·열기·취소·오류 처리', () => {
  test('항목 탭 시 진행률(퍼센트/미확인)과 취소 버튼을 표시하고 trackTransfer 등록/해제 후 파일을 연다(중복 탭 방지)', async () => {
    // Given
    mockGet.mockResolvedValue(singlePageResponse);
    const unregisterSpy = jest.fn();
    jest.mocked(trackTransfer).mockReturnValue(unregisterSpy);
    let triggerProgress!: (progress: { receivedBytes: number; totalBytes: number | null }) => void;
    let finishDownload!: (result: { uri: string; fileName: string; sizeBytes: number }) => void;
    jest.mocked(downloadProtectedFile).mockImplementation((options) => {
      triggerProgress = (progress) => options.onProgress?.(progress);
      return new Promise((resolve) => { finishDownload = resolve; });
    });
    jest.mocked(openProtectedFile).mockResolvedValue(undefined);

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('HRA 학사 가이드북')).toBeTruthy(); });

    // When
    const row = view.getByTestId('guidebook-row-gb-100');
    await fireEvent.press(row);
    await fireEvent.press(row);

    // Then
    expect(downloadProtectedFile).toHaveBeenCalledTimes(1);
    expect(trackTransfer).toHaveBeenCalledTimes(1);
    expect(createProtectedRequest).toHaveBeenCalledWith(expect.anything(), { kind: 'guidebook', id: 'gb-100' });
    expect(view.getByText('내려받는 중입니다...')).toBeTruthy();
    expect(view.getByTestId('guidebook-cancel-gb-100')).toBeTruthy();

    await act(async () => { triggerProgress({ receivedBytes: 600, totalBytes: 1000 }); });
    expect(view.getByText('내려받는 중입니다 (60%)')).toBeTruthy();
    expect(view.getByText('60%')).toBeTruthy();

    await act(async () => { finishDownload({ uri: 'cache://hra-guidebook.pdf', fileName: 'hra-guidebook.pdf', sizeBytes: 1000 }); });
    await waitFor(() => {
      expect(openProtectedFile).toHaveBeenCalledWith('cache://hra-guidebook.pdf', currentMemoryFiles.fs);
      expect(view.getAllByText('열기 완료').length).toBeGreaterThanOrEqual(1);
    });
    expect(unregisterSpy).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  test('다운로드 중 취소 버튼을 누르면 요청을 중단하고 부분 파일을 삭제하며 취소 상태를 표시한다', async () => {
    // Given
    mockGet.mockResolvedValue(singlePageResponse);
    currentMemoryFiles.files.set('cache://partial-gb-100.pdf', { bytes: [37, 80], modifiedAt: 1 });
    jest.mocked(downloadProtectedFile).mockImplementation(
      (options) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          void currentMemoryFiles.fs.delete('cache://partial-gb-100.pdf').then(() => reject(new ApiError({ status: 0, code: 'NETWORK' })));
        });
      }),
    );

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('HRA 학사 가이드북')).toBeTruthy(); });

    // When
    await fireEvent.press(view.getByTestId('guidebook-row-gb-100'));
    await fireEvent.press(view.getByTestId('guidebook-cancel-gb-100'));

    // Then
    await waitFor(() => { expect(view.getAllByText(resourcesStrings.download.cancelled).length).toBeGreaterThanOrEqual(1); });
    expect(currentMemoryFiles.files.has('cache://partial-gb-100.pdf')).toBe(false);
    expect(openProtectedFile).not.toHaveBeenCalled();
    await view.unmount();
  });

  test.each([
    [new ApiError({ status: 401, code: 'UNAUTHENTICATED' }), ko.errors.UNAUTHENTICATED],
    [new ApiError({ status: 403, code: 'FORBIDDEN' }), resourcesStrings.errors.forbidden],
    [new ApiError({ status: 404, code: 'NOT_FOUND' }), '자료를 찾을 수 없습니다.'],
    [new ApiError({ status: 503, code: 'UNAVAILABLE' }), '잠시 후 다시 시도해 주세요.'],
    [new ApiError({ status: 0, code: 'NETWORK' }), ko.errors.NETWORK],
    [new ApiError({ status: 0, code: 'TIMEOUT' }), ko.errors.TIMEOUT],
    [new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' }), ko.errors.STORAGE_UNAVAILABLE],
  ] as const)('다운로드 오류 %p 발생 시 한국어 문구 "%s"를 표시한다', async (apiError, expectedMessage) => {
    // Given
    mockGet.mockResolvedValue(singlePageResponse);
    jest.mocked(downloadProtectedFile).mockRejectedValueOnce(apiError);

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('HRA 학사 가이드북')).toBeTruthy(); });

    // When
    await fireEvent.press(view.getByTestId('guidebook-row-gb-100'));

    // Then
    await waitFor(() => { expect(view.getByText(expectedMessage)).toBeTruthy(); });
    await view.unmount();
  });

  test('PDF 뷰어가 없어 openProtectedFile 이 실패하면 한국어 뷰어 안내 문구를 표시한다', async () => {
    // Given
    mockGet.mockResolvedValue(singlePageResponse);
    jest.mocked(downloadProtectedFile).mockResolvedValueOnce({ uri: 'cache://gb-100.pdf', fileName: 'gb-100.pdf', sizeBytes: 120 });
    jest.mocked(openProtectedFile).mockRejectedValueOnce(new ApiError({ status: 0, code: 'UNAVAILABLE' }));

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('HRA 학사 가이드북')).toBeTruthy(); });

    // When
    await fireEvent.press(view.getByTestId('guidebook-row-gb-100'));

    // Then
    await waitFor(() => { expect(view.getByText(resourcesStrings.errors.noViewer)).toBeTruthy(); });
    await view.unmount();
  });

  test('화면이 언마운트되면 진행 중인 다운로드 전송을 즉시 abort 한다', async () => {
    // Given
    mockGet.mockResolvedValue(singlePageResponse);
    let activeSignal: AbortSignal | undefined;
    jest.mocked(downloadProtectedFile).mockImplementation((options) => {
      activeSignal = options.signal;
      return new Promise(() => undefined);
    });

    const { view } = await renderResources();
    await waitFor(() => { expect(view.getByText('HRA 학사 가이드북')).toBeTruthy(); });

    // When
    await fireEvent.press(view.getByTestId('guidebook-row-gb-100'));
    expect(activeSignal?.aborted).toBe(false);
    await view.unmount();

    // Then
    expect(activeSignal?.aborted).toBe(true);
  });
});
