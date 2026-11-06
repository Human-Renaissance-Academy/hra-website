/** 앱 수명 동안 공유하는 인증 런타임입니다. 주소 해석과 네이티브 저장소 생성은 첫 사용까지 미룹니다. */
import { createApiClient } from '../api/client';
import { createAuthApi } from './auth-api';
import { SessionManager } from './session-manager';
import { createTokenStore } from './token-store';

let manager: SessionManager | undefined;
let client: ReturnType<typeof createApiClient> | undefined;
export function getSessionManager(): SessionManager {
  manager ??= new SessionManager({ api: createAuthApi(), store: createTokenStore() });
  return manager;
}
export function getApiClient(): ReturnType<typeof createApiClient> {
  client ??= createApiClient({ session: getSessionManager() });
  return client;
}
