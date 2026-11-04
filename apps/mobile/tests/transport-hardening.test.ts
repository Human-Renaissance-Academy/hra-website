/** HTTP 본문 수명과 용량·리다이렉트 정책을 네트워크 없는 스트림으로 검증합니다. */
import { createTimedFetch, MAX_JSON_BYTES } from '../src/api/transport';
import { createApiClient } from '../src/api/client';
import { createAuthApi } from '../src/auth/auth-api';

afterEach(() => jest.useRealTimers());

test('인증 변이도 fetch init에서 리다이렉트를 거부하고 실패를 재전송하지 않는다', async () => {
  // Given
  const fetcher = jest.fn(async (_request: Request, _init?: RequestInit): Promise<Response> => { throw new TypeError('redirect'); });
  const api = createAuthApi(createApiClient({ baseUrl: 'https://fake.test', fetch: fetcher }));
  // When
  await expect(api.refresh('synthetic')).rejects.toMatchObject({ code: 'NETWORK' });
  // Then
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
});

test.each(['caller', 'timeout'] as const)('헤더 이후 %s 취소도 실제 fetch signal을 중단한다', async (mode) => {
  // Given
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  const caller = new AbortController();
  let nativeSignal: AbortSignal | undefined;
  const send = createTimedFetch(async (request) => {
    nativeSignal = request.signal;
    return new Response(new ReadableStream<Uint8Array>({ start(sink) { sink.enqueue(new Uint8Array([1])); } }));
  }, 50);
  const response = await send(new Request('https://fake.test', { signal: caller.signal }));
  const reader = response.body?.getReader();
  await reader?.read();
  const pending = reader?.read().catch((error: unknown) => error);
  // When
  if (mode === 'caller') caller.abort();
  else jest.advanceTimersByTime(50);
  // Then
  expect(nativeSignal?.aborted).toBe(true);
  await expect(pending).resolves.toMatchObject({ code: mode === 'caller' ? 'NETWORK' : 'TIMEOUT' });
  expect(jest.getTimerCount()).toBe(0);
});

test('본문 정상 완료는 타이머와 호출자 연결을 해제하고 이후 취소는 무시한다', async () => {
  // Given
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
  const caller = new AbortController();
  const request = new Request('https://fake.test', { signal: caller.signal });
  const remove = jest.spyOn(request.signal, 'removeEventListener');
  let nativeSignal: AbortSignal | undefined;
  const send = createTimedFetch(async (sent) => { nativeSignal = sent.signal; return new Response('ok'); });
  // When
  const response = await send(request);
  expect(await response.text()).toBe('ok');
  caller.abort();
  // Then
  expect(nativeSignal?.aborted).toBe(false);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(jest.getTimerCount()).toBe(0);
});

test('JSON 실제 수신량이 상한을 넘으면 거짓 Content-Length에도 요청을 중단한다', async () => {
  // Given
  let nativeSignal: AbortSignal | undefined;
  const send = createTimedFetch(async (request) => {
    nativeSignal = request.signal;
    return new Response(new ReadableStream<Uint8Array>({ start(sink) { sink.enqueue(new Uint8Array(MAX_JSON_BYTES + 1)); } }),
      { headers: { 'content-type': 'application/json', 'content-length': '1' } });
  });
  // When / Then
  await expect(send(new Request('https://fake.test'))).rejects.toMatchObject({ code: 'TOO_LARGE' });
  expect(nativeSignal?.aborted).toBe(true);
});
