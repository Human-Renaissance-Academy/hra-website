/** 보호 다운로드 포트를 실행별 Node 임시 디렉터리에 연결한다. 열린 핸들 취소는 멱등이다. */
import { open, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileSystemPort } from '../src/features/files/file-system-port';

export function nodeFiles(root: string): FileSystemPort {
  return {
    async create(name) {
      const uri = join(root, name), handle = await open(uri, 'wx');
      let closed = false;
      const close = async () => { if (!closed) { closed = true; await handle.close(); } };
      return { uri, write: async chunk => { await handle.write(chunk); }, close, abort: close };
    },
    async delete(uri) { await unlink(uri); },
    async list() { return Promise.all((await readdir(root)).map(async name => {
      const uri = join(root, name); const info = await stat(uri); return { uri, modifiedAt: info.mtimeMs, sizeBytes: info.size };
    })); },
    async contentUri(uri) { return uri; },
  };
}
