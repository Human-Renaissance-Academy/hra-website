/** 생성된 v1 계약과 공유 인증 클라이언트를 제출 포트에 연결합니다. 변이 자동 재시도는 없습니다. */
import type { createApiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { SubmissionApi } from './types';

function required<T>(data: T | undefined): T {
  if (data === undefined) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
  return data;
}
export function createSubmissionApi(client: ReturnType<typeof createApiClient>): SubmissionApi {
  return {
    async createIntent(body) { return required((await client.POST('/api/v1/uploads/intents', { body })).data); },
    async clientToken(intent, assignmentId, signal) {
      const data = required((await client.POST('/api/v1/uploads', {
        body: { type: 'blob.generate-client-token', payload: { pathname: intent.pathname, multipart: false,
          clientPayload: JSON.stringify({ assignmentId, uploadIntentId: intent.uploadIntentId }) } },
        ...(signal ? { signal } : {}),
      })).data);
      switch (data.type) {
        case 'blob.generate-client-token':
          if (!data.clientToken.startsWith('vercel_blob_client_')) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
          return data.clientToken;
        case 'blob.upload-completed': throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
        default: { const exhaustive: never = data; return exhaustive; }
      }
    },
    async verify(record) {
      const data = required((await client.POST('/api/v1/uploads/{id}/verify', {
        params: { path: { id: record.uploadIntentId } }, body: { assignmentId: record.assignmentId },
      })).data);
      if (data.state !== 'VERIFIED') throw new ApiError({ status: 409, code: 'CONFLICT' });
    },
    async finalize(body) { return required((await client.POST('/api/v1/submissions', { body })).data).submission; },
    async cancel(record) {
      await client.DELETE('/api/v1/uploads/intents/{id}', {
        params: { path: { id: record.uploadIntentId } }, body: { assignmentId: record.assignmentId },
      });
    },
  };
}
