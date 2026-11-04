/**
 * 인증 GET 응답을 보호 캐시에 스트리밍합니다. 인증·갱신은 주입한 공유 API 클라이언트가 소유합니다.
 * 실패·취소·크기 불일치는 열린 핸들과 부분 파일을 정리한 뒤 비밀정보 없는 오류로 반환합니다.
 */
import { ApiError, parseApiError } from '../../api/errors';
import { TRANSFER_TIMEOUT_MS } from '../../api/transport';
import { ignoreCancellationFailure } from '../../lib/ignore-cancellation';
import { ko } from '../../i18n/ko';
import type { CacheWriter, FileSystemPort, TransferProgress } from './file-system-port';
import { MAX_DOWNLOAD_BYTES, reserveProtectedCache } from './protected-cache';

export type ProtectedRequest = (signal: AbortSignal) => Promise<Response>;
let cacheQueue = Promise.resolve();
export type DownloadOptions = {
  readonly request: ProtectedRequest;
  readonly fileNameHint: string;
  readonly fs: FileSystemPort;
  readonly onProgress?: (progress: TransferProgress) => void;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly ready?: () => Promise<void>;
};
export function sanitizePdfName(hint: string): string {
  // 디렉터리 구분자·제어문자·방향 제어·중첩 확장자를 제거하며 항상 PDF 확장자를 붙입니다.
  const cleaned = Array.from(hint.normalize('NFKC')).filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f)
      && !(code >= 0x202a && code <= 0x202e) && !(code >= 0x2066 && code <= 0x2069);
  }).join('').replace(/[/\\:*?"<>|%]/g, '_').replace(/^\.+/, '').replace(/\.pdf$/i, '').replace(/\./g, '_').trim();
  // UTF-8 바이트 길이를 보수적으로 제한하여 한글 이름도 Android 255바이트 제한 안에 둡니다.
  return `${Array.from(cleaned || ko.files.fallbackName).slice(0, 40).join('')}.pdf`;
}

export async function downloadProtectedFile(options: DownloadOptions): Promise<{ readonly uri: string; readonly fileName: string; readonly sizeBytes: number }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let timedOut = false;
  let writer: CacheWriter | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let readingComplete = false;
  const readyGate = options.ready?.();
  const previous = cacheQueue;
  let releaseCache = () => {};
  cacheQueue = new Promise<void>((resolve) => { releaseCache = resolve; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? TRANSFER_TIMEOUT_MS);
  const cancellation = new Promise<never>((_resolve, reject) => {
    const fail = () => reject(new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' }));
    controller.signal.addEventListener('abort', fail, { once: true });
    if (controller.signal.aborted) fail();
  });
  try {
    await previous;
    await readyGate;
    if (controller.signal.aborted) await cancellation;
    const response = await Promise.race([options.request(controller.signal), cancellation]);
    if (!response.ok) throw await parseApiError(response);
    if (!response.body) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
    const type = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (type !== 'application/pdf' && type !== 'application/octet-stream') throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
    const length = response.headers.get('content-length');
    const totalBytes = length === null ? null : Number(length);
    if (totalBytes !== null && (!Number.isSafeInteger(totalBytes) || totalBytes <= 0)) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
    if (totalBytes !== null && totalBytes > MAX_DOWNLOAD_BYTES) throw new ApiError({ status: 413, code: 'TOO_LARGE' });
    const fileName = sanitizePdfName(options.fileNameHint);
    await reserveProtectedCache(options.fs);
    writer = await options.fs.create(`${(options.now ?? Date.now)()}-${fileName}`);
    reader = response.body.getReader();
    let receivedBytes = 0;
    options.onProgress?.({ receivedBytes, totalBytes });
    while (true) {
      const chunk = await Promise.race([reader.read(), cancellation]);
      if (chunk.done) { readingComplete = true; break; }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_DOWNLOAD_BYTES) throw new ApiError({ status: 413, code: 'TOO_LARGE' });
      if (totalBytes !== null && receivedBytes > totalBytes) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
      await writer.write(chunk.value);
      options.onProgress?.({ receivedBytes, totalBytes });
    }
    if (!receivedBytes || (totalBytes !== null && receivedBytes !== totalBytes)) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
    if (controller.signal.aborted) await cancellation;
    await writer.close();
    if (controller.signal.aborted) await cancellation;
    return { uri: writer.uri, fileName, sizeBytes: receivedBytes };
  } catch (error) {
    controller.abort();
    // 네이티브 스트림 취소 완료가 지연되어도 로컬 부분 파일 정리는 기다리지 않습니다.
    if (reader) ignoreCancellationFailure(reader.cancel());
    if (writer) { try { await writer.abort(); } finally { await options.fs.delete(writer.uri); } }
    if (error instanceof ApiError) throw error;
    throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' });
  } finally {
    releaseCache();
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    if (readingComplete) reader?.releaseLock();
  }
}
