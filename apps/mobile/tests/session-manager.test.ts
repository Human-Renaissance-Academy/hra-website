/** 세션 보안 회귀입니다. 모든 시각·응답·저장소를 주입하여 경합과 회전 순서를 결정적으로 검증합니다. */
import { SessionManager } from '../src/auth/session-manager';
import { ApiError } from '../src/api/errors';
import { deferred, fakeApi, MemoryStore, tokens, user } from './auth-fixtures';
import type { SessionTokens } from '../src/auth/types';

const now = Date.parse('2030-01-01T00:00:00.000Z');
function fixture() {
  const api = fakeApi();
  const store = new MemoryStore();
  const manager = new SessionManager({ api, store, now: () => now });
  return { api, store, manager };
}

test('동시 갱신 12개가 하나의 요청을 공유한다', async () => {
  // Given
  const { api, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  const response = deferred<SessionTokens>();
  api.refresh.mockReturnValue(response.promise);
  // When
  const calls = Array.from({ length: 12 }, () => manager.refresh());
  response.resolve({ ...tokens, accessToken: 'rotated-access' });
  await Promise.all(calls);
  // Then
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(await manager.getAccessToken()).toBe('rotated-access');
});

test('이전 세대의 늦은 401은 새 로그인 토큰을 지우지 않는다', async () => {
  // Given
  const { api, store, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  const response = deferred<SessionTokens>();
  api.refresh.mockReturnValue(response.promise);
  const old = manager.refresh().catch((error: unknown) => error);
  await manager.login('new@example.test', 'fake-password');
  // When
  response.reject(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));
  await old;
  // Then
  expect(manager.getSnapshot().status).toBe('signedIn');
  expect(store.value?.refreshToken).toBe(tokens.refreshToken);
});

test('애매한 타임아웃은 로그인 상태를 유지하고 자동 갱신을 막는다', async () => {
  // Given
  const { api, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  api.refresh.mockRejectedValue(new ApiError({ status: 0, code: 'TIMEOUT' }));
  // When
  await expect(manager.refresh()).rejects.toMatchObject({ code: 'TIMEOUT' });
  await expect(manager.getAccessToken()).rejects.toMatchObject({ code: 'TIMEOUT' });
  // Then
  expect(manager.getSnapshot()).toMatchObject({ status: 'signedIn', error: { code: 'TIMEOUT' } });
  expect(api.refresh).toHaveBeenCalledTimes(1);
});

test('429 대기시간 전에는 새 갱신을 보내지 않는다', async () => {
  // Given
  const { api, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  api.refresh.mockRejectedValue(new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 90 }));
  // When
  await expect(manager.refresh()).rejects.toMatchObject({ status: 429 });
  await expect(manager.check()).rejects.toMatchObject({ retryAfterSeconds: 90 });
  // Then
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(manager.getSnapshot().status).toBe('signedIn');
});

test('회전 토큰 저장이 끝나기 전 새 토큰을 발행하지 않는다', async () => {
  // Given
  const { api, store, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  const saved = deferred<void>();
  const started = deferred<void>();
  store.write = async (value) => { started.resolve(); await saved.promise; store.value = value; };
  api.refresh.mockResolvedValue({ ...tokens, accessToken: 'new-access', refreshToken: 'new-refresh' });
  const published: string[] = [];
  manager.subscribe(() => { published.push(store.value?.refreshToken ?? 'empty'); });
  // When
  const call = manager.refresh();
  await started.promise;
  expect(published).toEqual([]);
  saved.resolve();
  await call;
  // Then
  expect(published).toEqual(['new-refresh']);
  expect(await manager.getAccessToken()).toBe('new-access');
});

test('로그아웃은 서버 실패에도 로컬 상태와 저장소를 제거한다', async () => {
  // Given
  const { api, store, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  api.logout.mockRejectedValue(new ApiError({ status: 0, code: 'NETWORK' }));
  // When
  await manager.logout();
  // Then
  expect(manager.getSnapshot().status).toBe('signedOut');
  expect(store.value).toBeNull();
});

test('손상된 저장소 복원은 로그아웃으로 완료한다', async () => {
  // Given
  const { manager, api } = fixture();
  // When
  await manager.restore();
  // Then
  expect(manager.getSnapshot().status).toBe('signedOut');
  expect(api.refresh).not.toHaveBeenCalled();
});

test('복원과 전경 확인은 동일한 갱신을 공유한다', async () => {
  // Given
  const { manager, api, store } = fixture();
  store.value = { refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt, user };
  const response = deferred<SessionTokens>();
  const started = deferred<void>();
  api.refresh.mockImplementation(() => { started.resolve(); return response.promise; });
  // When
  const restore = manager.restore();
  await started.promise;
  const check = manager.check();
  response.resolve(tokens);
  await Promise.all([restore, check]);
  // Then
  expect(api.refresh).toHaveBeenCalledTimes(1);
});

test('현재 세대의 갱신 401은 세션을 지운다', async () => {
  // Given
  const { api, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  api.refresh.mockRejectedValue(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));
  // When
  await expect(manager.refresh()).rejects.toMatchObject({ status: 401 });
  // Then
  expect(manager.getSnapshot().status).toBe('signedOut');
});

test('전체 로그아웃 서버 실패에도 이 기기의 세션과 저장소를 지우고 오류를 알린다', async () => {
  // Given
  const { api, store, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  api.logoutAll.mockRejectedValue(new ApiError({ status: 503, code: 'UNAVAILABLE' }));
  // When
  await expect(manager.logoutAll()).rejects.toMatchObject({ status: 503 });
  // Then
  expect(manager.getSnapshot().status).toBe('signedOut');
  expect(store.value).toBeNull();
});

test('저장소가 Error가 아닌 값으로 거절해도 뒤따르는 로그아웃의 저장 삭제는 건너뛰지 않는다', async () => {
  // Given: 로그인된 세션과, 회전 토큰 저장이 Error가 아닌 값으로 한 번 거절되는 저장소
  const { api, store, manager } = fixture();
  await manager.login('fake@example.test', 'fake-password');
  const nativeFailure: unknown = { code: 'NATIVE_STORE_FAILURE' };
  store.write = () => Promise.reject(nativeFailure);
  api.refresh.mockResolvedValue({ ...tokens, accessToken: 'new-access', refreshToken: 'new-refresh' });
  await expect(manager.refresh()).rejects.toBe(nativeFailure);
  // When: 이어서 로그아웃한다.
  await manager.logout();
  // Then: 저장 큐가 앞선 거절 때문에 끊기지 않아 저장된 갱신 토큰이 실제로 삭제된다.
  expect(store.value).toBeNull();
  expect(manager.getSnapshot()).toMatchObject({ status: 'signedOut', error: null });
});
