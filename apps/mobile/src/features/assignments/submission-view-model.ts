/**
 * 역할: 과제 제출 흐름의 순수 상태 머신(SubmitEvent / SubmitResult -> SubmitProgressViewState)
 * 사용 위치: src/features/assignments/assignment-submit-screen.tsx, 단위 테스트
 * 주요 기능:
 * - React Native에 의존하지 않는 순수 TypeScript 함수로 구성
 * - SubmitEvent 및 SubmitResult를 화면 진행 상태(Validating~Finalizing, Success, Cancelled, Error)로 매핑
 * - error 결과의 canResume에 따라 "이어서 제출" / "다시 시도" 액션 경로 결정
 */
import type { SubmitEvent, SubmitResult, Submitted } from '../submission/types';
import { formatKstDateTime } from '../../lib/date-kst';
import { formatFileSize } from '../../lib/format';
import { assignmentsStrings } from './strings';
import {
  formatDownloadProgressState,
  formatSubmissionErrorMessage,
  formatSubmissionFileOpenError,
  parsePickedPdfAssets,
} from './submission-errors';
import type {
  FileDownloadViewState,
  PickedDocumentAssetLike,
  PickedPdfValidationResult,
} from './submission-errors';

export {
  formatDownloadProgressState,
  formatSubmissionErrorMessage,
  formatSubmissionFileOpenError,
  parsePickedPdfAssets,
};
export type {
  FileDownloadViewState,
  PickedDocumentAssetLike,
  PickedPdfValidationResult,
};

export type SubmitStepState =
  | 'idle'
  | 'validating'
  | 'creatingIntent'
  | 'authorizing'
  | 'uploading'
  | 'verifying'
  | 'finalizing'
  | 'cancelling'
  | 'success'
  | 'cancelled'
  | 'error';

export interface SubmitProgressViewState {
  readonly step: SubmitStepState;
  readonly isRunning: boolean;
  readonly canCancel: boolean;
  readonly percentage: number | null;
  readonly statusMessage: string | null;
  readonly errorMessage: string | null;
  readonly retryAt: number | null;
  readonly canResume: boolean;
  readonly primaryActionMode: 'new' | 'resume' | 'none';
  readonly primaryActionLabel: string;
  readonly submission: Submitted | null;
  readonly submittedAtText: string | null;
  readonly submittedFileText: string | null;
  readonly completionDescription: string | null;
}

/** 초기 제출 화면 진행 상태를 생성합니다. */
export function createInitialSubmitViewState(hasResumeRecord = false): SubmitProgressViewState {
  return {
    step: 'idle',
    isRunning: false,
    canCancel: false,
    percentage: null,
    statusMessage: null,
    errorMessage: null,
    retryAt: null,
    canResume: hasResumeRecord,
    primaryActionMode: hasResumeRecord ? 'resume' : 'new',
    primaryActionLabel: hasResumeRecord
      ? assignmentsStrings.submit.resumeAction
      : assignmentsStrings.submit.startSubmitAction,
    submission: null,
    submittedAtText: null,
    submittedFileText: null,
    completionDescription: null,
  };
}

const runningStepMessages: Readonly<
  Record<
    'validating' | 'creatingIntent' | 'authorizing' | 'verifying' | 'finalizing',
    { readonly percentage: number | null; readonly message: string }
  >
> = {
  validating: { percentage: null, message: assignmentsStrings.submit.steps.validating },
  creatingIntent: { percentage: null, message: assignmentsStrings.submit.steps.creatingIntent },
  authorizing: { percentage: null, message: assignmentsStrings.submit.steps.authorizing },
  verifying: { percentage: 100, message: assignmentsStrings.submit.steps.verifying },
  finalizing: { percentage: 100, message: assignmentsStrings.submit.steps.finalizing },
};

/**
 * createSubmitRunner의 onEvent 콜백 이벤트를 화면 진행 상태로 변환합니다.
 */
export function reduceSubmitEvent(
  prev: SubmitProgressViewState,
  event: SubmitEvent,
  now: number = Date.now(),
): SubmitProgressViewState {
  switch (event.state) {
    case 'validating':
    case 'creatingIntent':
    case 'authorizing':
    case 'verifying':
    case 'finalizing': {
      const info = runningStepMessages[event.state];
      return {
        ...prev,
        step: event.state,
        isRunning: true,
        canCancel: true,
        percentage: info.percentage,
        statusMessage: info.message,
        errorMessage: null,
      };
    }
    case 'uploading': {
      const clamped = Math.min(100, Math.max(0, Math.round(event.percentage)));
      return {
        ...prev,
        step: 'uploading',
        isRunning: true,
        canCancel: true,
        percentage: clamped,
        statusMessage: assignmentsStrings.submit.steps.uploading(clamped),
        errorMessage: null,
      };
    }
    case 'cancelling':
      return {
        ...prev,
        step: 'cancelling',
        isRunning: true,
        canCancel: false,
        statusMessage: assignmentsStrings.submit.steps.cancelling,
        errorMessage: null,
      };
    case 'cancelled':
      return {
        ...prev,
        step: 'cancelled',
        isRunning: false,
        canCancel: false,
        percentage: null,
        statusMessage: assignmentsStrings.submit.steps.cancelled,
        errorMessage: null,
        retryAt: null,
        canResume: false,
        primaryActionMode: 'new',
        primaryActionLabel: assignmentsStrings.submit.retryAction,
      };
    case 'success':
      return {
        ...prev,
        step: 'success',
        isRunning: false,
        canCancel: false,
        percentage: 100,
        statusMessage: assignmentsStrings.submit.steps.successTitle,
        errorMessage: null,
        retryAt: null,
        canResume: false,
        primaryActionMode: 'none',
        submission: event.submission,
        submittedAtText: assignmentsStrings.detail.submittedAtLabel(
          formatKstDateTime(event.submission.submittedAt),
        ),
        submittedFileText: assignmentsStrings.detail.fileMetaLabel(
          event.submission.file.originalName,
          formatFileSize(event.submission.file.sizeBytes),
        ),
        completionDescription: event.submission.replayed
          ? assignmentsStrings.submit.steps.replayedDescription
          : assignmentsStrings.submit.steps.successDescription,
      };
    case 'error':
      return {
        ...prev,
        step: 'error',
        isRunning: false,
        canCancel: false,
        statusMessage: null,
        errorMessage: formatSubmissionErrorMessage(event.error, event.retryAt, now),
        retryAt: event.retryAt,
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * createSubmitRunner의 최종 반환값(SubmitResult)을 화면 상태에 반영합니다.
 * error 결과의 canResume 값에 따라 "이어서 제출" 또는 "다시 시도" 경로를 결정합니다.
 */
export function reduceSubmitResult(
  prev: SubmitProgressViewState,
  result: SubmitResult,
  now: number = Date.now(),
): SubmitProgressViewState {
  switch (result.kind) {
    case 'success':
      return reduceSubmitEvent(prev, { state: 'success', submission: result.submission }, now);
    case 'cancelled':
      return reduceSubmitEvent(prev, { state: 'cancelled' }, now);
    case 'error':
      return {
        ...prev,
        step: 'error',
        isRunning: false,
        canCancel: false,
        statusMessage: null,
        errorMessage: formatSubmissionErrorMessage(result.error, result.retryAt, now),
        retryAt: result.retryAt,
        canResume: result.canResume,
        primaryActionMode: result.canResume ? 'resume' : 'new',
        primaryActionLabel: result.canResume
          ? assignmentsStrings.submit.resumeAction
          : assignmentsStrings.submit.retryAction,
      };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
