/** 생성 API 클라이언트의 스트림 모드를 사용하여 기존 세션 조정·GET 재시도 정책을 재사용합니다. */
import type { createApiClient } from '../../api/client';
import type { ProtectedRequest } from './download-protected-file';

export type ProtectedFileTarget =
  | { readonly kind: 'guidebook'; readonly id: string }
  | { readonly kind: 'submission'; readonly submissionId: string; readonly fileId: string };
export function createProtectedRequest(client: ReturnType<typeof createApiClient>, target: ProtectedFileTarget): ProtectedRequest {
  switch (target.kind) {
    case 'guidebook': return async (signal) => (await client.GET('/api/v1/resources/guidebooks/{id}/file', {
      params: { path: { id: target.id } }, parseAs: 'stream', signal,
    })).response;
    case 'submission': return async (signal) => (await client.GET('/api/v1/submissions/{id}/files/{fileId}', {
      params: { path: { id: target.submissionId, fileId: target.fileId } }, parseAs: 'stream', signal,
    })).response;
    default: { const exhaustive: never = target; return exhaustive; }
  }
}
