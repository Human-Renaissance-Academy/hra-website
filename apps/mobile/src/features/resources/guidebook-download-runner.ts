/**
 * 역할: 가이드북 PDF 다운로드·열기·취소·파일 정리를 조율하는 순수 실행기(runner)
 * 사용 위치: src/features/resources/resources-screen.tsx 및 순수 단위 테스트
 * 주요 기능:
 * - 항목별 DownloadState(idle -> downloading -> opening -> done | cancelled | error) 상태 관리
 * - 동일 가이드북 중복 탭/중복 다운로드 방지(in-flight 가드)
 * - trackTransfer 에 AbortController 를 등록하고 완료/취소/언마운트 시 즉시 해제
 * - 사용자 취소 또는 다운로드/열기 실패 시 로컬에 생성된 특정 파일을 안전하게 삭제
 * - 화면 언마운트 시 진행 중인 모든 전송을 중단(abortAll)하고 상태 알림을 중지
 */
import type { DownloadOptions } from '../files/download-protected-file';
import type { FileSystemPort } from '../files/file-system-port';
import type { ProtectedFileTarget } from '../files/protected-request';
import type {
  DownloadEvent,
  DownloadState,
  GuidebookSummary,
} from './download-state';
import {
  initialDownloadState,
  isDownloadBusy,
  mapResourceErrorToKorean,
  transitionDownloadState,
} from './download-state';

export interface GuidebookDownloadDeps {
  readonly fs: FileSystemPort;
  readonly createRequest: (
    target: ProtectedFileTarget,
  ) => DownloadOptions['request'];
  readonly download: (
    options: DownloadOptions,
  ) => Promise<{ readonly uri: string; readonly fileName: string; readonly sizeBytes: number }>;
  readonly open: (uri: string, fs: FileSystemPort) => Promise<void>;
  readonly trackTransfer: (controller: AbortController) => () => void;
  readonly onStateChange: (id: string, state: DownloadState) => void;
  readonly ready?: () => Promise<void>;
}

export interface GuidebookDownloadRunner {
  readonly getState: (id: string) => DownloadState;
  readonly start: (guidebook: GuidebookSummary) => Promise<void>;
  readonly cancel: (id: string) => void;
  readonly abortAll: () => void;
}

/**
 * 가이드북 다운로드와 뷰어 열기를 제어하는 순수 실행기를 생성합니다.
 * React Native 에 직접 의존하지 않아 단위 테스트와 화면 양쪽에서 동일하게 동작합니다.
 */
export function createGuidebookDownloadRunner(
  deps: GuidebookDownloadDeps,
): GuidebookDownloadRunner {
  const states = new Map<string, DownloadState>();
  const activeControllers = new Map<string, AbortController>();
  let disposed = false;

  const getState = (id: string): DownloadState => {
    return states.get(id) ?? initialDownloadState;
  };

  const dispatch = (id: string, event: DownloadEvent): DownloadState => {
    const current = getState(id);
    const next = transitionDownloadState(current, event);
    states.set(id, next);
    if (!disposed) {
      deps.onStateChange(id, next);
    }
    return next;
  };

  const safeDelete = async (uri: string | undefined): Promise<void> => {
    if (!uri) return;
    try {
      await deps.fs.delete(uri);
    } catch {
      // 삭제 실패 시에도 사용자 취소/오류 상태 전이는 막지 않습니다.
    }
  };

  const start = async (guidebook: GuidebookSummary): Promise<void> => {
    const { id, title } = guidebook;
    if (disposed || activeControllers.has(id) || isDownloadBusy(getState(id))) {
      return;
    }

    const controller = new AbortController();
    activeControllers.set(id, controller);
    const releaseTransfer = deps.trackTransfer(controller);
    dispatch(id, { type: 'START' });

    let downloadedUri: string | undefined;
    let stage: 'download' | 'open' = 'download';

    try {
      const downloaded = await deps.download({
        fs: deps.fs,
        ...(deps.ready ? { ready: deps.ready } : {}),
        fileNameHint: title,
        signal: controller.signal,
        request: deps.createRequest({ kind: 'guidebook', id }),
        onProgress: (progress) => {
          if (!controller.signal.aborted) {
            dispatch(id, { type: 'PROGRESS', progress });
          }
        },
      });
      downloadedUri = downloaded.uri;

      if (controller.signal.aborted) {
        await safeDelete(downloadedUri);
        dispatch(id, { type: 'CANCEL' });
        return;
      }

      stage = 'open';
      dispatch(id, {
        type: 'OPENING',
        uri: downloaded.uri,
        fileName: downloaded.fileName,
      });

      await deps.open(downloaded.uri, deps.fs);

      if (controller.signal.aborted) {
        await safeDelete(downloadedUri);
        dispatch(id, { type: 'CANCEL' });
        return;
      }

      dispatch(id, { type: 'DONE' });
    } catch (error) {
      if (controller.signal.aborted) {
        await safeDelete(downloadedUri);
        dispatch(id, { type: 'CANCEL' });
        return;
      }
      if (stage === 'download') {
        await safeDelete(downloadedUri);
      }
      const mapped = mapResourceErrorToKorean(error, stage);
      dispatch(id, {
        type: 'ERROR',
        message: mapped.message,
        code: mapped.code,
      });
    } finally {
      activeControllers.delete(id);
      releaseTransfer();
    }
  };

  const cancel = (id: string): void => {
    const controller = activeControllers.get(id);
    if (!controller) return;
    controller.abort();
  };

  const abortAll = (): void => {
    disposed = true;
    for (const controller of activeControllers.values()) {
      controller.abort();
    }
    activeControllers.clear();
  };

  return {
    getState,
    start,
    cancel,
    abortAll,
  };
}
