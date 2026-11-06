/**
 * 역할: 자료실 순수 상태 머신(download-state.ts) 및 실행기(guidebook-download-runner.ts) 단위 테스트
 * 사용 위치: apps/mobile/tests/resources-download-state.test.ts
 * 주요 기능:
 * - 상태 전이(idle -> downloading(progress) -> opening -> done | cancelled | error) 검증
 * - 페이지 간 가이드북 중복 제거(deduplicateGuidebooks) 및 오류 한국어 매핑(401/403/404/503/NETWORK/TIMEOUT/STORAGE_UNAVAILABLE/NO_VIEWER) 검증
 * - 실행기 중복 탭 차단, trackTransfer 등록/해제, 취소 시 파일 삭제, 언마운트 abortAll 검증
 */
import { ApiError } from '../src/api/errors';
import { ko } from '../src/i18n/ko';
import {
  computeProgressState, deduplicateGuidebooks, initialDownloadState,
  isDownloadBusy, isForbiddenError, mapResourceErrorToKorean, transitionDownloadState,
} from '../src/features/resources/download-state';
import type { DownloadState } from '../src/features/resources/download-state';
import { createGuidebookDownloadRunner } from '../src/features/resources/guidebook-download-runner';
import { resourcesStrings } from '../src/features/resources/strings';
import { memoryFiles } from './file-fixtures';

describe('download-state 순수 상태 머신', () => {
  test('idle -> downloading(progress) -> opening -> done 정상 전이를 수행한다', () => {
    // Given
    let state = initialDownloadState;

    // When
    state = transitionDownloadState(state, { type: 'START' });
    expect(state).toEqual({
      status: 'downloading',
      progress: { receivedBytes: 0, totalBytes: null, percentage: null },
    });

    state = transitionDownloadState(state, {
      type: 'PROGRESS',
      progress: { receivedBytes: 250, totalBytes: 1000 },
    });
    expect(state).toEqual({
      status: 'downloading',
      progress: { receivedBytes: 250, totalBytes: 1000, percentage: 25 },
    });

    state = transitionDownloadState(state, {
      type: 'OPENING',
      uri: 'cache://g1.pdf',
      fileName: 'g1.pdf',
    });
    expect(state).toEqual({
      status: 'opening',
      uri: 'cache://g1.pdf',
      fileName: 'g1.pdf',
    });

    state = transitionDownloadState(state, { type: 'DONE' });

    // Then
    expect(state).toEqual({
      status: 'done',
      uri: 'cache://g1.pdf',
      fileName: 'g1.pdf',
    });
  });

  test('Content-Length 가 없을 때는 percentage 를 null 로 유지한다', () => {
    // Given / When
    const progress = computeProgressState({ receivedBytes: 512, totalBytes: null });
    // Then
    expect(progress).toEqual({ receivedBytes: 512, totalBytes: null, percentage: null });
  });

  test('downloading 및 opening 상태에서 취소(CANCEL)와 오류(ERROR) 전이를 처리하고 재시작을 허용한다', () => {
    // Given
    const downloading = transitionDownloadState(initialDownloadState, { type: 'START' });
    // When
    const cancelled = transitionDownloadState(downloading, { type: 'CANCEL' });
    const restarted = transitionDownloadState(cancelled, { type: 'START' });
    const errored = transitionDownloadState(restarted, {
      type: 'ERROR', message: resourcesStrings.errors.notFound, code: 'NOT_FOUND',
    });
    // Then
    expect(cancelled).toEqual({ status: 'cancelled' });
    expect(isDownloadBusy(downloading)).toBe(true);
    expect(isDownloadBusy(cancelled)).toBe(false);
    expect(errored).toEqual({ status: 'error', message: '자료를 찾을 수 없습니다.', code: 'NOT_FOUND' });
  });

  test('이미 진행 중인 상태에서 중복 START 이벤트는 무시한다', () => {
    // Given
    const downloading = transitionDownloadState(
      transitionDownloadState(initialDownloadState, { type: 'START' }),
      { type: 'PROGRESS', progress: { receivedBytes: 50, totalBytes: 100 } },
    );

    // When
    const ignored = transitionDownloadState(downloading, { type: 'START' });

    // Then
    expect(ignored).toBe(downloading);
  });

  test('페이지 병합 시 동일 ID 가이드북을 중복 제거하고 순서를 유지한다', () => {
    // Given
    const pages = [
      [
        { id: 'g-1', title: '1주차 가이드북' },
        { id: 'g-2', title: '2주차 가이드북' },
      ],
      [
        { id: 'g-2', title: '2주차 가이드북(중복)' },
        { id: 'g-3', title: '3주차 가이드북' },
      ],
    ];

    // When
    const merged = deduplicateGuidebooks(pages);

    // Then
    expect(merged).toEqual([
      { id: 'g-1', title: '1주차 가이드북' },
      { id: 'g-2', title: '2주차 가이드북' },
      { id: 'g-3', title: '3주차 가이드북' },
    ]);
  });

  test('401/403/404/503/NETWORK/TIMEOUT/STORAGE_UNAVAILABLE/NO_VIEWER 오류를 한국어로 매핑한다', () => {
    // Given / When / Then
    expect(
      mapResourceErrorToKorean(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }), 'download'),
    ).toEqual({ message: ko.errors.UNAUTHENTICATED, code: 'UNAUTHENTICATED' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 403, code: 'FORBIDDEN' }), 'list'),
    ).toEqual({ message: resourcesStrings.roleGuard.forbiddenMessage, code: 'FORBIDDEN' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 403, code: 'FORBIDDEN' }), 'download'),
    ).toEqual({ message: resourcesStrings.errors.forbidden, code: 'FORBIDDEN' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 404, code: 'NOT_FOUND' }), 'download'),
    ).toEqual({ message: '자료를 찾을 수 없습니다.', code: 'NOT_FOUND' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 503, code: 'UNAVAILABLE' }), 'download'),
    ).toEqual({ message: '잠시 후 다시 시도해 주세요.', code: 'UNAVAILABLE' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 0, code: 'NETWORK' }), 'download'),
    ).toEqual({ message: ko.errors.NETWORK, code: 'NETWORK' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 0, code: 'TIMEOUT' }), 'download'),
    ).toEqual({ message: ko.errors.TIMEOUT, code: 'TIMEOUT' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' }), 'download'),
    ).toEqual({ message: ko.errors.STORAGE_UNAVAILABLE, code: 'STORAGE_UNAVAILABLE' });

    expect(
      mapResourceErrorToKorean(new ApiError({ status: 0, code: 'UNAVAILABLE' }), 'open'),
    ).toEqual({ message: resourcesStrings.errors.noViewer, code: 'NO_VIEWER' });

    expect(isForbiddenError(new ApiError({ status: 403, code: 'FORBIDDEN' }))).toBe(true);
    expect(isForbiddenError(new ApiError({ status: 404, code: 'NOT_FOUND' }))).toBe(false);
  });
});

describe('createGuidebookDownloadRunner 실행기', () => {
  test('중복 탭을 방지하고 trackTransfer 등록·해제 및 열기 완료까지 상태를 전이한다', async () => {
    // Given
    const { fs } = memoryFiles();
    const states: DownloadState[] = [];
    const releaseSpy = jest.fn();
    const trackTransfer = jest.fn(() => releaseSpy);
    let resolveDownload!: (value: { uri: string; fileName: string; sizeBytes: number }) => void;
    const download = jest.fn(
      (options: { onProgress?: (p: { receivedBytes: number; totalBytes: number | null }) => void }) =>
        new Promise<{ uri: string; fileName: string; sizeBytes: number }>((resolve) => {
          options.onProgress?.({ receivedBytes: 40, totalBytes: 80 });
          resolveDownload = resolve;
        }),
    );
    const open = jest.fn(async () => undefined);

    const runner = createGuidebookDownloadRunner({
      fs,
      createRequest: () => async () => new Response(),
      download,
      open,
      trackTransfer,
      onStateChange: (_id, next) => states.push(next),
    });

    // When
    const first = runner.start({ id: 'g-1', title: '가이드북 1' });
    const duplicate = runner.start({ id: 'g-1', title: '가이드북 1' });
    await duplicate;

    expect(download).toHaveBeenCalledTimes(1);
    expect(trackTransfer).toHaveBeenCalledTimes(1);

    resolveDownload({ uri: 'cache://g-1.pdf', fileName: 'g-1.pdf', sizeBytes: 80 });
    await first;

    // Then
    expect(open).toHaveBeenCalledWith('cache://g-1.pdf', fs);
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(states.map((s) => s.status)).toEqual(['downloading', 'downloading', 'opening', 'done']);
  });

  test('다운로드 완료 직후 취소 신호가 켜지면 내려받은 파일을 삭제하고 cancelled 상태로 전환한다', async () => {
    // Given
    const { fs, files } = memoryFiles();
    files.set('cache://partial.pdf', { bytes: [1, 2, 3], modifiedAt: 10 });
    const states: DownloadState[] = [];

    const runner = createGuidebookDownloadRunner({
      fs,
      createRequest: () => async () => new Response(),
      download: async () => {
        runner.cancel('g-cancel');
        return { uri: 'cache://partial.pdf', fileName: 'partial.pdf', sizeBytes: 3 };
      },
      open: jest.fn(async () => undefined),
      trackTransfer: () => () => undefined,
      onStateChange: (_id, next) => states.push(next),
    });

    // When
    await runner.start({ id: 'g-cancel', title: '취소 테스트' });

    // Then
    expect(files.has('cache://partial.pdf')).toBe(false);
    expect(states.at(-1)).toEqual({ status: 'cancelled' });
  });

  test('abortAll 호출 시 활성 전송의 AbortController 를 즉시 중단한다', async () => {
    // Given
    const { fs } = memoryFiles();
    let capturedSignal: AbortSignal | undefined;

    const runner = createGuidebookDownloadRunner({
      fs,
      createRequest: () => async () => new Response(),
      download: async (options) => {
        capturedSignal = options.signal;
        return new Promise(() => undefined);
      },
      open: jest.fn(async () => undefined),
      trackTransfer: () => () => undefined,
      onStateChange: () => undefined,
    });

    // When
    void runner.start({ id: 'g-unmount', title: '언마운트 테스트' });
    expect(capturedSignal?.aborted).toBe(false);
    runner.abortAll();

    // Then
    expect(capturedSignal?.aborted).toBe(true);
  });
});
