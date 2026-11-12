/** 무인증 인증 API 어댑터입니다. 갱신 요청 자체에는 401 인터셉터나 자동 재시도를 설치하지 않습니다. */
import { createApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { AuthApi } from './types';

export function createAuthApi(client = createApiClient()): AuthApi {
  return {
    async login(body) {
      const { data } = await client.POST('/api/v1/auth/login', { body });
      if (!data) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
      return { session: data.session, user: { id: data.user.id, name: data.user.name, role: data.user.role } };
    },
    async refresh(refreshToken) {
      const { data } = await client.POST('/api/v1/auth/refresh', { body: { refreshToken } });
      if (!data) throw new ApiError({ status: 503, code: 'UNAVAILABLE' });
      return data.session;
    },
    async logout(refreshToken) { await client.POST('/api/v1/auth/logout', { body: { refreshToken } }); },
    async logoutAll(accessToken) { await client.POST('/api/v1/auth/logout-all', { headers: { Authorization: `Bearer ${accessToken}` } }); },
  };
}
