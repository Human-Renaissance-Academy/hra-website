/** 제출 기계용 인메모리 저장소와 타입 있는 가짜 서버입니다. 호출 순서와 결과를 관찰합니다. */
import type { ResumeRecord, ResumeStore } from '../src/features/submission/resume-store';
import type { SubmissionApi, SubmitDependencies, SubmitEvent, SelectedPdf, Submitted } from '../src/features/submission/types';
export const assignmentId = '11111111-1111-4111-8111-111111111111';
export const intentId = '22222222-2222-4222-8222-222222222222';
export const key = '33333333-3333-4333-8333-333333333333';
export const token = 'vercel_blob_client_fake_secret';
export const selected: SelectedPdf = { uri: 'cache://picked.pdf', name: ' 보고서.pdf ', sizeBytes: 4, mimeType: 'application/pdf' };
export const saved: ResumeRecord = { assignmentId, uploadIntentId: intentId, requestId: key, submissionKey: key, phase: 'verifying' };
export const submitted: Submitted = { assignmentId, submissionId: key, submittedAt: '2026-10-31T00:00:00Z', replayed: false,
  file: { fileId: key, originalName: '보고서.pdf', mimeType: 'application/pdf', sizeBytes: 4 } };
export function fixture() {
  let record: ResumeRecord | null = null;
  const calls: string[] = [];
  const events: SubmitEvent[] = [];
  const store: ResumeStore = {
    async read() { return record; }, async write(next) { record = next; calls.push(`save:${next.phase}`); },
    async clear() { record = null; calls.push('clear'); },
  };
  const api: SubmissionApi = {
    async createIntent() { calls.push('intent'); return { uploadIntentId: intentId, pathname: 'opaque/exact.pdf', expiresAt: '2026-11-01T00:00:00Z' }; },
    async clientToken() { calls.push('token'); return token; },
    async verify() { calls.push('verify'); }, async finalize() { calls.push('finalize'); return submitted; },
    async cancel() { calls.push('cancel'); },
  };
  const deps: SubmitDependencies = { api, store, now: () => 1000, generateId: () => key,
    upload: async (input) => { calls.push('upload'); input.onProgress?.(50); } };
  return { deps, api, store, calls, events, emit: (event: SubmitEvent) => events.push(event) };
}
