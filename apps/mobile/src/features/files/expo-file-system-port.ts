/** SDK 58 File·Directory·FileHandle을 보호 캐시 포트로 연결하는 네이티브 전용 어댑터입니다. */
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../../api/errors';
import type { FileSystemPort } from './file-system-port';

export function createExpoFileSystemPort(): FileSystemPort {
  const directory = new Directory(Paths.cache, 'hra-protected');
  const contained = (uri: string) => {
    const file = new File(uri);
    if (file.parentDirectory.uri !== directory.uri) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
    return file;
  };
  return {
    async create(fileName) {
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, `${randomUUID()}-${fileName}`);
      file.create();
      try {
        const handle = file.open();
        let closed = false;
        const close = async () => { if (!closed) { closed = true; handle.close(); } };
        return { uri: file.uri, write: (chunk) => handle.writeBytes(chunk), close, abort: close };
      } catch (error) {
        file.delete();
        if (error instanceof ApiError) throw error;
        throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
      }
    },
    async delete(uri) { const file = contained(uri); if (file.exists) file.delete(); },
    async list() {
      if (!directory.exists) return [];
      return directory.list().filter((item): item is File => item instanceof File)
        .map((file) => ({ uri: file.uri, modifiedAt: file.lastModified ?? 0, sizeBytes: file.size }));
    },
    async contentUri(uri) { return contained(uri).contentUri; },
  };
}
