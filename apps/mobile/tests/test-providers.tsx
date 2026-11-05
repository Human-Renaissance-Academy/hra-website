/** 화면 테스트에 인증·쿼리 공급자를 주입하고 observer 해제 후 캐시를 정리합니다. */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AuthContext } from '../src/auth/auth-context';
import type { AuthContextValue } from '../src/auth/auth-context';
import { authValue } from './screen-fixtures';

type TestProviderOptions = {
  readonly auth?: Partial<AuthContextValue> | undefined;
  readonly queryClient?: QueryClient | undefined;
};

// 테스트가 명시적으로 정리하지 않은 렌더도 예외 없이 회수할 수 있도록 정리 함수를 보관합니다.
const activeCleanups = new Set<() => Promise<void>>();

afterEach(async () => {
  for (const dispose of activeCleanups) await dispose();
});

export async function renderWithProviders(ui: ReactElement, options: TestProviderOptions = {}) {
  const queryClient = options.queryClient ?? new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: 0, staleTime: 0 },
    mutations: { retry: false },
  } });
  const auth = authValue(options.auth);
  const view = await render(ui, { wrapper: ({ children }) => (
    <AuthContext.Provider value={auth}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </AuthContext.Provider>
  ) });

  const dispose = async () => {
    try {
      // clear를 먼저 호출하면 뒤늦은 observer 해제가 GC 타이머를 다시 만들 수 있습니다.
      await view.unmount();
    } finally {
      queryClient.clear();
      activeCleanups.delete(dispose);
    }
  };
  activeCleanups.add(dispose);
  return { ...view, queryClient, cleanup: dispose };
}
