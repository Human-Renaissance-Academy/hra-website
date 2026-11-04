/** HTTP 경계 회귀입니다. 가짜 전송만 사용하여 인증 주입·GET 한정 재전송·타임아웃을 검증합니다. */
import { createApiClient } from '../src/api/client';
import type { SessionAccess } from '../src/api/client';
import { ApiError, parseApiError, toKoreanMessage } from '../src/api/errors';
import { createTimedFetch } from '../src/api/transport';
import { ko } from '../src/i18n/ko';
import { retryQuery } from '../src/query/client';
import { deferred } from './auth-fixtures';

function unauthorized() { return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', requestId: 'fake-request' } }), { status: 401, headers: { 'content-type': 'application/json' } }); }
function session(): SessionAccess {
  return { getGeneration: () => 1, getAccessToken: jest.fn(async () => 'fake-access'), refreshAfterUnauthorized: jest.fn(async () => undefined) };
}

test('Authorization을 주입하고 요청 식별자를 포착한다', async () => {
  // Given
  const send = jest.fn(async (_request: Request) => new Response('{}', { headers: { 'content-type': 'application/json', 'X-Request-Id': 'request-1' } }));
  const capture = jest.fn();
  const client = createApiClient({ baseUrl: 'https://example.test', fetch: send, session: session(), onRequestId: capture });
  // When
  await client.GET('/api/v1/me');
  // Then
  expect(send.mock.calls[0]?.[0].headers.get('Authorization')).toBe('Bearer fake-access');
  expect(capture).toHaveBeenCalledWith('request-1');
});

test('GET 401은 조정기를 거쳐 한 번만 재전송한다', async () => {
  // Given
  const auth = session();
  const send = jest.fn(async (_request: Request) => unauthorized()).mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(new Response('{}'));
  const client = createApiClient({ baseUrl: 'https://example.test', fetch: send, session: auth });
  // When
  await client.GET('/api/v1/me');
  // Then
  expect(send).toHaveBeenCalledTimes(2);
  expect(auth.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
});

test('재전송 완료 전에 계정이 바뀌면 이전 응답을 반환하지 않는다', async () => {
  // Given
  let generation = 1;
  const auth = { ...session(), getGeneration: () => generation };
  const response = deferred<Response>();
  const started = deferred<void>();
  const send = jest.fn(async (_request: Request) => { started.resolve(); return response.promise; }).mockResolvedValueOnce(unauthorized());
  const client = createApiClient({ baseUrl: 'https://example.test', fetch: send, session: auth });
  // When
  const result = client.GET('/api/v1/me').catch((error: unknown) => error);
  await started.promise;
  generation = 2;
  response.resolve(new Response('{}'));
  // Then
  await expect(result).resolves.toMatchObject({ status: 401 });
});

test('변이 401은 조정 후에도 변이를 재전송하지 않는다', async () => {
  // Given
  const send = jest.fn(async (_request: Request) => unauthorized());
  const client = createApiClient({ baseUrl: 'https://example.test', fetch: send, session: session() });
  // When
  await expect(client.POST('/api/v1/auth/logout-all')).rejects.toMatchObject({ status: 401 });
  // Then
  expect(send).toHaveBeenCalledTimes(1);
});

test('전송 실패는 NETWORK로 바꾸고 재전송하지 않는다', async () => {
  // Given
  const send = jest.fn(async () => { throw new TypeError('fake network'); });
  const client = createApiClient({ baseUrl: 'https://example.test', fetch: send });
  // When
  await expect(client.GET('/api/v1/me')).rejects.toMatchObject({ code: 'NETWORK' });
  // Then
  expect(send).toHaveBeenCalledTimes(1);
});

test('요청 제한시간이 지나면 TIMEOUT으로 반환한다', async () => {
  // Given
  jest.useFakeTimers();
  const send = createTimedFetch((request) => new Promise((_resolve, reject) => {
    request.signal.addEventListener('abort', () => reject(new TypeError('fake abort')));
  }), 100);
  // When
  const result = send(new Request('https://example.test')).catch((error: unknown) => error);
  jest.advanceTimersByTime(100);
  // Then
  await expect(result).resolves.toMatchObject({ code: 'TIMEOUT' });
  jest.useRealTimers();
});

test('오류 봉투에서 코드와 요청 식별자와 대기시간만 보존한다', async () => {
  // Given
  const response = new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'do not display', requestId: 'fake-id', retryAfterSeconds: 80 } }), { status: 429 });
  // When
  const error = await parseApiError(response);
  // Then
  expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', requestId: 'fake-id', retryAfterSeconds: 80 });
  expect(toKoreanMessage(error)).toBe(ko.waitMinutes(2));
});

test.each(Object.keys(ko.errors).filter((key) => key !== 'credentials'))('오류 코드 %s는 한국어로 매핑한다', async (code) => {
  // Given
  const error = await parseApiError(new Response(JSON.stringify({ error: { code } }), { status: 503 }));
  // When
  const message = toKoreanMessage(error);
  // Then
  expect(message).toMatch(/[가-힣]/);
});

test('로그인 401은 자격 증명 안내를 사용한다', () => {
  // Given
  const error = new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
  // When / Then
  expect(toKoreanMessage(error, 'login')).toBe(ko.errors.credentials);
});

test.each([400, 401, 403, 404, 409, 413, 429])('쿼리는 %s를 자동 재시도하지 않는다', (status) => {
  // Given
  const error = new ApiError({ status, code: 'UNAVAILABLE' });
  // When / Then
  expect(retryQuery(0, error)).toBe(false);
});
