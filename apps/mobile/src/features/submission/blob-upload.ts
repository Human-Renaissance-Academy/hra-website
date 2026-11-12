/**
 * @vercel/blob 2.4.0의 API v12 PUT을 논리적으로 한 번 시도합니다. JS 자동 재시도만 제외합니다.
 * 네이티브 연결 복구 재전송은 제어할 수 없으므로 단일 사용 토큰과 후속 verify에 의존합니다.
 * 토큰은 Authorization에만 넣고 응답 URL·오류 본문은 외부로 반환하거나 기록하지 않습니다.
 */
import { ApiError } from '../../api/errors';
import { TRANSFER_TIMEOUT_MS } from '../../api/transport';
import type { UploadInput } from './types';

export type BlobPutRequest = {
  readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly fileUri: string;
  readonly sizeBytes: number; readonly signal: AbortSignal; readonly onProgress: (sent: number) => void;
};
export type BlobPutTransport = (request: BlobPutRequest) => Promise<{ readonly status: number; readonly body: unknown }>;
export type BlobFetch = (url: string, init: RequestInit) => Promise<Response>;

// Node 검증은 Blob·바이트 본문을, Expo는 별도 네이티브 파일 어댑터를 사용합니다.
export function createFetchBlobTransport(fetcher: BlobFetch, readBody: (uri: string) => Promise<Blob | Uint8Array<ArrayBuffer>>): BlobPutTransport {
  return async (request) => {
    const body = await readBody(request.fileUri);
    request.onProgress(0);
    const response = await fetcher(request.url, { method: 'PUT', headers: { ...request.headers }, body,
      signal: request.signal, redirect: 'error', credentials: 'omit' });
    const text = await response.text();
    let result: unknown = null;
    try { result = JSON.parse(text); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    return { status: response.status, body: result };
  };
}
export function createBlobUploader(deps: {
  readonly transport: BlobPutTransport; readonly generateId: () => string; readonly now: () => number;
  readonly endpoint?: string; readonly timeoutMs?: number;
}) {
  return async (input: UploadInput): Promise<void> => {
    if (!input.clientToken.startsWith('vercel_blob_client_')) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
    const storeId = input.clientToken.split('_')[3];
    if (!storeId) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
    const controller = new AbortController();
    const cancel = () => controller.abort();
    input.signal?.addEventListener('abort', cancel, { once: true });
    if (input.signal?.aborted) cancel();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deps.timeoutMs ?? TRANSFER_TIMEOUT_MS);
    try {
      if (controller.signal.aborted) throw new ApiError({ status: 0, code: 'NETWORK' });
      const endpoint = deps.endpoint ?? 'https://vercel.com/api/blob';
      const url = `${endpoint}/?${new URLSearchParams({ pathname: input.pathname }).toString()}`;
      input.onProgress?.(0);
      const cancellation = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' })), { once: true });
      });
      const response = await Promise.race([deps.transport({ url, fileUri: input.file.uri, sizeBytes: input.file.sizeBytes, signal: controller.signal,
        headers: { authorization: `Bearer ${input.clientToken}`, 'x-api-version': '12', 'x-vercel-blob-access': 'private',
          'x-content-type': 'application/pdf', 'x-content-length': String(input.file.sizeBytes),
          'x-vercel-blob-store-id': storeId, 'x-api-blob-request-id': `${storeId}:${deps.now()}:${deps.generateId()}`,
          'x-api-blob-request-attempt': '0' },
        onProgress: (sent) => input.onProgress?.(Math.min(99, Math.max(0, sent / input.file.sizeBytes * 100))),
      }), cancellation]);
      if (response.status < 200 || response.status >= 300) {
        const code = response.status === 413 ? 'TOO_LARGE' : response.status === 429 ? 'RATE_LIMITED'
          : response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN'
            : response.status === 409 ? 'CONFLICT' : response.status === 404 ? 'NOT_FOUND' : 'STORAGE_UNAVAILABLE';
        throw new ApiError({ status: response.status, code });
      }
      const body = response.body;
      if (typeof body !== 'object' || body === null || !('pathname' in body) || body.pathname !== input.pathname) {
        throw new ApiError({ status: 503, code: 'STORAGE_UNAVAILABLE' });
      }
      input.onProgress?.(100);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' });
    } finally { clearTimeout(timer); input.signal?.removeEventListener('abort', cancel); }
  };
}
