/** 인증 컨텍스트 계약입니다. 화면은 토큰 대신 사용자 상태와 명시적 동작만 참조합니다. */
import { createContext } from 'react';
import type { ApiError } from '../api/errors';
import type { DeviceInfo, SessionState, SessionUser } from './types';

export type AuthContextValue = {
  readonly status: SessionState['status'];
  readonly user: SessionUser | null;
  readonly role: SessionUser['role'] | null;
  readonly isPending: boolean;
  readonly error: ApiError | null;
  readonly login: (email: string, password: string, device?: DeviceInfo) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly logoutAll: () => Promise<void>;
  readonly retry: () => Promise<void>;
};
export const AuthContext = createContext<AuthContextValue | null>(null);
