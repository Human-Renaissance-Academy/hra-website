/**
 * 역할: 내 과제 목록·상세 화면의 순수 도메인·뷰모델 변환 로직
 * 사용 위치: src/features/assignments 하위 화면 컴포넌트 및 단위 테스트
 * 주요 기능:
 * - React Native에 의존하지 않는 순수 TypeScript 함수로 과제 상태 칩(제출 완료 / 미제출 / 마감됨) 판정
 * - 마감 일시(formatKstDateTime), 마감 여유 텍스트(formatDueText), 제출 파일 크기(formatFileSize) 포맷
 * - 제출 가능 여부(PUBLISHED && !isPastDue) 및 기본 액션 레이블("제출하기" / "다시 제출하기") 계산
 * - 재개 레코드가 현재 과제와 일치하고 과제가 열려 있는지 확인
 * - 403 FORBIDDEN(역할 제한), 503 DISABLED(학사 미개방), 404 NOT_FOUND 등 API 오류를 한국어 상태로 변환
 */
import { ApiError, toKoreanMessage } from '../../api/errors';
import type { components } from '../../api/schema';
import type { ResumeRecord } from '../submission/resume-store';
import { formatKstDateTime, isPastDue } from '../../lib/date-kst';
import type { Instant } from '../../lib/date-kst';
import { formatDueText, formatFileSize } from '../../lib/format';
import { assignmentsStrings } from './strings';

export type AssignmentSummaryDto = Readonly<components['schemas']['AcademicAssignmentSummary']>;
export type AssignmentDetailDto = Readonly<components['schemas']['AcademicAssignmentDetail']>;
export type AssignmentPageDto = Readonly<components['schemas']['AcademicAssignmentPage']>;
export type AssignmentListResponseDto = Readonly<
  components['schemas']['AcademicAssignmentListResponse']
>;

export type AssignmentChipKind = 'submitted' | 'unsubmitted' | 'closed';
export type AssignmentChipTone = 'success' | 'warning' | 'danger';
export type AssignmentChipIcon = 'checkmark-circle' | 'time-outline' | 'lock-closed-outline';

export interface AssignmentStatusChipModel {
  readonly kind: AssignmentChipKind;
  readonly label: string;
  readonly tone: AssignmentChipTone;
  readonly icon: AssignmentChipIcon;
}

export interface AssignmentCardViewModel {
  readonly assignmentId: string;
  readonly targetId: string;
  readonly title: string;
  readonly dueDateTimeText: string;
  readonly dueCountdownText: string;
  readonly statusChip: AssignmentStatusChipModel;
  readonly submittedAtText: string | undefined;
  readonly accessibilityLabel: string;
}

export interface AssignmentSubmittedFileViewModel {
  readonly submissionId: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly fileSizeText: string;
  readonly fileMetaText: string;
  readonly submittedAtText: string;
  readonly openButtonA11yLabel: string;
}

export interface AssignmentDetailViewModel {
  readonly assignmentId: string;
  readonly targetId: string;
  readonly title: string;
  readonly instructionsText: string;
  readonly dueDateTimeText: string;
  readonly dueCountdownText: string;
  readonly publishedAtText: string;
  readonly statusChip: AssignmentStatusChipModel;
  readonly isOpenForSubmission: boolean;
  readonly primarySubmitLabel: string | undefined;
  readonly submittedFile: AssignmentSubmittedFileViewModel | undefined;
  readonly showResumeBanner: boolean;
}

export type AssignmentQueryErrorState =
  | { readonly kind: 'forbidden'; readonly message: string }
  | { readonly kind: 'disabled'; readonly message: string }
  | { readonly kind: 'notFound'; readonly message: string }
  | { readonly kind: 'retryable'; readonly message: string };

/**
 * 과제의 상태·제출 내역·마감 시각을 비교해 상태 칩 모델을 계산합니다.
 * - 제출 내역이 있으면: 제출 완료 (success)
 * - 미제출이면서 status === 'CLOSED' 이거나 dueAt <= now 이면: 마감됨 (danger)
 * - 그 외 공개 미제출: 미제출 (warning)
 */
export function resolveAssignmentStatusChip(
  item: Pick<AssignmentSummaryDto, 'status' | 'dueAt' | 'submission'>,
  now: Instant,
): AssignmentStatusChipModel {
  if (item.submission !== null) {
    return {
      kind: 'submitted',
      label: assignmentsStrings.status.submitted,
      tone: 'success',
      icon: 'checkmark-circle',
    };
  }
  if (item.status === 'CLOSED' || isPastDue(item.dueAt, now)) {
    return {
      kind: 'closed',
      label: assignmentsStrings.status.closed,
      tone: 'danger',
      icon: 'lock-closed-outline',
    };
  }
  return {
    kind: 'unsubmitted',
    label: assignmentsStrings.status.unsubmitted,
    tone: 'warning',
    icon: 'time-outline',
  };
}

/** 과제가 현재 공개(PUBLISHED) 상태이고 마감 시각 이전인지 판정합니다. */
export function isAssignmentOpenForSubmission(
  item: Pick<AssignmentSummaryDto, 'status' | 'dueAt'>,
  now: Instant,
): boolean {
  return item.status === 'PUBLISHED' && !isPastDue(item.dueAt, now);
}

/** 목록 카드 한 건의 표시용 뷰모델을 생성합니다. */
export function toAssignmentCardViewModel(
  item: AssignmentSummaryDto,
  now: Instant,
): AssignmentCardViewModel {
  const statusChip = resolveAssignmentStatusChip(item, now);
  const dueFormatted = formatKstDateTime(item.dueAt);
  const dueDateTimeText = assignmentsStrings.list.dueLabel(dueFormatted);
  const dueCountdownText = formatDueText(item.dueAt, now);
  const submittedAtText = item.submission
    ? assignmentsStrings.list.submittedAtLabel(formatKstDateTime(item.submission.submittedAt))
    : undefined;

  return {
    assignmentId: item.assignmentId,
    targetId: item.targetId,
    title: item.title,
    dueDateTimeText,
    dueCountdownText,
    statusChip,
    submittedAtText,
    accessibilityLabel: assignmentsStrings.list.cardA11yLabel(
      item.title,
      statusChip.label,
      dueFormatted,
    ),
  };
}

/** 여러 페이지의 과제 목록 응답을 중복(targetId 기준) 없이 평탄화합니다. */
export function flattenAssignmentPages(
  pages: readonly AssignmentListResponseDto[] | undefined,
): readonly AssignmentSummaryDto[] {
  if (!pages || pages.length === 0) return [];
  const seen = new Set<string>();
  const merged: AssignmentSummaryDto[] = [];
  for (const page of pages) {
    for (const item of page.assignments) {
      if (!seen.has(item.targetId)) {
        seen.add(item.targetId);
        merged.push(item);
      }
    }
  }
  return merged;
}

/** 과제 상세 응답과 재개 저장소 레코드를 결합해 상세 화면 뷰모델을 생성합니다. */
export function toAssignmentDetailViewModel(
  detail: AssignmentDetailDto,
  now: Instant,
  resumeRecord: ResumeRecord | null = null,
): AssignmentDetailViewModel {
  const statusChip = resolveAssignmentStatusChip(detail, now);
  const isOpen = isAssignmentOpenForSubmission(detail, now);
  const dueDateTimeText = assignmentsStrings.detail.dueDateTimeLabel(
    formatKstDateTime(detail.dueAt),
  );
  const dueCountdownText = formatDueText(detail.dueAt, now);
  const publishedAtText = assignmentsStrings.detail.publishedAtLabel(
    formatKstDateTime(detail.publishedAt),
  );
  const trimmedInstructions = detail.instructions.trim();
  const instructionsText =
    trimmedInstructions.length > 0
      ? detail.instructions
      : assignmentsStrings.detail.emptyInstructions;

  const primarySubmitLabel = isOpen
    ? detail.submission
      ? assignmentsStrings.detail.resubmitPrimary
      : assignmentsStrings.detail.submitPrimary
    : undefined;

  const submittedFile: AssignmentSubmittedFileViewModel | undefined =
    detail.submission && detail.file
      ? {
          submissionId: detail.submission.submissionId,
          fileId: detail.file.fileId,
          fileName: detail.file.originalName,
          fileSizeText: formatFileSize(detail.file.sizeBytes),
          fileMetaText: assignmentsStrings.detail.fileMetaLabel(
            detail.file.originalName,
            formatFileSize(detail.file.sizeBytes),
          ),
          submittedAtText: assignmentsStrings.detail.submittedAtLabel(
            formatKstDateTime(detail.submission.submittedAt),
          ),
          openButtonA11yLabel: assignmentsStrings.detail.openSubmittedFileA11y(
            detail.file.originalName,
          ),
        }
      : undefined;

  const showResumeBanner = Boolean(
    resumeRecord && resumeRecord.assignmentId === detail.assignmentId,
  );

  return {
    assignmentId: detail.assignmentId,
    targetId: detail.targetId,
    title: detail.title,
    instructionsText,
    dueDateTimeText,
    dueCountdownText,
    publishedAtText,
    statusChip,
    isOpenForSubmission: isOpen,
    primarySubmitLabel,
    submittedFile,
    showResumeBanner,
  };
}

/**
 * 과제 목록/상세 조회에서 발생한 API 오류를 화면 상태(403 역할 안내, 503 비활성, 404 없음, 일반 재시도)로 매핑합니다.
 */
export function resolveAssignmentQueryError(error: unknown): AssignmentQueryErrorState {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return {
        kind: 'forbidden',
        message: assignmentsStrings.errors.forbiddenRole,
      };
    }
    if (error.code === 'DISABLED') {
      return {
        kind: 'disabled',
        message: assignmentsStrings.errors.academicDisabled,
      };
    }
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return {
        kind: 'notFound',
        message: assignmentsStrings.errors.notFoundAssignment,
      };
    }
  }
  return {
    kind: 'retryable',
    message: toKoreanMessage(error),
  };
}
