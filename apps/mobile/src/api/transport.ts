/**
 * HTTP 전송 정책입니다. 타임아웃과 호출자 취소를 연결하고 오류를 비밀정보 없이 변환합니다.
 * 재시도는 여기서 하지 않습니다. JSON 본문 수신도 제한시간에 포함합니다.
 */
import { ignoreCancellationFailure } from '../lib/ignore-cancellation';
import { ApiError } from './errors';

export type FetchTransport = (request: Request, init?: RequestInit) => Promise<Response>;
export const DEFAULT_TIMEOUT_MS = 20_000;
export const TRANSFER_TIMEOUT_MS = 120_000;
// 공지 본문을 포함한 JSON 응답의 실제 수신 바이트 상한입니다(2 MiB).
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

export function createTimedFetch(fetcher: FetchTransport, timeoutMs = DEFAULT_TIMEOUT_MS): FetchTransport {
  return async (request) => {
    const controller = new AbortController();
    let timedOut = false;
    let finished = false;
    let failBody: ((error: ApiError) => void) | undefined;
    const failure = () => new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' });
    const cancel = () => { if (!finished) { controller.abort(); failBody?.(failure()); } };
    request.signal.addEventListener('abort', cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
      request.signal.removeEventListener('abort', cancel);
      failBody = undefined;
    };
    try {
      // RN Request는 redirect를 보존하지 않을 수 있어 반드시 fetch INIT에도 전달합니다.
      // 한 번의 논리적 시도이며 네이티브 연결 복구 재전송은 서버 멱등성으로 방어합니다.
      const response = await fetcher(new Request(request, { signal: controller.signal, credentials: 'omit' }),
        { signal: controller.signal, credentials: 'omit', redirect: 'error' });
      if (!response.body) { cleanup(); return response; }
      const reader = response.body.getReader();
      const stopReader = () => ignoreCancellationFailure(reader.cancel());
      const stream = new ReadableStream<Uint8Array>({
        start(sink) {
          failBody = (error) => { sink.error(error); stopReader(); cleanup(); };
          if (controller.signal.aborted) failBody(failure());
        },
        async pull(sink) {
          try {
            const chunk = await reader.read();
            if (finished) return;
            if (chunk.done) { sink.close(); reader.releaseLock(); cleanup(); }
            else sink.enqueue(chunk.value);
          } catch (error) {
            sink.error(error instanceof ApiError ? error : failure());
            cleanup();
          }
        },
        cancel() { controller.abort(); stopReader(); cleanup(); },
      }, { highWaterMark: 0 });
      const wrapped = new Response(stream, { status: response.status, headers: response.headers, statusText: response.statusText });
      // RN의 Response 생성자는 스트림을 이해하지 않으므로 본문 접근만 직접 연결합니다.
      if (!wrapped.body) Object.defineProperty(wrapped, 'body', { value: stream });
      // JSON도 동일 스트림을 소비하므로 취소 연결은 본문 종료까지 유지됩니다.
      if (!response.ok || response.headers.get('content-type')?.includes('application/json')) {
        const body = wrapped.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (body) {
          while (true) {
            const chunk = await body.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_JSON_BYTES) {
              ignoreCancellationFailure(body.cancel());
              throw new ApiError({ status: 413, code: 'TOO_LARGE' });
            }
            chunks.push(chunk.value);
          }
          body.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return new Response(bytes.buffer, { status: response.status, headers: response.headers, statusText: response.statusText });
      }
      return wrapped;
    } catch (error) {
      cancel();
      cleanup();
      if (error instanceof ApiError) throw error;
      // 네이티브 fetch가 내는 오류는 경계에서만 변환하며 원본 메시지를 노출하지 않습니다.
      throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK' });
    }
  };
}
