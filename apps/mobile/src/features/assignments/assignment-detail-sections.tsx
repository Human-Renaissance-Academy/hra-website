/**
 * 역할: 과제 상세 화면의 하위 프레젠테이션 섹션(재개 배너, 과제 헤더·지침 카드, 내 제출 현황·다운로드 카드)
 * 사용 위치: src/features/assignments/assignment-detail-screen.tsx
 * 주요 기능:
 * - 재개 레코드가 있을 때 "이어서 제출" / "처음부터 다시" 배너 표시
 * - 과제 안내(instructions)를 Markdown이 아닌 줄바꿈 유지·선택 가능 일반 텍스트(selectable AppText)로 렌더링
 * - 제출 파일 메타데이터(파일명, formatFileSize) 및 "내 제출 파일 열기"(진행률·취소·재시도) 카드 렌더링
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
import type {
  AssignmentDetailViewModel,
  AssignmentSubmittedFileViewModel,
} from './assignment-view-model';
import type { FileDownloadViewState } from './submission-view-model';
import { assignmentsStrings } from './strings';

export interface AssignmentDetailBodyProps {
  readonly vm: AssignmentDetailViewModel;
  readonly resettingResume: boolean;
  readonly downloadState: FileDownloadViewState;
  readonly onResumeContinue: () => void;
  readonly onResumeReset: () => void;
  readonly onOpenSubmittedFile: (file: AssignmentSubmittedFileViewModel) => void;
  readonly onCancelDownload: () => void;
  readonly onPrimarySubmit: () => void;
}

/** 과제 상세 화면의 본문 섹션들을 렌더링합니다. */
export function AssignmentDetailBody({
  vm,
  resettingResume,
  downloadState,
  onResumeContinue,
  onResumeReset,
  onOpenSubmittedFile,
  onCancelDownload,
  onPrimarySubmit,
}: AssignmentDetailBodyProps) {
  const isDownloading = downloadState.phase === 'downloading' || downloadState.phase === 'opening';

  return (
    <>
      {vm.showResumeBanner ? (
        <InlineBanner
          testID="assignment-resume-banner"
          tone="warning"
          title={assignmentsStrings.detail.resumeBannerTitle}
          message={assignmentsStrings.detail.resumeBannerMessage}
          actions={[
            {
              label: assignmentsStrings.detail.resumeContinueAction,
              testID: 'assignment-resume-continue-button',
              disabled: resettingResume,
              onPress: onResumeContinue,
            },
            {
              label: assignmentsStrings.detail.resumeResetAction,
              testID: 'assignment-resume-reset-button',
              disabled: resettingResume,
              onPress: onResumeReset,
            },
          ]}
        />
      ) : null}

      <Card variant="elevated" padding="md" style={styles.sectionCard}>
        <View style={styles.chipRow}>
          <Chip
            label={vm.statusChip.label}
            tone={vm.statusChip.tone}
            icon={vm.statusChip.icon}
          />
          <Chip label={vm.dueCountdownText} tone="neutral" />
        </View>
        <AppText variant="title">{vm.title}</AppText>
        <Divider spacing="sm" />
        <AppText variant="bodySmall" tone="secondary">
          {vm.dueDateTimeText}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {vm.publishedAtText}
        </AppText>
      </Card>

      <View style={styles.sectionBlock}>
        <SectionHeader title={assignmentsStrings.detail.instructionsTitle} />
        <Card variant="outlined" padding="md">
          <AppText testID="assignment-instructions-text" variant="body" selectable>
            {vm.instructionsText}
          </AppText>
        </Card>
      </View>

      <View style={styles.sectionBlock}>
        <SectionHeader title={assignmentsStrings.detail.submissionSectionTitle} />
        <Card variant="outlined" padding="md" style={styles.sectionCard}>
          {vm.submittedFile ? (
            <>
              <AppText variant="bodySmall" tone="success" weight="600">
                {vm.submittedFile.submittedAtText}
              </AppText>
              <AppText variant="body" testID="assignment-submitted-file-meta">
                {vm.submittedFile.fileMetaText}
              </AppText>
              {downloadState.phase === 'downloading' || downloadState.phase === 'opening' ? (
                <InlineBanner
                  testID="assignment-file-download-progress"
                  tone="info"
                  message={downloadState.statusMessage}
                  actionLabel={
                    downloadState.phase === 'downloading'
                      ? assignmentsStrings.fileDownload.cancelAction
                      : undefined
                  }
                  onActionPress={
                    downloadState.phase === 'downloading' ? onCancelDownload : undefined
                  }
                />
              ) : null}
              {downloadState.phase === 'cancelled' ? (
                <InlineBanner
                  testID="assignment-file-download-cancelled"
                  tone="warning"
                  message={downloadState.statusMessage}
                />
              ) : null}
              {downloadState.phase === 'error' ? (
                <InlineBanner
                  testID="assignment-file-download-error"
                  tone="danger"
                  message={downloadState.errorMessage}
                  actionLabel={assignmentsStrings.fileDownload.retryAction}
                  onActionPress={() => {
                    if (vm.submittedFile) {
                      onOpenSubmittedFile(vm.submittedFile);
                    }
                  }}
                />
              ) : null}
              <Button
                testID="assignment-open-file-button"
                variant="secondary"
                label={assignmentsStrings.detail.openSubmittedFile}
                accessibilityLabel={vm.submittedFile.openButtonA11yLabel}
                leadingIcon="document-text-outline"
                loading={isDownloading}
                disabled={isDownloading}
                fullWidth
                onPress={() => {
                  if (vm.submittedFile) {
                    onOpenSubmittedFile(vm.submittedFile);
                  }
                }}
              />
            </>
          ) : (
            <AppText variant="bodySmall" tone="secondary">
              {assignmentsStrings.detail.notSubmittedDescription}
            </AppText>
          )}
        </Card>
      </View>

      {vm.primarySubmitLabel ? (
        <Button
          testID="assignment-primary-submit-button"
          variant="primary"
          label={vm.primarySubmitLabel}
          leadingIcon="cloud-upload-outline"
          fullWidth
          onPress={onPrimarySubmit}
        />
      ) : (
        <InlineBanner
          testID="assignment-closed-banner"
          tone="info"
          message={assignmentsStrings.detail.closedNotice}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    gap: theme.spacing.xs,
  },
  sectionCard: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
