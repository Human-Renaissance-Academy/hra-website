/**
 * 제출 재개 레코드의 순수 저장 계약입니다. 토큰·파일 URI·Blob URL은 저장하지 않습니다.
 * 최종화 직전 단계를 남겨 응답 유실 뒤에도 같은 제출 키로 최종화만 다시 요청합니다.
 */
export type ResumeRecord = {
  readonly assignmentId: string; readonly uploadIntentId: string; readonly submissionKey: string;
  readonly requestId: string; readonly phase: 'verifying' | 'finalizing';
};
export interface ResumeStore {
  read(): Promise<ResumeRecord | null>;
  write(record: ResumeRecord): Promise<void>;
  clear(): Promise<void>;
}
export function parseResumeRecord(value: unknown): ResumeRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('assignmentId' in value) || !('uploadIntentId' in value) || !('submissionKey' in value) || !('requestId' in value)) return null;
  const { assignmentId, uploadIntentId, submissionKey, requestId } = value;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof assignmentId !== 'string' || typeof uploadIntentId !== 'string' || typeof submissionKey !== 'string' || typeof requestId !== 'string'
    || ![assignmentId, uploadIntentId, submissionKey, requestId].every((id) => uuid.test(id))) return null;
  const phase = 'phase' in value ? value.phase : 'verifying';
  if (phase !== 'verifying' && phase !== 'finalizing') return null;
  return { assignmentId, uploadIntentId, submissionKey, requestId, phase };
}
