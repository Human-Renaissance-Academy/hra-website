/** 세션 경계와 보안 재개 저장소의 정리·오류·최소 JSON 계약을 검증합니다. */
import { bindProtectedSessionCleanup } from '../src/features/files/session-cleanup';
import { createSecureResumeStore } from '../src/features/submission/secure-resume-store';
import { saved, token } from './submission-fixtures';

test('로그아웃 세대 변경은 전송을 중단하고 두 저장소를 정리한다', async () => {
  // Given
  let generation = 1; let listener = () => {};
  const clearProtectedCache = jest.fn(async () => undefined); const clearResume = jest.fn(async () => undefined);
  const binding = bindProtectedSessionCleanup({ session: { getGeneration: () => generation, subscribe: (next) => { listener = next; return () => {}; } },
    clearProtectedCache, clearResume, onError: jest.fn() });
  const controller = new AbortController(); const release = binding.track(controller);
  controller.signal.addEventListener('abort', release);
  // When
  generation++; listener(); await binding.settled();
  // Then
  expect(controller.signal.aborted).toBe(true); expect(clearProtectedCache).toHaveBeenCalledTimes(1); expect(clearResume).toHaveBeenCalledTimes(1);
  binding.dispose();
});
test('한 저장소 정리 실패도 다른 저장소 정리를 막지 않는다', async () => {
  // Given
  let generation = 1; let listener = () => {}; const onError = jest.fn(); const clearResume = jest.fn(async () => undefined);
  const binding = bindProtectedSessionCleanup({ session: { getGeneration: () => generation, subscribe: (next) => { listener = next; return () => {}; } },
    clearProtectedCache: async () => { throw new TypeError(token); }, clearResume, onError });
  // When
  generation++; listener(); await binding.settled();
  // Then
  expect(clearResume).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
  binding.dispose();
});
test('보안 저장소는 최소 JSON을 계정별로 격리한다', async () => {
  // Given
  const values = new Map<string, string>();
  const storage = { getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => { values.set(key, value); }, deleteItemAsync: async (key: string) => { values.delete(key); } };
  const store = createSecureResumeStore('user-a', storage);
  // When
  await store.write(saved);
  // Then
  expect(await store.read()).toEqual(saved); expect(await createSecureResumeStore('user-b', storage).read()).toBeNull();
  expect([...values.values()][0]).not.toContain(token);
});
