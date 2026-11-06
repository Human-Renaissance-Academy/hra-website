/** 실제 공급자와 세션 기계를 연결해 계정 경계 캐시 제거와 전경 공유 갱신을 검증합니다. */
import { act, render } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppState, Text } from 'react-native';
import { AuthProvider } from '../src/auth/auth-provider';
import { useAuth } from '../src/auth/use-auth';
import { SessionManager } from '../src/auth/session-manager';
import { createQueryClient } from '../src/query/client';
import { deferred, fakeApi, MemoryStore, tokens } from './auth-fixtures';
import type { SessionTokens } from '../src/auth/types';

function Probe() { const auth = useAuth(); return <Text testID="status">{auth.status}</Text>; }

test('로그아웃은 기존 쿼리 캐시를 제거한다', async () => {
  // Given
  const manager = new SessionManager({ api: fakeApi(), store: new MemoryStore() });
  const client = createQueryClient();
  const view = await render(<QueryClientProvider client={client}><AuthProvider manager={manager}><Probe /></AuthProvider></QueryClientProvider>);
  await act(async () => { await manager.login('fake@example.test', 'fake-password'); });
  client.setQueryData(['private-data'], { value: 'fake' });
  // When
  await act(async () => { await manager.logout(); });
  // Then
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(view.getByTestId('status')).toHaveTextContent('signedOut');
});

test('전경 복귀와 백그라운드 호출은 하나의 갱신을 공유한다', async () => {
  // Given
  const api = fakeApi();
  const manager = new SessionManager({ api, store: new MemoryStore(), now: () => Date.parse('2030-01-01T00:00:00.000Z') });
  const listener = jest.spyOn(AppState, 'addEventListener');
  const client = createQueryClient();
  await render(<QueryClientProvider client={client}><AuthProvider manager={manager}><Probe /></AuthProvider></QueryClientProvider>);
  await act(async () => { await manager.login('fake@example.test', 'fake-password'); });
  const response = deferred<SessionTokens>();
  api.refresh.mockReturnValue(response.promise);
  // When
  await act(async () => {
    const background = manager.refresh();
    listener.mock.calls[0]?.[1]('active');
    response.resolve(tokens);
    await background;
  });
  // Then
  expect(api.refresh).toHaveBeenCalledTimes(1);
  listener.mockRestore();
});
