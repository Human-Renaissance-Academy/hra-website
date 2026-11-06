/**
 * 역할: 과제 상세(GET /api/v1/assignments/{id}) 화면 컴포넌트
 * 사용 위치: app/(app)/assignments/[id].tsx
 * 주요 기능:
 * - 본인 과제 상세 데이터 조회(useQuery) 및 당겨서 새로고침(useRefresh) 관리
 * - 재개 레코드(getResumeStore) 조회 및 "처음부터 다시" 선택 시 서버 의도 취소 + 로컬 기록 삭제
 * - "내 제출 파일 열기"에서 공유 다운로드 파이프라인(createProtectedRequest + downloadProtectedFile + openProtectedFile + trackTransfer) 실행
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { getApiClient } from '../../auth/runtime';
import { SessionNotice } from '../../auth/session-notice';
import { useAuth } from '../../auth/use-auth';
import { getProtectedCache, getResumeStore, ready, trackTransfer } from '../account/account-runtime';
import { downloadProtectedFile } from '../files/download-protected-file';
import { createExpoFileSystemPort } from '../files/expo-file-system-port';
import type { FileSystemPort } from '../files/file-system-port';
import { openProtectedFile } from '../files/open-file';
import { createProtectedRequest } from '../files/protected-request';
import type { ResumeRecord } from '../submission/resume-store';
import { createSubmissionApi } from '../submission/submission-api';
import type { Instant } from '../../lib/date-kst';
import { apiQueryOptions } from '../../query/client';
import {
  EmptyState,
  ErrorState,
  Screen,
  SkeletonList,
  useRefresh,
} from '../../ui';
import {
  assignmentQueryKeys,
  fetchMyAssignmentDetail,
} from './assignments-api';
import { AssignmentDetailBody } from './assignment-detail-sections';
import {
  resolveAssignmentQueryError,
  toAssignmentDetailViewModel,
} from './assignment-view-model';
import {
  formatDownloadProgressState,
  formatSubmissionFileOpenError,
} from './submission-view-model';
import type { FileDownloadViewState } from './submission-view-model';
import { assignmentsStrings } from './strings';

export interface AssignmentDetailScreenProps {
  readonly assignmentId: string;
  readonly clock?: (() => Instant) | undefined;
  readonly fileSystemPort?: FileSystemPort | undefined;
}

/** 본인 과제 상세 화면입니다. */
export function AssignmentDetailScreen({
  assignmentId,
  clock = Date.now,
  fileSystemPort,
}: AssignmentDetailScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null);
  const [resettingResume, setResettingResume] = useState(false);
  const [downloadState, setDownloadState] = useState<FileDownloadViewState>({ phase: 'idle' });
  const activeDownloadController = useRef<AbortController | null>(null);

  const loadResumeRecord = useCallback(async () => {
    if (!userId) {
      setResumeRecord(null);
      return;
    }
    try {
      const record = await getResumeStore(userId).read();
      setResumeRecord(record && record.assignmentId === assignmentId ? record : null);
    } catch {
      setResumeRecord(null);
    }
  }, [assignmentId, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    getResumeStore(userId)
      .read()
      .then((record) => {
        if (active) {
          setResumeRecord(record && record.assignmentId === assignmentId ? record : null);
        }
      })
      .catch(() => {
        if (active) setResumeRecord(null);
      });
    return () => {
      active = false;
    };
  }, [assignmentId, userId]);

  useEffect(() => {
    return () => {
      activeDownloadController.current?.abort();
      activeDownloadController.current = null;
    };
  }, []);

  const query = useQuery(
    apiQueryOptions(assignmentQueryKeys.detail(user?.id, assignmentId), (signal) =>
      fetchMyAssignmentDetail(assignmentId, signal),
    ),
  );

  const { refreshing, onRefresh } = useRefresh(async () => {
    await Promise.all([query.refetch(), loadResumeRecord()]);
  });

  const handleResetResume = useCallback(async () => {
    if (!userId || !resumeRecord || resettingResume) return;
    setResettingResume(true);
    try {
      const api = createSubmissionApi(getApiClient());
      try {
        await api.cancel(resumeRecord);
      } catch {
        // 서버 의도 취소가 실패해도 로컬 재개 기록을 지워 새 시도를 허용합니다.
      }
      await getResumeStore(userId).clear();
      setResumeRecord(null);
    } finally {
      setResettingResume(false);
    }
  }, [resettingResume, resumeRecord, userId]);

  const handleOpenSubmittedFile = useCallback(
    async (file: { readonly submissionId: string; readonly fileId: string; readonly fileName: string }) => {
      if (activeDownloadController.current) return;
      const controller = new AbortController();
      activeDownloadController.current = controller;
      const untrack = trackTransfer(controller);
      const fs = fileSystemPort ?? createExpoFileSystemPort();
      setDownloadState({
        phase: 'downloading',
        percentage: null,
        statusMessage: assignmentsStrings.fileDownload.downloadingIndeterminate,
      });

      try {
        await getProtectedCache().sweepProtectedCache().catch(() => undefined);
        const downloaded = await downloadProtectedFile({
          fs,
          ready,
          fileNameHint: file.fileName,
          signal: controller.signal,
          request: createProtectedRequest(getApiClient(), {
            kind: 'submission',
            submissionId: file.submissionId,
            fileId: file.fileId,
          }),
          onProgress: (progress) => {
            if (!controller.signal.aborted) {
              setDownloadState(formatDownloadProgressState(progress));
            }
          },
        });
        if (controller.signal.aborted) {
          setDownloadState({
            phase: 'cancelled',
            statusMessage: assignmentsStrings.fileDownload.cancelled,
          });
          return;
        }
        setDownloadState({
          phase: 'opening',
          statusMessage: assignmentsStrings.fileDownload.opening,
        });
        await openProtectedFile(downloaded.uri, fs);
        setDownloadState({
          phase: 'done',
          statusMessage: assignmentsStrings.fileDownload.done,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          setDownloadState({
            phase: 'cancelled',
            statusMessage: assignmentsStrings.fileDownload.cancelled,
          });
          return;
        }
        setDownloadState({
          phase: 'error',
          errorMessage: formatSubmissionFileOpenError(error),
        });
      } finally {
        untrack();
        if (activeDownloadController.current === controller) {
          activeDownloadController.current = null;
        }
      }
    },
    [fileSystemPort],
  );

  const handleCancelDownload = useCallback(() => {
    activeDownloadController.current?.abort();
  }, []);

  if (query.isPending) {
    return (
      <Screen scroll padding="md" edges={['bottom', 'left', 'right']}>
        <SessionNotice />
        <SkeletonList
          count={3}
          accessibilityLabel={assignmentsStrings.detail.loading}
          testID="assignment-detail-skeleton"
        />
      </Screen>
    );
  }

  if (query.isError || !query.data) {
    const errorState = resolveAssignmentQueryError(query.error);
    if (errorState.kind === 'forbidden' || errorState.kind === 'disabled' || errorState.kind === 'notFound') {
      return (
        <Screen
          scroll
          padding="md"
          edges={['bottom', 'left', 'right']}
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
        >
          <SessionNotice />
          <EmptyState
            testID={`assignment-detail-${errorState.kind}`}
            icon={errorState.kind === 'forbidden' ? 'lock-closed-outline' : 'information-circle-outline'}
            title={errorState.message}
          />
        </Screen>
      );
    }
    return (
      <Screen
        scroll
        padding="md"
        edges={['bottom', 'left', 'right']}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
      >
        <SessionNotice />
        <ErrorState
          testID="assignment-detail-error"
          message={errorState.message}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const vm = toAssignmentDetailViewModel(query.data, clock(), resumeRecord);

  return (
    <Screen
      scroll
      padding="md"
      edges={['bottom', 'left', 'right']}
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
    >
      <SessionNotice />
      <AssignmentDetailBody
        vm={vm}
        resettingResume={resettingResume}
        downloadState={downloadState}
        onResumeContinue={() => router.push(`/assignments/${vm.assignmentId}/submit?mode=resume`)}
        onResumeReset={() => {
          void handleResetResume();
        }}
        onOpenSubmittedFile={(file) => {
          void handleOpenSubmittedFile(file);
        }}
        onCancelDownload={handleCancelDownload}
        onPrimarySubmit={() => router.push(`/assignments/${vm.assignmentId}/submit`)}
      />
    </Screen>
  );
}
