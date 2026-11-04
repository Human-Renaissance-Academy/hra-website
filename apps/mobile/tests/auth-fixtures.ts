/** 실제 자격 증명 없이 세션 경합을 제어하는 메모리 저장소와 지연 응답 도구입니다. */
import type { AuthApi, SessionTokens, SessionUser, StoredSession, TokenStore } from '../src/auth/types';

export const user: SessionUser = { id: 'fake-user', name: '테스트 회원', role: 'MEMBER' };
export const tokens: SessionTokens = { tokenType: 'Bearer', accessToken: 'fake-access', accessTokenExpiresAt: '2030-01-01T00:15:00.000Z', refreshToken: 'fake-refresh', refreshTokenExpiresAt: '2030-02-01T00:00:00.000Z' };
export class MemoryStore implements TokenStore {
  value: StoredSession | null = null;
  async read() { return this.value; }
  async write(value: StoredSession) { this.value = value; }
  async clear() { this.value = null; }
}
export function fakeApi(): jest.Mocked<AuthApi> {
  return {
    login: jest.fn<ReturnType<AuthApi['login']>, Parameters<AuthApi['login']>>(async () => ({ session: tokens, user })),
    refresh: jest.fn<ReturnType<AuthApi['refresh']>, Parameters<AuthApi['refresh']>>(async () => tokens),
    logout: jest.fn<ReturnType<AuthApi['logout']>, Parameters<AuthApi['logout']>>(async () => undefined),
    logoutAll: jest.fn<ReturnType<AuthApi['logoutAll']>, Parameters<AuthApi['logoutAll']>>(async () => undefined),
  };
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new TypeError('not initialized'); };
  let reject: (error: unknown) => void = () => { throw new TypeError('not initialized'); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
