/** 실제 바이트 수신 상한과 오래된 파일 우선 공간 확보를 검증합니다. */
import { downloadProtectedFile } from '../src/features/files/download-protected-file';
import { MAX_CACHE_FILES, MAX_DOWNLOAD_BYTES, reserveProtectedCache } from '../src/features/files/protected-cache';
import { memoryFiles } from './file-fixtures';

test.each([null, '1', String(MAX_DOWNLOAD_BYTES + 1)])('Content-Length %s에도 다운로드 상한을 강제한다', async (length) => {
  // Given
  const { fs, files } = memoryFiles();
  const headers = new Headers({ 'content-type': 'application/pdf' });
  if (length) headers.set('content-length', length);
  const request = async () => new Response(new ReadableStream<Uint8Array>({
    start(sink) { sink.enqueue(new Uint8Array(MAX_DOWNLOAD_BYTES + 1)); sink.close(); },
  }), { headers });
  // When / Then
  await expect(downloadProtectedFile({ fs, fileNameHint: '자료', request })).rejects.toMatchObject({ code: 'TOO_LARGE' });
  expect(files.size).toBe(0);
});

test('파일 수 상한은 나열 순서가 아니라 오래된 수정 시각 순서로 삭제한다', async () => {
  // Given
  const { fs, files } = memoryFiles();
  for (let i = MAX_CACHE_FILES; i >= 0; i--) files.set(`file-${i}`, { bytes: [1], modifiedAt: i });
  // When
  await reserveProtectedCache(fs);
  // Then
  expect(files.size).toBe(MAX_CACHE_FILES - 1);
  expect([...files.keys()]).not.toContain('file-0');
  expect([...files.keys()]).not.toContain('file-1');
});

test('총 용량 상한은 새 파일의 최대 공간까지 예약한 뒤 다운로드를 허용한다', async () => {
  // Given
  const { fs } = memoryFiles();
  const deleted: string[] = [];
  const oversized = { ...fs, list: async () => [
    { uri: 'new', modifiedAt: 2, sizeBytes: 100 * 1024 * 1024 },
    { uri: 'old', modifiedAt: 1, sizeBytes: 100 * 1024 * 1024 },
  ], delete: async (uri: string) => { deleted.push(uri); } };
  // When
  await reserveProtectedCache(oversized);
  // Then
  expect(deleted).toEqual(['old']);
});
