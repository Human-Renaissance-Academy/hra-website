/** 순수 다운로드 테스트의 인메모리 캐시입니다. 실제 파일 시스템과 같은 바이트 누적 계약을 제공합니다. */
import type { FileSystemPort } from '../src/features/files/file-system-port';
export function memoryFiles() {
  const files = new Map<string, { bytes: number[]; modifiedAt: number }>();
  let sequence = 0;
  const fs: FileSystemPort = {
    async create(name) {
      const uri = `cache://${++sequence}-${name}`;
      const entry: { bytes: number[]; modifiedAt: number } = { bytes: [], modifiedAt: 0 };
      files.set(uri, entry);
      return { uri, async write(chunk) { entry.bytes.push(...chunk); }, async close() {}, async abort() {} };
    },
    async delete(uri) { files.delete(uri); },
    async list() { return [...files].map(([uri, file]) => ({ uri, modifiedAt: file.modifiedAt, sizeBytes: file.bytes.length })); },
    async contentUri(uri) { return uri.replace('cache:', 'content:'); },
  };
  return { fs, files };
}
