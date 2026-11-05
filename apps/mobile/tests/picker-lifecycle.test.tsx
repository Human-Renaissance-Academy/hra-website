/** 지연 문서 선택 결과가 화면·계정 수명을 넘으면 삭제되는지 훅의 실제 경계에서 검증합니다. */
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAssignmentSubmissionController } from '../src/features/assignments/use-assignment-submission';
import type { PickedDocumentAssetLike } from '../src/features/assignments/submission-view-model';
import { deferred } from './auth-fixtures';

let mockGeneration = 1;
jest.mock('../src/auth/runtime', () => ({ getSessionManager: () => ({ getGeneration: () => mockGeneration }) }));
jest.mock('../src/features/account/account-runtime', () => ({ getResumeStore: () => ({ read: async () => null }), trackTransfer: () => () => {} }));
jest.mock('../src/features/assignments/submit-runtime', () => ({
  createDefaultAssignmentSubmitRunner: () => async () => ({ kind: 'cancelled' }),
  pickAssignmentPdfFromDevice: jest.fn(), deletePickedCacheFile: jest.fn(),
}));

test.each(['unmount', 'logout', 'switch'] as const)('선택기 대기 중 %s 이후 반환된 캐시 사본은 삭제한다', async (mode) => {
  // Given
  mockGeneration = 1;
  const pending = deferred<readonly PickedDocumentAssetLike[] | null>();
  const cleanup = jest.fn();
  const query = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => <QueryClientProvider client={query}>{children}</QueryClientProvider>;
  const view = await renderHook(({ userId }: { readonly userId: string }) => useAssignmentSubmissionController({
    assignmentId: 'assignment', userId, pickPdf: () => pending.promise, cleanupPickedFile: cleanup,
  }), { wrapper, initialProps: { userId: 'a' } });
  let picking: Promise<void> | undefined;
  await act(async () => { picking = view.result.current.handlePickPdf(); });
  // When
  if (mode === 'unmount') await view.unmount();
  else { mockGeneration++; if (mode === 'switch') await view.rerender({ userId: 'b' }); }
  await act(async () => {
    pending.resolve([{ uri: 'file:///cache/late.pdf', name: 'late.pdf', size: 4, mimeType: 'application/pdf' }]);
    await picking;
  });
  // Then
  expect(cleanup).toHaveBeenCalledWith('file:///cache/late.pdf');
  if (mode !== 'unmount') { expect(view.result.current.selectedFile).toBeNull(); await view.unmount(); }
  query.clear();
});
