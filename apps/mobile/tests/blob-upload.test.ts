/** Node HTTP 로컬 가짜 Blob 서버로 실제 단일 PUT의 URL·헤더·바이트·오류·취소를 검증합니다. */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createBlobUploader, createFetchBlobTransport } from '../src/features/submission/blob-upload';
import type { BlobFetch } from '../src/features/submission/blob-upload';
import { selected, token } from './submission-fixtures';

// jest-expo 전역 fetch 모의 구현 대신 Node 런타임의 실제 fetch를 VM 경계에서 가져옵니다.
const nodeFetch: BlobFetch = jest.requireActual('node:vm').runInThisContext('fetch');
let server: Server;
let endpoint: string;
let status = 200;
let hang = false;
let count = 0;
let observed: { method?: string | undefined; url?: string | undefined; headers: Record<string, string | string[] | undefined>; bytes: number[] };
beforeEach(async () => {
  status = 200; hang = false; count = 0;
  observed = { headers: {}, bytes: [] };
  server = createServer((request, response) => {
    count++; observed = { method: request.method, url: request.url, headers: request.headers, bytes: [] };
    request.on('data', (chunk: Buffer) => observed.bytes.push(...chunk));
    request.on('end', () => {
      if (hang) return;
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(status === 200 ? { pathname: 'opaque/exact +한글.pdf' } : { error: token }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new TypeError('local address');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
function upload(timeoutMs = 1000) {
  return createBlobUploader({ endpoint, timeoutMs, now: () => 1, generateId: () => 'fake',
    transport: createFetchBlobTransport(nodeFetch, async () => new Uint8Array([37, 80, 68, 70])) });
}
const input = () => ({ pathname: 'opaque/exact +한글.pdf', clientToken: token, file: selected });

test('정확한 pathname·private 헤더·PDF 바이트로 PUT 한 번만 보낸다', async () => {
  // Given
  const progress = jest.fn();
  // When
  await upload()({ ...input(), onProgress: progress });
  // Then
  expect(count).toBe(1); expect(observed.method).toBe('PUT');
  expect(new URL(observed.url ?? '', endpoint).searchParams.get('pathname')).toBe(input().pathname);
  expect(observed.headers).toMatchObject({ authorization: `Bearer ${token}`, 'x-api-version': '12',
    'x-vercel-blob-access': 'private', 'x-content-type': 'application/pdf', 'x-content-length': '4', 'x-api-blob-request-attempt': '0' });
  expect(observed.bytes).toEqual([37, 80, 68, 70]);
  expect(progress).toHaveBeenLastCalledWith(100);
});
test.each([400, 401, 403, 404, 409, 413, 429, 500, 503])('Blob %i 응답은 재시도·원문 노출 없이 오류로 반환한다', async (code) => {
  // Given
  status = code;
  // When
  const error: unknown = await upload()(input()).catch((failure: unknown) => failure);
  // Then
  expect(error).toMatchObject({ status: code }); expect(String(error)).not.toContain(token); expect(count).toBe(1);
});
test('로컬 서버가 멈추면 제한시간에 안전한 오류를 반환한다', async () => {
  // Given
  hang = true;
  // When / Then
  await expect(upload(30)(input())).rejects.toMatchObject({ code: 'TIMEOUT' });
});
test('사용자가 취소하면 PUT을 중단한다', async () => {
  // Given
  const controller = new AbortController(); controller.abort();
  // When / Then
  await expect(upload()({ ...input(), signal: controller.signal })).rejects.toMatchObject({ code: 'NETWORK' });
  expect(count).toBe(0);
});
test('로컬 PUT을 보내는 중 취소해도 재전송하지 않는다', async () => {
  // Given
  hang = true; const controller = new AbortController();
  const started = new Promise<void>((resolve) => server.once('request', () => resolve()));
  const result = upload()({ ...input(), signal: controller.signal }).catch((failure: unknown) => failure);
  // When
  await started; controller.abort();
  // Then
  await expect(result).resolves.toMatchObject({ code: 'NETWORK' }); expect(count).toBe(1);
});
