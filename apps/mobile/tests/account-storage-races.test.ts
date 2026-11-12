/** 실제 저장 큐·정리 바인딩을 결합하여 세대 전환과 지연 쓰기의 경합을 검증합니다. */
import { createSerializedResumeStore } from '../src/features/submission/serialized-resume-store';
import { createSecureResumeStore } from '../src/features/submission/secure-resume-store';
import { bindProtectedSessionCleanup } from '../src/features/files/session-cleanup';
import { createProtectedCache } from '../src/features/files/protected-cache';
import { deferred } from './auth-fixtures';
import { saved } from './submission-fixtures';
import { memoryFiles } from './file-fixtures';

test('지연 쓰기 중 clear는 쓰기가 끝날 때까지 기다리고 대기 중 후속 쓰기를 무효화한다', async () => {
  // Given
  const started = deferred<void>();
  const release = deferred<void>();
  const values = new Map<string, string>();
  const raw = createSecureResumeStore('a', {
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { started.resolve(); await release.promise; values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  });
  const store = createSerializedResumeStore({ store: raw, isCurrent: () => true, ready: async () => undefined });
  const first = store.write(saved).catch((error: unknown) => error);
  await started.promise;
  const second = store.write(saved).catch((error: unknown) => error);
  // When
  const clearing = store.clear();
  release.resolve();
  await clearing;
  // Then
  await expect(first).resolves.toMatchObject({ status: 401 });
  await expect(second).resolves.toMatchObject({ status: 401 });
  expect(values.size).toBe(0);
});

test('즉시 A에서 B로 전환하면 A만 지우고 B의 쓰기는 이전 정리 뒤에 실행한다', async () => {
  // Given
  let generation = 1;
  let listener = () => {};
  const events: string[] = [];
  const release = deferred<void>();
  const old = createSerializedResumeStore({ store: {
    read: async () => saved, write: async () => undefined,
    clear: async () => { events.push('clear-a'); await release.promise; },
  }, isCurrent: () => generation === 1, ready: async () => undefined });
  const binding = bindProtectedSessionCleanup({
    session: { getGeneration: () => generation, subscribe: (next) => { listener = next; return () => {}; } },
    clearProtectedCache: async () => { events.push('cache'); }, clearResume: async () => undefined,
    captureCleanup: () => { old.invalidate(); return () => old.purge(); }, onError: jest.fn(),
  });
  // When
  generation = 2; listener();
  const current = createSerializedResumeStore({ store: { read: async () => null,
    write: async () => { events.push('write-b'); }, clear: async () => { events.push('clear-b'); } },
  isCurrent: () => generation === 2, ready: binding.ready });
  const writing = current.write(saved);
  await Promise.resolve();
  expect(events).not.toContain('write-b');
  release.resolve();
  await writing;
  // Then
  expect(events).toEqual(['cache', 'clear-a', 'write-b']);
  await expect(old.write(saved)).rejects.toMatchObject({ status: 401 });
  await binding.dispose();
});

test('삭제 실패는 보고하고 새 보호 작업의 ready 게이트를 닫는다', async () => {
  // Given
  let generation = 1; let listener = () => {};
  const onError = jest.fn();
  const binding = bindProtectedSessionCleanup({
    session: { getGeneration: () => generation, subscribe: (next) => { listener = next; return () => {}; } },
    clearProtectedCache: async () => { throw new TypeError('disk'); }, clearResume: async () => undefined, onError,
  });
  // When
  generation++; listener(); await binding.settled();
  // Then
  await expect(binding.ready()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
  await binding.dispose();
});

test('새 런타임 시작은 같은 파일 저장소에 남은 프로세스 종료 사본을 제거한다', async () => {
  // Given
  const { fs, files } = memoryFiles();
  files.set('process-leftover', { bytes: [1, 2], modifiedAt: Date.now() });
  const cache = createProtectedCache(fs);
  // When
  const binding = bindProtectedSessionCleanup({ session: { getGeneration: () => 1, subscribe: () => () => {} },
    startup: cache.clearProtectedCache, clearProtectedCache: cache.clearProtectedCache,
    clearResume: async () => undefined, onError: jest.fn() });
  await binding.ready();
  // Then
  expect(files.size).toBe(0);
  await binding.dispose();
});
