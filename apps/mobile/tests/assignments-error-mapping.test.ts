/**
 * 역할: 내 과제 및 제출 화면의 순수 오류 매핑·재개 분기·다운로드 진행률 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 409 CONFLICT, 413 TOO_LARGE, 429 RATE_LIMITED, 503 DISABLED / STORAGE_UNAVAILABLE / UNAVAILABLE, 401/403/404 오류 매핑 검증
 * - canResume 여부에 따른 "이어서 제출" / "다시 시도" 레이블 결정 검증
 * - 다운로드 진행률 퍼센트 및 파일 열기 오류 한국어 변환 검증
 */
import { ApiError } from '../src/api/errors';
import { resolveAssignmentQueryError } from '../src/features/assignments/assignment-view-model';
import { assignmentsStrings } from '../src/features/assignments/strings';
import {
  createInitialSubmitViewState,
  formatDownloadProgressState,
  formatSubmissionErrorMessage,
  formatSubmissionFileOpenError,
  reduceSubmitResult,
} from '../src/features/assignments/submission-view-model';

describe('formatSubmissionErrorMessage & reduceSubmitResult', () => {
  test.each([
    [new ApiError({ status: 409, code: 'CONFLICT' }), null, assignmentsStrings.errors.conflictSubmission],
    [new ApiError({ status: 413, code: 'TOO_LARGE' }), null, assignmentsStrings.errors.tooLarge],
    [new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 15 }), 16000, '요청이 많습니다. 15초 후 다시 시도해 주세요.'],
    [new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 90 }), 91000, '요청이 많습니다. 2분 후 다시 시도해 주세요.'],
    [new ApiError({ status: 503, code: 'DISABLED' }), null, assignmentsStrings.errors.academicDisabled],
    [new ApiError({ status: 503, code: 'STORAGE_UNAVAILABLE' }), null, assignmentsStrings.errors.storageUnavailable],
    [new ApiError({ status: 503, code: 'UNAVAILABLE' }), null, assignmentsStrings.errors.serviceUnavailable],
    [new ApiError({ status: 401, code: 'UNAUTHENTICATED' }), null, assignmentsStrings.errors.unauthenticated],
    [new ApiError({ status: 403, code: 'FORBIDDEN' }), null, assignmentsStrings.errors.forbiddenRole],
    [new ApiError({ status: 404, code: 'NOT_FOUND' }), null, assignmentsStrings.errors.notFoundAssignment],
    [new ApiError({ status: 0, code: 'NETWORK' }), null, assignmentsStrings.errors.network],
    [new ApiError({ status: 0, code: 'TIMEOUT' }), null, assignmentsStrings.errors.timeout],
  ])('제출 오류 %o를 한국어 메시지 %s로 매핑한다', (error, retryAt, expectedText) => {
    // Given / When
    const message = formatSubmissionErrorMessage(error, retryAt, 1000);
    // Then
    expect(message).toBe(expectedText);
  });

  test('canResume 여부에 따라 기본 액션 레이블을 이어서 제출 또는 다시 시도로 설정한다', () => {
    // Given
    const initial = createInitialSubmitViewState(false);
    const conflictError = new ApiError({ status: 409, code: 'CONFLICT' });
    // When
    const resumable = reduceSubmitResult(
      initial,
      { kind: 'error', error: conflictError, retryAt: null, canResume: true },
      1000,
    );
    const freshOnly = reduceSubmitResult(
      initial,
      { kind: 'error', error: conflictError, retryAt: null, canResume: false },
      1000,
    );
    // Then
    expect(resumable.primaryActionMode).toBe('resume');
    expect(resumable.primaryActionLabel).toBe('이어서 제출');
    expect(freshOnly.primaryActionMode).toBe('new');
    expect(freshOnly.primaryActionLabel).toBe('다시 시도');
  });

  test('조회 오류와 다운로드 진행률/파일 열기 오류를 한국어 상태로 변환한다', () => {
    // Given / When / Then
    expect(resolveAssignmentQueryError(new ApiError({ status: 403, code: 'FORBIDDEN' }))).toEqual({
      kind: 'forbidden',
      message: '이 계정에서는 과제 기능을 사용할 수 없습니다.',
    });
    expect(resolveAssignmentQueryError(new ApiError({ status: 503, code: 'DISABLED' }))).toEqual({
      kind: 'disabled',
      message: '학사 기능이 아직 열리지 않았습니다.',
    });
    expect(formatDownloadProgressState({ receivedBytes: 50, totalBytes: 200 })).toEqual({
      phase: 'downloading',
      percentage: 25,
      statusMessage: '제출 파일을 내려받는 중입니다 (25%)',
    });
    expect(formatDownloadProgressState({ receivedBytes: 50, totalBytes: null })).toEqual({
      phase: 'downloading',
      percentage: null,
      statusMessage: '제출 파일을 내려받는 중입니다...',
    });
    expect(formatSubmissionFileOpenError(new ApiError({ status: 404, code: 'NOT_FOUND' }))).toBe(
      assignmentsStrings.errors.notFoundSubmissionFile,
    );
  });
});
