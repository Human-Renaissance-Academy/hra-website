/**
 * 역할: 과제 제출 흐름의 상태·생명주기·실행기 제어 훅(useAssignmentSubmissionController)
 * 사용 위치: src/features/assignments/assignment-submit-screen.tsx
 * 주요 기능:
 * - 재개 레코드 초기 조회, 429 retryAt 카운트다운, 화면 언마운트 시 진행 중인 요청 중단 및 임시 캐시 파일 정리
 * - PDF 파일 선택 및 validatePdf 검증, createSubmitRunner 실행, trackTransfer 등록/해제, 완료 시 쿼리 무효화
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getResumeStore, trackTransfer } from '../account/account-runtime';
import { getSessionManager } from '../../auth/runtime';
import { retainSubmissionFile } from '../files/submission-files';
import { retryAfterRemaining } from '../submission/submit-flow';
import type { SelectedPdf, SubmitCommand } from '../submission/types';
import { invalidateAssignmentQueries } from './assignments-api';
import {
  createDefaultAssignmentSubmitRunner,
  deletePickedCacheFile,
  pickAssignmentPdfFromDevice,
} from './submit-runtime';
import type { SubmitRunnerFn } from './submit-runtime';
import {
  createInitialSubmitViewState,
  parsePickedPdfAssets,
  reduceSubmitEvent,
  reduceSubmitResult,
} from './submission-view-model';
import type { PickedDocumentAssetLike, SubmitProgressViewState } from './submission-view-model';
import { assignmentsStrings } from './strings';

export interface UseAssignmentSubmissionControllerOptions {
  readonly assignmentId: string;
  readonly userId: string | undefined;
  readonly initialMode?: 'new' | 'resume' | undefined;
  readonly now?: (() => number) | undefined;
  readonly runner?: SubmitRunnerFn | undefined;
  readonly pickPdf?: (() => Promise<readonly PickedDocumentAssetLike[] | null>) | undefined;
  readonly cleanupPickedFile?: ((uri: string | null | undefined) => void) | undefined;
}

export interface UseAssignmentSubmissionControllerResult {
  readonly selectedFile: SelectedPdf | null;
  readonly selectedFileSizeText: string | null;
  readonly validationError: string | null;
  readonly viewState: SubmitProgressViewState;
  readonly remainingSeconds: number;
  readonly handlePickPdf: () => Promise<void>;
  readonly handlePrimarySubmit: () => void;
  readonly handleCancelOrStartOver: () => void;
}

/** 과제 제출 화면의 파일 선택·검증·진행·취소·카운트다운·정리 생명주기를 관리하는 훅입니다. */
export function useAssignmentSubmissionController({
  assignmentId,
  userId,
  initialMode,
  now = Date.now,
  runner: injectedRunner,
  pickPdf = pickAssignmentPdfFromDevice,
  cleanupPickedFile = deletePickedCacheFile,
}: UseAssignmentSubmissionControllerOptions): UseAssignmentSubmissionControllerResult {
  const queryClient = useQueryClient();
  const effectiveUserId = userId ?? 'anonymous';

  const runner = useMemo(
    () => injectedRunner ?? createDefaultAssignmentSubmitRunner(effectiveUserId, now),
    [effectiveUserId, injectedRunner, now],
  );

  const [selectedFile, setSelectedFile] = useState<SelectedPdf | null>(null);
  const [selectedFileSizeText, setSelectedFileSizeText] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [viewState, setViewState] = useState(() =>
    createInitialSubmitViewState(initialMode === 'resume'),
  );
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const pickedUriRef = useRef<string | null>(null);
  const accountRef = useRef(userId);
  useEffect(() => { accountRef.current = userId; }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) return;
    getResumeStore(userId)
      .read()
      .then((record) => {
        if (!active || runningRef.current) return;
        const hasMatch = Boolean(record && record.assignmentId === assignmentId);
        if (hasMatch) {
          setViewState((prev) =>
            prev.step === 'idle' ? createInitialSubmitViewState(true) : prev,
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [assignmentId, userId]);

  useEffect(() => {
    const retryAt = viewState.retryAt;
    if (!retryAt) return;
    const tick = () => {
      setRemainingSeconds(retryAfterRemaining(retryAt, now()));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [now, viewState.retryAt]);

  const effectiveRemainingSeconds = viewState.retryAt ? remainingSeconds : 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      if (pickedUriRef.current) {
        cleanupPickedFile(pickedUriRef.current);
        pickedUriRef.current = null;
      }
    };
  }, [cleanupPickedFile, userId]);

  const handlePickPdf = useCallback(async () => {
    if (runningRef.current) return;
    setValidationError(null);
    const generation = getSessionManager().getGeneration();
    const current = () => mountedRef.current && accountRef.current === userId && getSessionManager().getGeneration() === generation;
    try {
      const assets = await pickPdf();
      if (!assets) return;
      if (!current()) { for (const asset of assets) cleanupPickedFile(asset.uri); return; }
      const parsed = parsePickedPdfAssets(assets);
      if (!parsed.ok) {
        if (assets[0]?.uri) cleanupPickedFile(assets[0].uri);
        setSelectedFile(null);
        setSelectedFileSizeText(null);
        setValidationError(parsed.message);
        return;
      }
      let uri = parsed.file.uri;
      try {
        if (pickPdf === pickAssignmentPdfFromDevice && userId) uri = await retainSubmissionFile(uri, userId);
      } catch (error) { cleanupPickedFile(uri); throw error; }
      if (!current()) { cleanupPickedFile(uri); return; }
      if (pickedUriRef.current && pickedUriRef.current !== parsed.file.uri) {
        cleanupPickedFile(pickedUriRef.current);
      }
      pickedUriRef.current = uri;
      setSelectedFile({ ...parsed.file, uri });
      setSelectedFileSizeText(parsed.fileSizeText);
      setViewState((prev) => ({
        ...prev,
        errorMessage: null,
        statusMessage: null,
        primaryActionMode: prev.canResume ? 'resume' : 'new',
        primaryActionLabel: prev.canResume
          ? assignmentsStrings.submit.resumeAction
          : assignmentsStrings.submit.startSubmitAction,
      }));
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (current()) setValidationError(assignmentsStrings.errors.invalidPdf);
    }
  }, [cleanupPickedFile, pickPdf, userId]);

  const executeCommand = useCallback(
    async (command: SubmitCommand) => {
      if (runningRef.current) return;
      if (command.kind !== 'cancel' && effectiveRemainingSeconds > 0) return;

      runningRef.current = true;
      setValidationError(null);
      const controller = new AbortController();
      activeControllerRef.current = controller;
      const untrack = trackTransfer(controller);

      try {
        const result = await runner(command, {
          signal: controller.signal,
          onEvent: (event) => {
            if (!mountedRef.current) return;
            setViewState((prev) => reduceSubmitEvent(prev, event, now()));
          },
        });

        if (!mountedRef.current) return;
        setViewState((prev) => reduceSubmitResult(prev, result, now()));

        if (result.kind === 'success') {
          if (userId) await getResumeStore(userId).clear().catch(() => undefined);
          if (pickedUriRef.current) {
            cleanupPickedFile(pickedUriRef.current);
            pickedUriRef.current = null;
          }
          await invalidateAssignmentQueries(queryClient, userId, assignmentId);
        } else if (result.kind === 'cancelled') {
          if (userId) await getResumeStore(userId).clear().catch(() => undefined);
        }
      } finally {
        untrack();
        if (activeControllerRef.current === controller) activeControllerRef.current = null;
        runningRef.current = false;
      }
    },
    [assignmentId, cleanupPickedFile, effectiveRemainingSeconds, now, queryClient, runner, userId],
  );

  const handlePrimarySubmit = useCallback(() => {
    if (runningRef.current || effectiveRemainingSeconds > 0) return;
    if (viewState.canResume || viewState.primaryActionMode === 'resume') {
      void executeCommand({ kind: 'resume' });
      return;
    }
    if (!selectedFile) {
      setValidationError(assignmentsStrings.errors.invalidPdf);
      return;
    }
    void executeCommand({ kind: 'new', assignmentId, file: selectedFile });
  }, [assignmentId, effectiveRemainingSeconds, executeCommand, selectedFile, viewState.canResume, viewState.primaryActionMode]);

  const handleCancelOrStartOver = useCallback(() => {
    if (runningRef.current) {
      activeControllerRef.current?.abort();
      return;
    }
    void executeCommand({ kind: 'cancel' });
  }, [executeCommand]);

  return {
    selectedFile,
    selectedFileSizeText,
    validationError,
    viewState,
    remainingSeconds: effectiveRemainingSeconds,
    handlePickPdf,
    handlePrimarySubmit,
    handleCancelOrStartOver,
  };
}
