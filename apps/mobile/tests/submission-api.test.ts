/** 생성 DTO 기반 어댑터의 HTTP 프로토콜을 가짜 인증 전송으로 검증합니다. */
import { createApiClient } from '../src/api/client';
import { createSubmissionApi } from '../src/features/submission/submission-api';
import { runSubmitFlow } from '../src/features/submission/submit-flow';
import { fixture, selected, assignmentId, intentId, token, submitted } from './submission-fixtures';
test('Bearer 변이는 Origin 없이 정확한 토큰·검증·최종화 요청을 보낸다', async () => {
  // Given
  const requests: { path: string; body: unknown; headers: Headers }[] = [];
  const responses = [{ uploadIntentId: intentId, pathname: 'opaque/exact.pdf', expiresAt: '2026-11-01T00:00:00Z' },
    { type: 'blob.generate-client-token', clientToken: token }, { state: 'VERIFIED' }, { submission: submitted }];
  const client = createApiClient({ baseUrl: 'https://fake.test',
    session: { getGeneration: () => 1, getAccessToken: async () => 'fake-bearer', refreshAfterUnauthorized: async () => undefined },
    fetch: async (request) => {
      requests.push({ path: new URL(request.url).pathname, body: await request.json(), headers: request.headers });
      return new Response(JSON.stringify(responses.shift()), { headers: { 'content-type': 'application/json' } });
    },
  });
  const f = fixture();
  // When
  const result = await runSubmitFlow({ ...f.deps, api: createSubmissionApi(client) }, { kind: 'new', assignmentId, file: selected });
  // Then
  expect(result.kind).toBe('success');
  expect(requests.map((request) => request.path)).toEqual(['/api/v1/uploads/intents', '/api/v1/uploads', `/api/v1/uploads/${intentId}/verify`, '/api/v1/submissions']);
  expect(requests[1]?.body).toEqual({ type: 'blob.generate-client-token', payload: { pathname: 'opaque/exact.pdf', multipart: false,
    clientPayload: JSON.stringify({ assignmentId, uploadIntentId: intentId }) } });
  expect(requests.every((request) => !request.headers.has('Origin') && request.headers.get('Authorization') === 'Bearer fake-bearer')).toBe(true);
});
