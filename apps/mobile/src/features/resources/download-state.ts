/**
 * 역할: 자료실(Resources) PDF 다운로드·열기 순수 상태 머신 및 페이지 중복 제거·오류 매핑 헬퍼
 * 사용 위치: src/features/resources 하위 실행기, 화면, 행 컴포넌트 및 단위 테스트
 * 주요 기능:
 * - 상태 전이 보장: idle -> downloading(progress) -> opening -> done | cancelled | error
 * - Content-Length 유무에 따른 진행률(0~100% 또는 null) 계산 및 중복 시작 차단 가드 제공
 * - 무한 스크롤 페이지 병합 시 동일 id 가이드북 중복 제거(deduplicateGuidebooks)
 * - 자료실 전용 한국어 오류 매핑(403 권한 안내, 404 자료 없음, 503 재시도, 뷰어 없음, 네트워크/타임아웃/저장소)
 */
import { ApiError, toKoreanMessage } from '../../api/errors';
import type { components } from '../../api/schema';
import type { TransferProgress } from '../files/file-system-port';
import { resourcesStrings } from './strings';

export type GuidebookSummary = components['schemas']['GuidebookSummary'];
export type GuidebookListResponse = components['schemas']['GuidebookListResponse'];

export type DownloadProgressState = {
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
  readonly percentage: number | null;
};

export type DownloadState =
  | { readonly status: 'idle' }
  | { readonly status: 'downloading'; readonly progress: DownloadProgressState }
  | { readonly status: 'opening'; readonly uri: string; readonly fileName: string }
  | { readonly status: 'done'; readonly uri: string; readonly fileName: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error'; readonly message: string; readonly code?: ApiError['code'] | 'NO_VIEWER' | undefined };

export type DownloadEvent =
  | { readonly type: 'START' }
  | { readonly type: 'PROGRESS'; readonly progress: TransferProgress }
  | { readonly type: 'OPENING'; readonly uri: string; readonly fileName: string }
  | { readonly type: 'DONE' }
  | { readonly type: 'CANCEL' }
  | { readonly type: 'ERROR'; readonly message: string; readonly code?: ApiError['code'] | 'NO_VIEWER' | undefined }
  | { readonly type: 'RESET' };

export const initialDownloadState: DownloadState = { status: 'idle' };

/** 바이트 진행 정보에서 안전하게 0~100 사이 정수 퍼센트(또는 Content-Length 미확인 시 null)를 계산합니다. */
export function computeProgressState(progress: TransferProgress): DownloadProgressState {
  const receivedBytes = Math.max(0, progress.receivedBytes);
  const totalBytes =
    progress.totalBytes !== null && Number.isFinite(progress.totalBytes) && progress.totalBytes > 0
      ? progress.totalBytes
      : null;
  const percentage =
    totalBytes !== null
      ? Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)))
      : null;
  return {
    receivedBytes,
    totalBytes,
    percentage,
  };
}

/** 동일 항목에 대해 현재 다운로드나 열기가 진행 중이어서 중복 탭을 막아야 하는지 판별합니다. */
export function isDownloadBusy(state: DownloadState | undefined): boolean {
  if (!state) return false;
  return state.status === 'downloading' || state.status === 'opening';
}

/**
 * 순수 상태 머신 전이 함수입니다.
 * 허용 전이:
 * - idle | done | cancelled | error -> START -> downloading(0, null, null)
 * - downloading -> PROGRESS -> downloading(progress)
 * - downloading -> OPENING -> opening(uri, fileName)
 * - downloading -> CANCEL -> cancelled
 * - downloading -> ERROR -> error
 * - opening -> DONE -> done(uri, fileName)
 * - opening -> CANCEL -> cancelled
 * - opening -> ERROR -> error
 * - 모든 상태 -> RESET -> idle
 */
export function transitionDownloadState(
  state: DownloadState,
  event: DownloadEvent,
): DownloadState {
  switch (event.type) {
    case 'RESET':
      return initialDownloadState;
    case 'START':
      if (state.status === 'downloading' || state.status === 'opening') {
        return state;
      }
      return {
        status: 'downloading',
        progress: { receivedBytes: 0, totalBytes: null, percentage: null },
      };
    case 'PROGRESS':
      if (state.status !== 'downloading') {
        return state;
      }
      return {
        status: 'downloading',
        progress: computeProgressState(event.progress),
      };
    case 'OPENING':
      if (state.status !== 'downloading') {
        return state;
      }
      return {
        status: 'opening',
        uri: event.uri,
        fileName: event.fileName,
      };
    case 'DONE':
      if (state.status !== 'opening') {
        return state;
      }
      return {
        status: 'done',
        uri: state.uri,
        fileName: state.fileName,
      };
    case 'CANCEL':
      if (state.status !== 'downloading' && state.status !== 'opening') {
        return state;
      }
      return { status: 'cancelled' };
    case 'ERROR':
      if (state.status !== 'downloading' && state.status !== 'opening') {
        return state;
      }
      return {
        status: 'error',
        message: event.message,
        code: event.code,
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** 여러 페이지의 가이드북 배열을 순서대로 병합하면서 중복된 id 항목을 제거합니다. */
export function deduplicateGuidebooks(
  pages: readonly (readonly GuidebookSummary[])[],
): GuidebookSummary[] {
  const seen = new Set<string>();
  const result: GuidebookSummary[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
      }
    }
  }
  return result;
}

/** 오류가 403 FORBIDDEN 권한 오류인지 확인합니다. */
export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'FORBIDDEN' || error.status === 403);
}

/**
 * 다운로드 또는 파일 열기 단계의 오류를 한국어 사용자 안내 문구로 변환합니다.
 * - stage === 'open' 에서 UNAVAILABLE 또는 일반 예외가 발생하면 PDF 뷰어 부재 문구를 반환합니다.
 * - 403 -> 권한 안내, 404 -> "자료를 찾을 수 없습니다.", 503 UNAVAILABLE -> "잠시 후 다시 시도해 주세요."
 * - 그 외(401, NETWORK, TIMEOUT, STORAGE_UNAVAILABLE, RATE_LIMITED 등)는 공통 toKoreanMessage 를 따릅니다.
 */
export function mapResourceErrorToKorean(
  error: unknown,
  stage: 'list' | 'download' | 'open',
): { readonly message: string; readonly code: ApiError['code'] | 'NO_VIEWER' } {
  if (stage === 'open') {
    if (error instanceof ApiError && error.code === 'STORAGE_UNAVAILABLE') {
      return { message: toKoreanMessage(error), code: 'STORAGE_UNAVAILABLE' };
    }
    return {
      message: resourcesStrings.errors.noViewer,
      code: 'NO_VIEWER',
    };
  }

  if (error instanceof ApiError) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return {
        message:
          stage === 'list'
            ? resourcesStrings.roleGuard.forbiddenMessage
            : resourcesStrings.errors.forbidden,
        code: 'FORBIDDEN',
      };
    }
    if (error.code === 'NOT_FOUND' || error.status === 404) {
      return {
        message: resourcesStrings.errors.notFound,
        code: 'NOT_FOUND',
      };
    }
    if (error.code === 'UNAVAILABLE' || error.status === 503) {
      if (error.code === 'STORAGE_UNAVAILABLE') {
        return { message: toKoreanMessage(error), code: 'STORAGE_UNAVAILABLE' };
      }
      return {
        message: resourcesStrings.errors.unavailable,
        code: 'UNAVAILABLE',
      };
    }
    return {
      message: toKoreanMessage(error),
      code: error.code,
    };
  }

  return {
    message: toKoreanMessage(error),
    code: 'UNAVAILABLE',
  };
}
