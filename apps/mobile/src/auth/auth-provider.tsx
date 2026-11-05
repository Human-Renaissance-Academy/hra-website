/**
 * React와 세션 기계를 연결합니다. 전경 복귀는 공유 check만 호출하고 계정 경계에서 쿼리를 취소/제거합니다.
 * 네트워크 감지용 네이티브 의존성을 추가하지 않고 AppState로 Query 전경 상태를 연결합니다.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';
import { AuthContext } from './auth-context';
import { getSessionManager } from './runtime';
import type { SessionManager } from './session-manager';
import type { DeviceInfo } from './types';

export function AuthProvider({ children, manager = getSessionManager() }: { readonly children: ReactNode; readonly manager?: SessionManager }) {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const queryClient = useQueryClient();
  useEffect(() => {
    let generation = manager.getGeneration();
    const unsubscribe = manager.subscribe(() => {
      const next = manager.getGeneration();
      if (next !== generation || manager.getSnapshot().status === 'signedOut') {
        generation = next;
        void queryClient.cancelQueries();
        queryClient.clear();
      }
    });
    const settle = (error: unknown) => { if (!(error instanceof ApiError)) throw error; };
    void manager.restore().catch(settle);
    const listener = AppState.addEventListener('change', (value) => {
      focusManager.setFocused(value === 'active');
      if (value === 'active') void manager.check().catch(settle);
    });
    return () => { unsubscribe(); listener.remove(); };
  }, [manager, queryClient]);
  const value = useMemo(() => ({
    ...state, role: state.user?.role ?? null, isPending: state.user?.role === 'PENDING',
    login: (email: string, password: string, device?: DeviceInfo) => manager.login(email, password, device),
    logout: () => manager.logout(), logoutAll: () => manager.logoutAll(), retry: () => manager.check(),
  }), [manager, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
