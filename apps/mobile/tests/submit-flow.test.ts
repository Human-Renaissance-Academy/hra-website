/** 제출 순서·모호한 전송·재개·취소·서버 오류의 회귀입니다. 실제 서버는 호출하지 않습니다. */
import { ApiError } from '../src/api/errors';
import { runSubmitFlow, validatePdf, retryAfterRemaining } from '../src/features/submission/submit-flow';
import { parseResumeRecord } from '../src/features/submission/resume-store';
import { createSubmitRunner } from '../src/features/submission/submit-runner';
import { assignmentId, selected, saved, submitted, fixture, token } from './submission-fixtures';

test('승인 후 저장하고 PUT·검증·최종화를 정확한 순서로 수행한다', async () => {
  // Given
  const f = fixture();
  // When
  const result = await runSubmitFlow(f.deps, { kind: 'new', assignmentId, file: selected }, { onEvent: f.emit });
  // Then
  expect(result).toEqual({ kind: 'success', submission: submitted });
  expect(f.calls).toEqual(['intent', 'save:verifying', 'token', 'upload', 'verify', 'save:finalizing', 'finalize', 'clear']);
  expect(JSON.stringify(f.events)).not.toContain(token);
  expect(await f.store.read()).toBeNull();
});
test.each([
  { ...selected, name: ' ' }, { ...selected, name: 'a'.repeat(256) }, { ...selected, sizeBytes: 0 },
  { ...selected, sizeBytes: -1 }, { ...selected, sizeBytes: 1.5 }, { ...selected, mimeType: 'text/plain' },
  { ...selected, sizeBytes: 52428801 },
])('잘못된 PDF 선택은 승인 요청 전에 거부한다 %#', async (file) => {
  // Given
  const f = fixture();
  // When
  const result = await runSubmitFlow(f.deps, { kind: 'new', assignmentId, file });
  // Then
  expect(result.kind).toBe('error'); expect(f.calls).toEqual([]);
});
test('50MiB 경계와 이름 trim을 허용한다', () => {
  // Given / When / Then
  expect(validatePdf({ ...selected, sizeBytes: 52428800 }).name).toBe('보고서.pdf');
});
test('PUT 응답이 유실되어도 검증 성공이면 최종화한다', async () => {
  // Given
  const f = fixture();
  // When
  const result = await runSubmitFlow({ ...f.deps, upload: async () => { throw new TypeError(token); } },
    { kind: 'new', assignmentId, file: selected }, { onEvent: f.emit });
  // Then
  expect(result.kind).toBe('success'); expect(f.calls).toContain('verify');
  expect(JSON.stringify(f.events)).not.toContain(token);
});
test('프로세스 종료 뒤 재개는 토큰·파일 없이 검증부터 시작한다', async () => {
  // Given
  const f = fixture(); await f.store.write(saved); f.calls.length = 0;
  // When
  const result = await runSubmitFlow(f.deps, { kind: 'resume' });
  // Then
  expect(result.kind).toBe('success');
  expect(f.calls).toEqual(['verify', 'save:finalizing', 'finalize', 'clear']);
});
test('최종화 응답 유실 뒤 같은 키 재전송의 replayed를 성공 처리한다', async () => {
  // Given
  const f = fixture(); await f.store.write({ ...saved, phase: 'finalizing' });
  const finalize = jest.fn(async () => ({ ...submitted, replayed: true }));
  // When
  const result = await runSubmitFlow({ ...f.deps, api: { ...f.api, finalize } }, { kind: 'resume' });
  // Then
  expect(finalize).toHaveBeenCalledWith({ assignmentId, uploadIntentId: saved.uploadIntentId, submissionKey: saved.submissionKey });
  expect(result).toMatchObject({ kind: 'success', submission: { replayed: true } });
  expect(f.calls).not.toContain('verify');
});
test.each([404, 409])('검증 %i는 서버 의도를 취소하고 새 시도를 요구한다', async (status) => {
  // Given
  const f = fixture(); await f.store.write(saved);
  const api = { ...f.api, verify: async () => { throw new ApiError({ status, code: status === 404 ? 'NOT_FOUND' : 'CONFLICT' }); } };
  // When
  const result = await runSubmitFlow({ ...f.deps, api }, { kind: 'resume' });
  // Then
  expect(result).toMatchObject({ kind: 'error', canResume: false }); expect(f.calls).toContain('cancel');
});
test.each([
  [409, 'CONFLICT'], [413, 'TOO_LARGE'], [429, 'RATE_LIMITED'], [503, 'STORAGE_UNAVAILABLE'],
  [503, 'DISABLED'], [503, 'UNAVAILABLE'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'],
] as const)('최종화 %i/%s는 자동 재시도하지 않고 안정된 키를 보존한다', async (status, code) => {
  // Given
  const f = fixture(); await f.store.write({ ...saved, phase: 'finalizing' });
  const finalize = jest.fn(async () => { throw new ApiError({ status, code, retryAfterSeconds: 30 }); });
  // When
  const result = await runSubmitFlow({ ...f.deps, api: { ...f.api, finalize } }, { kind: 'resume' });
  // Then
  expect(result).toMatchObject({ kind: 'error', error: { status, code }, canResume: true, retryAt: status === 429 ? 31000 : null });
  expect(finalize).toHaveBeenCalledTimes(1); expect((await f.store.read())?.submissionKey).toBe(saved.submissionKey);
});
test('429 카운트다운은 주입한 시각으로 올림하고 0에서 멈춘다', () => {
  // Given / When / Then
  expect([1000, 1001, 30999, 31000, 32000].map((now) => retryAfterRemaining(31000, now))).toEqual([30, 30, 1, 0, 0]);
});
test.each(['validating', 'creatingIntent', 'authorizing', 'uploading', 'verifying', 'finalizing'])('%s 단계 취소는 최종화하지 않는다', async (stage) => {
  // Given
  const f = fixture(); const controller = new AbortController();
  // When
  const result = await runSubmitFlow(f.deps, { kind: 'new', assignmentId, file: selected }, {
    signal: controller.signal, onEvent: (event) => { if (event.state === stage) controller.abort(); },
  });
  // Then
  expect(result.kind).toBe('cancelled'); expect(f.calls).not.toContain('finalize'); expect(await f.store.read()).toBeNull();
});
test('PUT 중 취소해도 검증 뒤 서버 의도를 취소한다', async () => {
  // Given
  const f = fixture(); const controller = new AbortController();
  // When
  const result = await runSubmitFlow({ ...f.deps, upload: async () => { controller.abort(); throw new TypeError('abort'); } },
    { kind: 'new', assignmentId, file: selected }, { signal: controller.signal });
  // Then
  expect(result.kind).toBe('cancelled'); expect(f.calls.indexOf('verify')).toBeLessThan(f.calls.indexOf('cancel'));
});
test('재개 레코드에는 알려진 식별자와 단계만 남긴다', () => {
  // Given / When / Then
  expect(parseResumeRecord({ ...saved, token, uri: 'secret' })).toEqual(saved);
  expect(parseResumeRecord({ ...saved, assignmentId: 'broken' })).toBeNull();
});
test('429 대기 중 새 시도는 서버에 보내지 않고 취소는 허용한다', async () => {
  // Given
  const f = fixture(); await f.store.write({ ...saved, phase: 'finalizing' });
  const finalize = jest.fn(async () => { throw new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 30 }); });
  const run = createSubmitRunner({ ...f.deps, api: { ...f.api, finalize } });
  await run({ kind: 'resume' });
  // When
  const result = await run({ kind: 'resume' });
  // Then
  expect(result).toMatchObject({ kind: 'error', retryAt: 31000 }); expect(finalize).toHaveBeenCalledTimes(1);
  expect((await run({ kind: 'cancel' })).kind).toBe('cancelled');
});
