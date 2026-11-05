/**
 * 갱신 토큰 전용 보안 저장 어댑터입니다. Android는 SecureStore의 Keystore 암호화를 사용합니다.
 * keychainAccessible은 iOS 전용이며 생체 인증은 어느 플랫폼에서도 요구하지 않습니다.
 * 읽기 손상은 빈 세션으로, 네이티브 저장 실패는 안전한 정형 오류로 처리합니다.
 */
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '../api/errors';
import type { StoredSession, TokenStore } from './types';

type SecureStorage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;
const KEY = 'hra.mobile.session.v1';
const OPTIONS = { keychainService: 'hra.mobile.session', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false } as const;

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null || !('refreshToken' in value) || !('refreshTokenExpiresAt' in value) || !('user' in value)) return false;
  const user = value.user;
  return typeof value.refreshToken === 'string' && value.refreshToken.length > 0
    && typeof value.refreshTokenExpiresAt === 'string' && Number.isFinite(Date.parse(value.refreshTokenExpiresAt))
    && typeof user === 'object' && user !== null && 'id' in user && typeof user.id === 'string'
    && 'name' in user && (typeof user.name === 'string' || user.name === null)
    && 'role' in user && typeof user.role === 'string' && ['ADMIN', 'FACULTY', 'MEMBER', 'PENDING'].includes(user.role);
}

export function createTokenStore(storage: SecureStorage = SecureStore): TokenStore {
  return {
    async read() {
      try {
        const text = await storage.getItemAsync(KEY, OPTIONS);
        if (!text) return null;
        const value: unknown = JSON.parse(text);
        if (!isStoredSession(value)) return null;
        return { refreshToken: value.refreshToken, refreshTokenExpiresAt: value.refreshTokenExpiresAt,
          user: { id: value.user.id, name: value.user.name, role: value.user.role } };
      } catch {
        // 저장소는 외부 네이티브 경계입니다. 비밀정보가 담길 수 있는 원본 오류를 보존하지 않고,
        // 읽기 실패·손상은 모두 같은 "저장된 세션 없음"으로 취급합니다(오류 종류별 분기 없음).
        return null;
      }
    },
    async write(value) {
      const snapshot: StoredSession = { refreshToken: value.refreshToken, refreshTokenExpiresAt: value.refreshTokenExpiresAt,
        user: { id: value.user.id, name: value.user.name, role: value.user.role } };
      try { await storage.setItemAsync(KEY, JSON.stringify(snapshot), OPTIONS); }
      catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
      }
    },
    async clear() {
      try { await storage.deleteItemAsync(KEY, OPTIONS); }
      catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
      }
    },
  };
}
