/** 제출 코어의 생성 계약 별칭과 주입 포트입니다. 네이티브 파일 객체는 코어로 들어오지 않습니다. */
import type { components } from '../../api/schema';
import type { ApiError } from '../../api/errors';
import type { ResumeStore, ResumeRecord } from './resume-store';

type Schemas = components['schemas'];
export type IntentInput = Schemas['AcademicUploadIntentInput'];
export type Intent = Schemas['AcademicUploadIntentResponse'];
export type FinalizeInput = Schemas['AcademicFinalizeSubmissionInput'];
export type Submitted = Schemas['AcademicFinalizedSubmissionResponse']['submission'];
export type SelectedPdf = { readonly uri: string; readonly name: string; readonly sizeBytes: number; readonly mimeType: string };
export interface SubmissionApi {
  createIntent(input: IntentInput): Promise<Intent>;
  clientToken(intent: Intent, assignmentId: string, signal?: AbortSignal): Promise<string>;
  verify(record: ResumeRecord): Promise<void>;
  finalize(input: FinalizeInput): Promise<Submitted>;
  cancel(record: ResumeRecord): Promise<void>;
}
export type UploadInput = {
  readonly pathname: string; readonly clientToken: string; readonly file: SelectedPdf;
  readonly signal?: AbortSignal | undefined; readonly onProgress?: ((percentage: number) => void) | undefined;
};
export type SubmitEvent =
  | { readonly state: 'validating' | 'creatingIntent' | 'authorizing' | 'verifying' | 'finalizing' | 'cancelling' }
  | { readonly state: 'uploading'; readonly percentage: number }
  | { readonly state: 'success'; readonly submission: Submitted }
  | { readonly state: 'cancelled' }
  | { readonly state: 'error'; readonly error: ApiError; readonly retryAt: number | null };
export type SubmitResult =
  | { readonly kind: 'success'; readonly submission: Submitted }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'error'; readonly error: ApiError; readonly retryAt: number | null; readonly canResume: boolean };
export type SubmitDependencies = {
  readonly api: SubmissionApi; readonly store: ResumeStore;
  readonly upload: (input: UploadInput) => Promise<void>;
  readonly generateId: () => string; readonly now: () => number;
};
export type SubmitCommand =
  | { readonly kind: 'new'; readonly assignmentId: string; readonly file: SelectedPdf }
  | { readonly kind: 'resume' }
  | { readonly kind: 'cancel' };
