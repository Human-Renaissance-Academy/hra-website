/** 가짜 캐시와 인증 전송으로 파일 무결성·취소·401 복구·보관 기간을 검증합니다. */
import { downloadProtectedFile, sanitizePdfName } from '../src/features/files/download-protected-file';
import { createProtectedCache } from '../src/features/files/protected-cache';
import { createProtectedRequest } from '../src/features/files/protected-request';
import { createApiClient } from '../src/api/client';
import { memoryFiles } from './file-fixtures';
const pdf = () => new Response(new Uint8Array([37, 80, 68, 70]), { headers: { 'content-type': 'application/pdf', 'content-length': '4' } });

test('응답을 바이트별 캐시에 쓰고 진행률을 전달한다', async () => {
  // Given
  const { fs, files } = memoryFiles();
  const progress = jest.fn();
  // When
  const result = await downloadProtectedFile({ fs, request: async () => pdf(), fileNameHint: '자료.pdf', onProgress: progress });
  // Then
  expect(files.get(result.uri)?.bytes).toEqual([37, 80, 68, 70]);
  expect(progress).toHaveBeenLastCalledWith({ receivedBytes: 4, totalBytes: 4 });
});
test.each(['../../etc/passwd', '..\\..\\evil.exe', '\u0000a\n.pdf', 'a'.repeat(300), '\u202eevil.pdf', '%2fetc.pdf', ''])('파일명 공격 %s를 안전하게 바꾼다', (hint) => {
  // Given / When
  const name = sanitizePdfName(hint);
  // Then
  expect(name).toMatch(/^[^/\\%\n\u0000]+\.pdf$/);
  expect(new TextEncoder().encode(name).length).toBeLessThan(255);
  expect(name).not.toContain('..');
});
test.each(['3', '5', '0', '-1', 'garbage'])('길이 %s 불일치에서 부분 파일을 제거한다', async (length) => {
  // Given
  const { fs, files } = memoryFiles();
  const response = pdf(); response.headers.set('content-length', length);
  // When
  await expect(downloadProtectedFile({ fs, request: async () => response, fileNameHint: 'x' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  // Then
  expect(files.size).toBe(0);
});
test('진행 중 취소는 부분 파일을 남기지 않는다', async () => {
  // Given
  const { fs, files } = memoryFiles(); const controller = new AbortController();
  // When
  await expect(downloadProtectedFile({ fs, request: async () => pdf(), fileNameHint: 'x', signal: controller.signal,
    onProgress: ({ receivedBytes }) => { if (receivedBytes) controller.abort(); } })).rejects.toMatchObject({ code: 'NETWORK' });
  // Then
  expect(files.size).toBe(0);
});
test.each([false, true])('인증 GET은 401 뒤 한 번만 재시도하며 두 번째 401=%s를 처리한다', async (twice) => {
  // Given
  const auth = { getGeneration: () => 1, getAccessToken: async () => 'fake', refreshAfterUnauthorized: jest.fn(async () => undefined) };
  const unauthorized = () => new Response('{"error":{"code":"UNAUTHENTICATED"}}', { status: 401, headers: { 'content-type': 'application/json' } });
  const send = jest.fn(async () => twice ? unauthorized() : pdf()).mockResolvedValueOnce(unauthorized());
  const client = createApiClient({ baseUrl: 'https://fake.test', fetch: send, session: auth });
  const { fs } = memoryFiles();
  // When
  const result = downloadProtectedFile({ fs, request: createProtectedRequest(client, { kind: 'guidebook', id: 'fake' }), fileNameHint: 'x' });
  // Then
  if (twice) await expect(result).rejects.toMatchObject({ status: 401 });
  else await expect(result).resolves.toMatchObject({ sizeBytes: 4 });
  expect(send).toHaveBeenCalledTimes(2);
  expect(auth.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
});
test('24시간 경계 파일만 지우고 로그아웃 정리는 나머지도 지운다', async () => {
  // Given
  const { fs, files } = memoryFiles();
  files.set('old', { bytes: [1], modifiedAt: 0 }); files.set('new', { bytes: [2], modifiedAt: 1 });
  const cache = createProtectedCache(fs, () => 86400000);
  // When
  await cache.sweepProtectedCache();
  // Then
  expect([...files.keys()]).toEqual(['new']);
  await cache.clearProtectedCache();
  expect(files.size).toBe(0);
});
test('본문 스트림이 멈춰도 전체 제한시간 뒤 부분 파일을 정리한다', async () => {
  // Given
  const { fs, files } = memoryFiles();
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([37])); } }),
    { headers: { 'content-type': 'application/pdf', 'content-length': '4' } });
  // When
  await expect(downloadProtectedFile({ fs, request: async () => response, fileNameHint: 'x', timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  // Then
  expect(files.size).toBe(0);
});
