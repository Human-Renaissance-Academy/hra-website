/** 계정별 SecureStore 키에 작은 재개 JSON만 보관하는 네이티브 어댑터입니다. */
import * as SecureStore from 'expo-secure-store';
import { ApiError } from '../../api/errors';
import { parseResumeRecord } from './resume-store';
import type { ResumeStore } from './resume-store';
type Storage = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;
const OPTIONS = { keychainService: 'hra.mobile.submission', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY } as const;
export function createSecureResumeStore(userId: string, storage: Storage = SecureStore): ResumeStore {
  if (!/^[\w-]{1,128}$/.test(userId)) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
  const key = `hra.mobile.submission.v1.${userId}`;
  return {
    async read() {
      try {
        const text = await storage.getItemAsync(key, OPTIONS);
        return text ? parseResumeRecord(JSON.parse(text)) : null;
      } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
      }
    },
    async write(record) {
      const clean = parseResumeRecord(record);
      if (!clean) throw new ApiError({ status: 400, code: 'INVALID_INPUT' });
      try { await storage.setItemAsync(key, JSON.stringify(clean), OPTIONS); }
      catch (error) { if (error instanceof ApiError) throw error; throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' }); }
    },
    async clear() {
      try { await storage.deleteItemAsync(key, OPTIONS); }
      catch (error) { if (error instanceof ApiError) throw error; throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' }); }
    },
  };
}
