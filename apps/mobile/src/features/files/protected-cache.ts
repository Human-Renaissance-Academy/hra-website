/** 보호 캐시의 보관 기간과 로그아웃 정리를 담당합니다. 전역 캐시 디렉터리는 건드리지 않습니다. */
import { ApiError } from '../../api/errors';
import type { FileSystemPort } from './file-system-port';

export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_CACHE_BYTES = 200 * 1024 * 1024;
export const MAX_CACHE_FILES = 20;

/** 새 다운로드의 최대 크기를 예약하고 오래된 파일부터 삭제합니다. */
export async function reserveProtectedCache(fs: FileSystemPort): Promise<void> {
  const files = [...await fs.list()].sort((a, b) => a.modifiedAt - b.modifiedAt || a.uri.localeCompare(b.uri));
  let bytes = files.reduce((total, file) => total + file.sizeBytes, 0);
  let count = files.length;
  for (const file of files) {
    if (bytes + MAX_DOWNLOAD_BYTES <= MAX_CACHE_BYTES && count < MAX_CACHE_FILES) break;
    await fs.delete(file.uri);
    bytes -= file.sizeBytes;
    count--;
  }
}

export function createProtectedCache(fs: FileSystemPort, now: () => number = Date.now) {
  return {
    async sweepProtectedCache(maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
      if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
      const cutoff = now() - maxAgeMs;
      for (const file of await fs.list()) if (file.modifiedAt <= cutoff) await fs.delete(file.uri);
    },
    async clearProtectedCache(): Promise<void> {
      for (const file of await fs.list()) await fs.delete(file.uri);
    },
  };
}
