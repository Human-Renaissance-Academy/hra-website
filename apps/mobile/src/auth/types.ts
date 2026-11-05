/** 세션 공개 타입입니다. 접근 토큰은 저장 DTO와 분리하고 사용자 스냅샷은 최소 필드만 유지합니다. */
import type { components } from '../api/schema';
import type { ApiError } from '../api/errors';

export type SessionTokens = Readonly<components['schemas']['MobileSession']>;
export type DeviceInfo = Readonly<components['schemas']['MobileDevice']>;
export type SessionUser = Readonly<Pick<components['schemas']['MeUser'], 'id' | 'name' | 'role'>>;
export type StoredSession = {
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly user: SessionUser;
};
export type SessionState =
  | { readonly status: 'loading'; readonly user: null; readonly error: ApiError | null }
  | { readonly status: 'signedOut'; readonly user: null; readonly error: ApiError | null }
  | { readonly status: 'signedIn'; readonly user: SessionUser; readonly error: ApiError | null };

export interface TokenStore {
  read(): Promise<StoredSession | null>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}
export interface AuthApi {
  login(input: { readonly email: string; readonly password: string; readonly device?: DeviceInfo }): Promise<{ readonly session: SessionTokens; readonly user: SessionUser }>;
  refresh(refreshToken: string): Promise<SessionTokens>;
  logout(refreshToken: string): Promise<void>;
  logoutAll(accessToken: string): Promise<void>;
}
