/**
 * 승인→저장→토큰→논리적 PUT 시도→검증→최종화를 직렬 실행하는 순수 제출 기계입니다.
 * 네이티브 중복 전송은 intent requestId·최종화 submissionKey·단일 사용 Blob 토큰으로 방어합니다.
 * PUT의 모호한 실패는 반드시 검증하며, 변이는 사용자 명시 요청 외에는 재시도하지 않습니다.
 */
import { ApiError } from '../../api/errors';
import type { ResumeRecord } from './resume-store';
import type { SelectedPdf, SubmitCommand, SubmitDependencies, SubmitEvent, SubmitResult } from './types';

export function validatePdf(file: SelectedPdf): SelectedPdf {
  const name = file.name.trim();
  if (!name || name.length > 255 || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0
    || file.mimeType !== 'application/pdf') throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  if (file.sizeBytes > 50 * 1024 * 1024) throw new ApiError({ status: 413, code: 'TOO_LARGE' });
  return { ...file, name };
}
export const retryAfterRemaining = (retryAt: number, now: number): number => Math.max(0, Math.ceil((retryAt - now) / 1000));

export async function runSubmitFlow(deps: SubmitDependencies, command: SubmitCommand,
  controls: { readonly signal?: AbortSignal; readonly onEvent?: (event: SubmitEvent) => void } = {}): Promise<SubmitResult> {
  const emit = (event: SubmitEvent) => controls.onEvent?.(event);
  let record: ResumeRecord | null = null;
  const cancelled = () => controls.signal?.aborted === true;
  const cancel = async (): Promise<SubmitResult> => {
    emit({ state: 'cancelling' });
    if (record) await deps.api.cancel(record);
    await deps.store.clear();
    record = null;
    emit({ state: 'cancelled' });
    return { kind: 'cancelled' };
  };
  try {
    record = await deps.store.read();
    switch (command.kind) {
      case 'cancel': return await cancel();
      case 'resume':
        if (!record) throw new ApiError({ status: 404, code: 'NOT_FOUND' });
        break;
      case 'new': {
        emit({ state: 'validating' });
        const file = validatePdf(command.file);
        if (cancelled()) return await cancel();
        if (record) throw new ApiError({ status: 409, code: 'CONFLICT' });
        const requestId = deps.generateId();
        const submissionKey = deps.generateId();
        emit({ state: 'creatingIntent' });
        // 이 POST는 중단하지 않아 발급된 식별자를 받은 뒤 서버 의도를 확실히 취소할 수 있게 합니다.
        const intent = await deps.api.createIntent({ assignmentId: command.assignmentId, requestId,
          originalName: file.name, sizeBytes: file.sizeBytes, mimeType: 'application/pdf' });
        record = { assignmentId: command.assignmentId, uploadIntentId: intent.uploadIntentId, requestId, submissionKey, phase: 'verifying' };
        try { await deps.store.write(record); }
        catch (error) { await deps.api.cancel(record); record = null; throw error; }
        if (cancelled()) return await cancel();
        emit({ state: 'authorizing' });
        const clientToken = await deps.api.clientToken(intent, command.assignmentId, controls.signal);
        if (cancelled()) return await cancel();
        emit({ state: 'uploading', percentage: 0 });
        if (cancelled()) return await cancel();
        try {
          await deps.upload({ pathname: intent.pathname, clientToken, file, signal: controls.signal,
            onProgress: (percentage) => emit({ state: 'uploading', percentage }) });
        } catch (error) {
          // 토큰이나 네이티브 오류 원문은 상태·로그로 전달하지 않습니다. 성공 여부는 검증만 판단합니다.
          if (!(error instanceof Error)) throw new ApiError({ status: 0, code: 'NETWORK' });
        }
        break;
      }
      default: { const exhaustive: never = command; return exhaustive; }
    }
    if (!record) throw new ApiError({ status: 404, code: 'NOT_FOUND' });
    if (record.phase === 'verifying') {
      emit({ state: 'verifying' });
      try { await deps.api.verify(record); }
      catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
          await deps.api.cancel(record);
          await deps.store.clear();
          record = null;
        }
        throw error;
      }
      if (cancelled()) return await cancel();
      record = { ...record, phase: 'finalizing' };
      await deps.store.write(record);
    }
    if (cancelled()) return await cancel();
    emit({ state: 'finalizing' });
    if (cancelled()) return await cancel();
    const submission = await deps.api.finalize({ assignmentId: record.assignmentId, uploadIntentId: record.uploadIntentId, submissionKey: record.submissionKey });
    await deps.store.clear();
    record = null;
    emit({ state: 'success', submission });
    return { kind: 'success', submission };
  } catch (failure) {
    if (cancelled() && record?.phase !== 'finalizing') {
      try { return await cancel(); }
      catch (cleanup) { failure = cleanup; }
    }
    const error = failure instanceof ApiError ? new ApiError({ status: failure.status, code: failure.code,
      retryAfterSeconds: failure.retryAfterSeconds, requestId: failure.requestId }) : new ApiError({ status: 0, code: 'UNAVAILABLE' });
    const retryAt = error.status === 429 ? deps.now() + (error.retryAfterSeconds ?? 60) * 1000 : null;
    emit({ state: 'error', error, retryAt });
    return { kind: 'error', error, retryAt, canResume: record !== null };
  }
}
