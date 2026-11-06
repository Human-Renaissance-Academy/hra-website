/**
 * 생성 계약 기반 클라이언트입니다. 인증 실패는 공유 조정기에 맡기고 GET만 한 번 재전송합니다.
 * JS 계층은 변이·전송 실패를 재전송하지 않습니다. 네이티브 연결 복구 재전송은 서버 멱등성에 의존합니다.
 */
import createClient from 'openapi-fetch';
import { getApiBaseUrl } from '../config/env';
import type { paths } from './schema';
import { ApiError, parseApiError } from './errors';
import { createTimedFetch } from './transport';
import type { FetchTransport } from './transport';

export interface SessionAccess {
  getGeneration(): number;
  getAccessToken(): Promise<string | null>;
  refreshAfterUnauthorized(token: string | null): Promise<void>;
}
export type ApiClientOptions = {
  readonly baseUrl?: string;
  readonly session?: SessionAccess;
  readonly fetch?: FetchTransport;
  readonly timeoutMs?: number;
  readonly onRequestId?: (requestId: string) => void;
};

// 기존 append-only 계약의 Origin 필수 표시는 쿠키 전송 전용입니다. Bearer 클라이언트는
// 헤더 요구만 완화하며 요청·응답 DTO와 나머지 생성 계약은 그대로 재사용합니다.
type MobileOperation<T> = T extends { parameters: infer P }
  ? P extends { header: infer H }
    ? H extends { Origin: string }
      ? Omit<T, 'parameters'> & { parameters: Omit<P, 'header'> & { header?: Omit<H, 'Origin'> & { Origin?: string } } }
      : T
    : T
  : T;
type MobilePaths = { [P in keyof paths]: { [M in keyof paths[P]]: MobileOperation<paths[P][M]> } };

export function createApiClient(options: ApiClientOptions = {}) {
   const send = createTimedFetch(options.fetch ?? ((request, init) => fetch(request, init)), options.timeoutMs);
  const client = createClient<MobilePaths>({
    baseUrl: options.baseUrl ?? getApiBaseUrl(),
    fetch: async (request: Request) => {
      const generation = options.session?.getGeneration();
      const token = await options.session?.getAccessToken() ?? null;
      if (options.session && generation !== options.session.getGeneration()) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
      const headers = new Headers(request.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await send(new Request(request, { headers }));
      const id = response.headers.get('X-Request-Id');
      if (id) options.onRequestId?.(id);
      if (options.session && generation !== options.session.getGeneration()) {
        void response.body?.cancel();
        throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
      }
      if (response.status === 401 && options.session) {
        await options.session.refreshAfterUnauthorized(token);
        if (generation !== options.session.getGeneration()) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
        if (request.method === 'GET') {
          const nextToken = await options.session.getAccessToken();
          if (generation !== options.session.getGeneration()) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
          const retryHeaders = new Headers(request.headers);
          if (nextToken) retryHeaders.set('Authorization', `Bearer ${nextToken}`);
          const retry = await send(new Request(request, { headers: retryHeaders }));
          if (generation !== options.session.getGeneration()) {
            void retry.body?.cancel();
            throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
          }
          const retryId = retry.headers.get('X-Request-Id');
          if (retryId) options.onRequestId?.(retryId);
          return retry;
        }
      }
      return response;
    },
  });
  client.use({ async onResponse({ response }) {
    if (!response.ok) throw await parseApiError(response);
    return response;
  } });
  return client;
}
