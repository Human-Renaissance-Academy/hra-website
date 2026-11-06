/**
 * 역할: 과제 제출 흐름(/assignments/{id}/submit) 화면 컴포넌트
 * 사용 위치: app/(app)/assignments/[id]/submit.tsx
 * 주요 기능:
 * - 제출 대상 과제 상세 조회 및 로딩/오류 상태 처리
 * - useAssignmentSubmissionController 훅과 SubmitFileConfirmationCard / SubmitStatusAndActions / SubmitSuccessCard 결합
 */
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ApiError } from '../../api/errors';
import { SessionNotice } from '../../auth/session-notice';
import { useAuth } from '../../auth/use-auth';
import { formatKstDateTime } from '../../lib/date-kst';
import { apiQueryOptions } from '../../query/client';
import { theme } from '../../theme';
import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonList,
} from '../../ui';
import {
  assignmentQueryKeys,
  fetchMyAssignmentDetail,
} from './assignments-api';
import { resolveAssignmentQueryError } from './assignment-view-model';
import {
  SubmitFileConfirmationCard,
  SubmitStatusAndActions,
  SubmitSuccessCard,
} from './assignment-submit-cards';
import type { SubmitRunnerFn } from './submit-runtime';
import { formatSubmissionErrorMessage } from './submission-view-model';
import type { PickedDocumentAssetLike } from './submission-view-model';
import { useAssignmentSubmissionController } from './use-assignment-submission';
import { assignmentsStrings } from './strings';

export interface AssignmentSubmitScreenProps {
  readonly assignmentId: string;
  readonly initialMode?: 'new' | 'resume' | undefined;
  readonly now?: (() => number) | undefined;
  readonly runner?: SubmitRunnerFn | undefined;
  readonly pickPdf?: (() => Promise<readonly PickedDocumentAssetLike[] | null>) | undefined;
  readonly cleanupPickedFile?: ((uri: string | null | undefined) => void) | undefined;
}

/** 과제 PDF 제출 화면입니다. */
export function AssignmentSubmitScreen({
  assignmentId,
  initialMode,
  now = Date.now,
  runner,
  pickPdf,
  cleanupPickedFile,
}: AssignmentSubmitScreenProps) {
  const router = useRouter();
  const { user } = useAuth();

  const detailQuery = useQuery(
    apiQueryOptions(assignmentQueryKeys.detail(user?.id, assignmentId), (signal) =>
      fetchMyAssignmentDetail(assignmentId, signal),
    ),
  );

  const {
    selectedFile,
    selectedFileSizeText,
    validationError,
    viewState,
    remainingSeconds,
    handlePickPdf,
    handlePrimarySubmit,
    handleCancelOrStartOver,
  } = useAssignmentSubmissionController({
    assignmentId,
    userId: user?.id,
    initialMode,
    now,
    runner,
    pickPdf,
    cleanupPickedFile,
  });

  if (detailQuery.isPending) {
    return (
      <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
        <SessionNotice />
        <SkeletonList
          count={2}
          accessibilityLabel={assignmentsStrings.detail.loading}
          testID="assignment-submit-skeleton"
        />
      </Screen>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    const errorState = resolveAssignmentQueryError(detailQuery.error);
    if (errorState.kind === 'forbidden' || errorState.kind === 'disabled' || errorState.kind === 'notFound') {
      return (
        <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
          <SessionNotice />
          <EmptyState
            testID={`assignment-submit-${errorState.kind}`}
            icon={errorState.kind === 'forbidden' ? 'lock-closed-outline' : 'information-circle-outline'}
            title={errorState.message}
          />
        </Screen>
      );
    }
    return (
      <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
        <SessionNotice />
        <ErrorState
          testID="assignment-submit-error"
          message={errorState.message}
          retrying={detailQuery.isRefetching}
          onRetry={() => void detailQuery.refetch()}
        />
      </Screen>
    );
  }

  const assignment = detailQuery.data;
  const dueDateTimeText = assignmentsStrings.submit.dueLabel(
    formatKstDateTime(assignment.dueAt),
  );

  if (viewState.step === 'success') {
    return (
      <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
        <SessionNotice />
        <SubmitSuccessCard
          assignmentTitle={assignment.title}
          viewState={viewState}
          onBackToDetail={() => router.replace(`/assignments/${assignmentId}`)}
        />
      </Screen>
    );
  }

  const isRateLimited = remainingSeconds > 0;
  const rateLimitCountdownMessage = isRateLimited
    ? formatSubmissionErrorMessage(
        new ApiError({
          status: 429,
          code: 'RATE_LIMITED',
          retryAfterSeconds: remainingSeconds,
        }),
        viewState.retryAt,
        now(),
      )
    : null;

  const canStartAction =
    !viewState.isRunning &&
    !isRateLimited &&
    (viewState.canResume || Boolean(selectedFile));

  const showCancelOrReset = viewState.isRunning || viewState.canResume;

  return (
    <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
      <SessionNotice />
      <View style={styles.headerBlock}>
        <AppText variant="title">{assignmentsStrings.submit.title}</AppText>
        <AppText variant="bodySmall" tone="secondary">
          {assignmentsStrings.submit.subtitle}
        </AppText>
      </View>

      <Card variant="subtle" padding="md" style={styles.assignmentInfoCard}>
        <AppText variant="label" tone="secondary">
          {assignmentsStrings.submit.assignmentLabel}
        </AppText>
        <AppText variant="subheading">{assignment.title}</AppText>
        <AppText variant="bodySmall" tone="secondary">
          {dueDateTimeText}
        </AppText>
      </Card>

      <SubmitFileConfirmationCard
        assignmentTitle={assignment.title}
        selectedFile={selectedFile}
        selectedFileSizeText={selectedFileSizeText}
        hasResumeRecord={viewState.canResume}
        disabled={viewState.isRunning}
        onPickFile={() => void handlePickPdf()}
      />

      <SubmitStatusAndActions
        viewState={viewState}
        validationError={validationError}
        rateLimitCountdownMessage={rateLimitCountdownMessage}
        isRateLimited={isRateLimited}
        canStartAction={canStartAction}
        showCancelOrReset={showCancelOrReset}
        onPrimarySubmit={handlePrimarySubmit}
        onCancelSubmit={handleCancelOrStartOver}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: theme.spacing.xs,
  },
  assignmentInfoCard: {
    gap: theme.spacing.xs,
  },
});
