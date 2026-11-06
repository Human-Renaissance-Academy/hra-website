/**
 * 역할: 과제 제출 흐름과 제출 파일 다운로드의 순수 오류 매핑 및 문서 선택 검증 헬퍼
 * 사용 위치: src/features/assignments/submission-view-model.ts, assignment-detail-screen.tsx, assignment-submit-screen.tsx
 * 주요 기능:
 * - React Native에 의존하지 않는 순수 TypeScript 함수로 구성
 * - 문서 선택(DocumentPicker) 결과를 validatePdf에 통과시켜 SelectedPdf 또는 한국어 검증 오류로 변환
 * - 409 CONFLICT, 413 TOO_LARGE, 429 RATE_LIMITED(retryAt 카운트다운), 503 DISABLED / STORAGE_UNAVAILABLE / UNAVAILABLE, 401/403/404 오류를 정중한 한국어 메시지로 변환
 */
import { ApiError, toKoreanMessage } from '../../api/errors';
import { retryAfterRemaining, validatePdf } from '../submission/submit-flow';
import type { SelectedPdf } from '../submission/types';
import { formatFileSize } from '../../lib/format';
import { assignmentsStrings } from './strings';

export interface PickedDocumentAssetLike {
  readonly uri: string;
  readonly name: string;
  readonly size?: number | undefined;
  readonly mimeType?: string | undefined;
}

export type PickedPdfValidationResult =
  | {
      readonly ok: true;
      readonly file: SelectedPdf;
      readonly fileSizeText: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type FileDownloadViewState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'downloading';
      readonly percentage: number | null;
      readonly statusMessage: string;
    }
  | { readonly phase: 'opening'; readonly statusMessage: string }
  | { readonly phase: 'done'; readonly statusMessage: string }
  | { readonly phase: 'cancelled'; readonly statusMessage: string }
  | { readonly phase: 'error'; readonly errorMessage: string };

/**
 * 문서 선택기에서 받은 자산(asset) 배열을 검증해 SelectedPdf 또는 한국어 검증 오류를 반환합니다.
 * 파일이 없거나 여러 개이거나 0바이트·50MiB 초과·PDF가 아닌 경우 모두 동일한 한국어 안내 문구를 반환합니다.
 */
export function parsePickedPdfAssets(
  assets: readonly PickedDocumentAssetLike[] | null | undefined,
): PickedPdfValidationResult {
  if (!assets || assets.length !== 1) {
    return {
      ok: false,
      message: assignmentsStrings.errors.invalidPdf,
    };
  }
  const first = assets[0];
  if (!first) {
    return {
      ok: false,
      message: assignmentsStrings.errors.invalidPdf,
    };
  }
  try {
    const validated = validatePdf({
      uri: first.uri,
      name: first.name,
      sizeBytes: typeof first.size === 'number' ? first.size : -1,
      mimeType: first.mimeType ?? '',
    });
    return {
      ok: true,
      file: validated,
      fileSizeText: formatFileSize(validated.sizeBytes),
    };
  } catch {
    return {
      ok: false,
      message: assignmentsStrings.errors.invalidPdf,
    };
  }
}

/**
 * 제출 흐름에서 발생한 오류와 남은 대기 시각(now 기준)을 한국어 오류 문구로 매핑합니다.
 * 서버 원본 메시지나 토큰·URL은 절대 반환하지 않습니다.
 */
export function formatSubmissionErrorMessage(
  error: unknown,
  retryAt: number | null = null,
  now: number = Date.now(),
): string {
  if (!(error instanceof ApiError)) {
    return assignmentsStrings.errors.serviceUnavailable;
  }

  if (error.status === 429 || error.code === 'RATE_LIMITED') {
    const remainingSeconds =
      retryAt !== null
        ? retryAfterRemaining(retryAt, now)
        : (error.retryAfterSeconds ?? 0);
    if (remainingSeconds > 0) {
      return remainingSeconds < 60
        ? assignmentsStrings.errors.rateLimitedSeconds(remainingSeconds)
        : assignmentsStrings.errors.rateLimitedMinutes(Math.ceil(remainingSeconds / 60));
    }
    return toKoreanMessage(error);
  }

  switch (error.code) {
    case 'INVALID_INPUT':
      return assignmentsStrings.errors.invalidPdf;
    case 'TOO_LARGE':
      return assignmentsStrings.errors.tooLarge;
    case 'CONFLICT':
      return assignmentsStrings.errors.conflictSubmission;
    case 'DISABLED':
      return assignmentsStrings.errors.academicDisabled;
    case 'STORAGE_UNAVAILABLE':
      return assignmentsStrings.errors.storageUnavailable;
    case 'UNAVAILABLE':
      return assignmentsStrings.errors.serviceUnavailable;
    case 'UNAUTHENTICATED':
      return assignmentsStrings.errors.unauthenticated;
    case 'FORBIDDEN':
      return assignmentsStrings.errors.forbiddenRole;
    case 'NOT_FOUND':
      return assignmentsStrings.errors.notFoundAssignment;
    case 'NETWORK':
      return assignmentsStrings.errors.network;
    case 'TIMEOUT':
      return assignmentsStrings.errors.timeout;
    default:
      return toKoreanMessage(error);
  }
}

/** 제출 파일 다운로드 진행률(receivedBytes, totalBytes)을 표시 상태로 변환합니다. */
export function formatDownloadProgressState(progress: {
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
}): FileDownloadViewState {
  if (progress.totalBytes && progress.totalBytes > 0) {
    const percentage = Math.min(
      100,
      Math.max(0, Math.round((progress.receivedBytes / progress.totalBytes) * 100)),
    );
    return {
      phase: 'downloading',
      percentage,
      statusMessage: assignmentsStrings.fileDownload.downloadingPercentage(percentage),
    };
  }
  return {
    phase: 'downloading',
    percentage: null,
    statusMessage: assignmentsStrings.fileDownload.downloadingIndeterminate,
  };
}

/** 제출 파일 열기/다운로드 중 발생한 오류를 한국어 문구로 변환합니다. */
export function formatSubmissionFileOpenError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return assignmentsStrings.errors.notFoundSubmissionFile;
    }
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return assignmentsStrings.errors.forbiddenRole;
    }
    if (error.code === 'DISABLED') {
      return assignmentsStrings.errors.academicDisabled;
    }
  }
  return toKoreanMessage(error);
}
