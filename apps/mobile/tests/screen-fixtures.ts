/** 화면 테스트의 인증 컨텍스트 값입니다. 네트워크나 보안 저장소를 시작하지 않습니다. */
import type { AuthContextValue } from '../src/auth/auth-context';
export function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return { status: 'signedOut', user: null, role: null, isPending: false, error: null,
    login: jest.fn(async () => undefined), logout: jest.fn(async () => undefined), logoutAll: jest.fn(async () => undefined), retry: jest.fn(async () => undefined), ...overrides };
}
