/** 공통 공급자의 캐시 격리와 진행 중 쿼리 정리 계약을 검증합니다. */
import { QueryClient, useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { useAuth } from '../src/auth/use-auth';
import { renderWithProviders } from './test-providers';

function AccountProbe() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['provider-account'], queryFn: async () => user?.name });
  return <Text>{query.data}</Text>;
}

test('같은 쿼리 키를 사용하는 별도 렌더는 다른 계정 데이터를 공유하지 않는다', async () => {
  // Given: 동일한 쿼리 키를 사용하는 두 계정입니다.
  const firstUser = { id: 'first', name: '첫 회원', role: 'MEMBER' } as const;
  const secondUser = { id: 'second', name: '둘째 회원', role: 'MEMBER' } as const;
  // When: 각 화면을 별도의 기본 공급자로 렌더링합니다.
  const first = await renderWithProviders(<AccountProbe />, { auth: { user: firstUser } });
  const second = await renderWithProviders(<AccountProbe />, { auth: { user: secondUser } });
  // Then: 캐시가 서로 덮어쓰이지 않고 각 계정 이름을 표시합니다.
  await waitFor(() => {
    expect(first.getByText('첫 회원')).toHaveTextContent('첫 회원');
    expect(second.getByText('둘째 회원')).toHaveTextContent('둘째 회원');
  });
});

test('주입한 클라이언트도 정리 시 진행 중 요청을 취소하고 캐시를 해제한다', async () => {
  // Given: 운영과 같은 GC 정책의 클라이언트와 타이머 없는 대기 요청입니다.
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 300_000, retry: false } } });
  const onAbort = jest.fn();
  function PendingProbe() {
    useQuery({ queryKey: ['provider-pending'], queryFn: ({ signal }) => {
      signal.addEventListener('abort', onAbort, { once: true });
      return new Promise<never>(() => undefined);
    } });
    return <Text>대기 중</Text>;
  }
  const view = await renderWithProviders(<PendingProbe />, { queryClient });
  // When: observer가 모두 해제된 뒤 캐시를 정리합니다.
  await view.cleanup();
  // Then: 진행 중 작업과 소유한 캐시가 남지 않습니다.
  expect(onAbort).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
