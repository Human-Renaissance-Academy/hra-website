/**
 * 역할: 과제 제출 화면의 하위 프레젠테이션 카드 컴포넌트(확인 카드, 진행/오류 배너, 제출 완료 카드)
 * 사용 위치: src/features/assignments/assignment-submit-screen.tsx
 * 주요 기능:
 * - 선택한 PDF 파일 정보(파일명, 크기)와 제출 대상 과제 제목을 확인하는 카드 렌더링
 * - 제출 단계별 진행률(0~100%), 취소 버튼, 429 카운트다운/오류 배너 렌더링
 * - 제출 완료("제출이 완료되었습니다.", replayed 안내 포함) 결과 카드 렌더링
 */
import { StyleSheet, View } from 'react-native';
import { theme } from '../../theme';
import {
  AppText,
  Button,
  Card,
  Chip,
  Divider,
  InlineBanner,
  SectionHeader,
} from '../../ui';
import type { SelectedPdf } from '../submission/types';
import type { SubmitProgressViewState } from './submission-view-model';
import { assignmentsStrings } from './strings';

export interface SubmitSuccessCardProps {
  readonly assignmentTitle: string;
  readonly viewState: SubmitProgressViewState;
  readonly onBackToDetail: () => void;
}

/** 제출 완료 후 결과와 제출 파일 메타데이터를 보여주는 카드입니다. */
export function SubmitSuccessCard({
  assignmentTitle,
  viewState,
  onBackToDetail,
}: SubmitSuccessCardProps) {
  return (
    <Card testID="submit-success-card" variant="elevated" padding="lg" style={styles.card}>
      <Chip
        label={assignmentsStrings.status.submitted}
        tone="success"
        icon="checkmark-circle"
      />
      <AppText variant="title" accessibilityRole="header">
        {assignmentsStrings.submit.steps.successTitle}
      </AppText>
      {viewState.completionDescription ? (
        <AppText variant="body" tone="secondary" testID="submit-completion-description">
          {viewState.completionDescription}
        </AppText>
      ) : null}
      <Divider spacing="sm" />
      <AppText variant="bodySmall" tone="secondary">
        {assignmentsStrings.submit.assignmentLabel}: {assignmentTitle}
      </AppText>
      {viewState.submittedFileText ? (
        <AppText variant="body" weight="600" testID="submit-success-file-text">
          {viewState.submittedFileText}
        </AppText>
      ) : null}
      {viewState.submittedAtText ? (
        <AppText variant="bodySmall" tone="success" testID="submit-success-time-text">
          {viewState.submittedAtText}
        </AppText>
      ) : null}
      <Button
        testID="submit-back-to-detail-button"
        variant="primary"
        label={assignmentsStrings.submit.backToDetailAction}
        fullWidth
        onPress={onBackToDetail}
        style={styles.topMargin}
      />
    </Card>
  );
}

export interface SubmitFileConfirmationCardProps {
  readonly assignmentTitle: string;
  readonly selectedFile: SelectedPdf | null;
  readonly selectedFileSizeText: string | null;
  readonly hasResumeRecord: boolean;
  readonly disabled: boolean;
  readonly onPickFile: () => void;
}

/** PDF 파일 선택 버튼 및 선택된 파일 확인 카드를 렌더링합니다. */
export function SubmitFileConfirmationCard({
  assignmentTitle,
  selectedFile,
  selectedFileSizeText,
  hasResumeRecord,
  disabled,
  onPickFile,
}: SubmitFileConfirmationCardProps) {
  return (
    <View style={styles.sectionBlock}>
      <SectionHeader title={assignmentsStrings.submit.pickSectionTitle} />
      <Card variant="outlined" padding="md" style={styles.card}>
        {selectedFile && selectedFileSizeText ? (
          <View testID="submit-confirmation-card" style={styles.confirmationBox}>
            <AppText variant="label" tone="brand">
              {assignmentsStrings.submit.confirmationCardTitle}
            </AppText>
            <AppText variant="bodySmall" tone="secondary">
              {assignmentsStrings.submit.assignmentLabel}: {assignmentTitle}
            </AppText>
            <AppText variant="body" weight="600" testID="submit-selected-file-name">
              {assignmentsStrings.submit.selectedFileNameLabel(selectedFile.name)}
            </AppText>
            <AppText variant="bodySmall" tone="secondary" testID="submit-selected-file-size">
              {assignmentsStrings.submit.selectedFileSizeLabel(selectedFileSizeText)}
            </AppText>
          </View>
        ) : hasResumeRecord ? (
          <View testID="submit-resume-ready-box" style={styles.confirmationBox}>
            <AppText variant="label" tone="warning">
              {assignmentsStrings.submit.resumeReadyTitle}
            </AppText>
            <AppText variant="bodySmall" tone="secondary">
              {assignmentsStrings.submit.resumeReadyDescription}
            </AppText>
          </View>
        ) : (
          <AppText variant="bodySmall" tone="secondary" testID="submit-no-file-text">
            {assignmentsStrings.submit.noFileSelected}
          </AppText>
        )}

        <Button
          testID="submit-pick-pdf-button"
          variant="secondary"
          label={
            selectedFile
              ? assignmentsStrings.submit.changeFileButton
              : assignmentsStrings.submit.pickButton
          }
          leadingIcon="document-attach-outline"
          disabled={disabled}
          fullWidth
          onPress={onPickFile}
        />
      </Card>
    </View>
  );
}

export interface SubmitStatusAndActionsProps {
  readonly viewState: SubmitProgressViewState;
  readonly validationError: string | null;
  readonly rateLimitCountdownMessage: string | null;
  readonly isRateLimited: boolean;
  readonly canStartAction: boolean;
  readonly showCancelOrReset: boolean;
  readonly onPrimarySubmit: () => void;
  readonly onCancelSubmit: () => void;
}

/** 진행 상태 배너, 오류 배너, 제출/이어서 제출/취소 버튼을 렌더링합니다. */
export function SubmitStatusAndActions({
  viewState,
  validationError,
  rateLimitCountdownMessage,
  isRateLimited,
  canStartAction,
  showCancelOrReset,
  onPrimarySubmit,
  onCancelSubmit,
}: SubmitStatusAndActionsProps) {
  const displayedError = rateLimitCountdownMessage ?? validationError ?? viewState.errorMessage;
  const errorTone = isRateLimited ? 'warning' : 'danger';

  return (
    <View style={styles.actionsSection}>
      {viewState.statusMessage && viewState.step !== 'success' ? (
        <InlineBanner
          testID="submit-progress-banner"
          tone={viewState.step === 'cancelled' ? 'warning' : 'info'}
          message={viewState.statusMessage}
        />
      ) : null}

      {displayedError ? (
        <InlineBanner
          testID="submit-error-banner"
          tone={errorTone}
          message={displayedError}
        />
      ) : null}

      <Button
        testID="submit-primary-action-button"
        variant="primary"
        label={viewState.primaryActionLabel}
        loading={viewState.isRunning}
        loadingLabel={viewState.statusMessage ?? assignmentsStrings.submit.steps.validating}
        disabled={!canStartAction}
        fullWidth
        onPress={onPrimarySubmit}
      />

      {showCancelOrReset ? (
        <Button
          testID="submit-cancel-button"
          variant="secondary"
          label={
            viewState.isRunning
              ? assignmentsStrings.submit.cancelAction
              : assignmentsStrings.submit.startOverAction
          }
          disabled={viewState.step === 'cancelling'}
          fullWidth
          onPress={onCancelSubmit}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    gap: theme.spacing.xs,
  },
  card: {
    gap: theme.spacing.sm,
  },
  confirmationBox: {
    gap: theme.spacing.xs,
    padding: theme.spacing.s3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionsSection: {
    gap: theme.spacing.sm,
  },
  topMargin: {
    marginTop: theme.spacing.xs,
  },
});
