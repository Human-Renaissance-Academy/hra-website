/** 루트에서 소유하는 계정 수명입니다. 세대별 저장 핸들과 전송 정리 게이트를 공유합니다. */
import { ApiError } from '../../api/errors';
import { getSessionManager } from '../../auth/runtime';
import { createExpoFileSystemPort } from '../files/expo-file-system-port';
import { createProtectedCache } from '../files/protected-cache';
import { bindProtectedSessionCleanup } from '../files/session-cleanup';
import { createSecureResumeStore } from '../submission/secure-resume-store';
import { createSerializedResumeStore } from '../submission/serialized-resume-store';
import type { ResumeStore } from '../submission/resume-store';
import { sweepSubmissionFiles } from '../files/submission-files';

type ProtectedCache = ReturnType<typeof createProtectedCache>;
type Binding = ReturnType<typeof bindProtectedSessionCleanup>;
let cache: ProtectedCache | undefined;
let binding: Binding | undefined;
const stores = new Map<string, ReturnType<typeof createSerializedResumeStore>>();
let storeGeneration = -1;

export function getProtectedCache(): ProtectedCache {
  cache ??= createProtectedCache(createExpoFileSystemPort());
  return cache;
}

/** 정리 대기 중 세대가 바뀐 호출자는 새 계정의 저장소로 넘어가지 못합니다. */
export async function ready(): Promise<void> {
  const generation = getSessionManager().getGeneration();
  await binding?.ready();
  if (generation !== getSessionManager().getGeneration()) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
}

export function getResumeStore(userId: string): ResumeStore {
  const session = getSessionManager();
  const generation = session.getGeneration();
  if (generation !== storeGeneration) {
    for (const store of stores.values()) store.invalidate();
    stores.clear(); storeGeneration = generation;
  }
  let store = stores.get(userId);
  if (!store) {
    store = createSerializedResumeStore({ store: createSecureResumeStore(userId), ready,
      isCurrent: () => generation === session.getGeneration() });
    stores.set(userId, store);
  }
  return store;
}

export function startAccountLifecycle(onError: (error: ApiError) => void): () => void {
  const session = getSessionManager();
  let departingUserId = session.getSnapshot().user?.id;
  binding ??= bindProtectedSessionCleanup({
    session: {
      getGeneration: session.getGeneration,
      subscribe: (listener) => session.subscribe(() => {
        listener();
        departingUserId = session.getSnapshot().user?.id;
      }),
    },
    startup: async () => { await getProtectedCache().clearProtectedCache(); await sweepSubmissionFiles(); },
    clearProtectedCache: async () => { await getProtectedCache().clearProtectedCache(); await sweepSubmissionFiles(); },
    clearResume: async () => undefined,
    captureCleanup: () => {
      const departing = [...stores.values()];
      const untouched = departingUserId && !stores.has(departingUserId) ? createSecureResumeStore(departingUserId) : null;
      for (const store of departing) store.invalidate();
      stores.clear();
      return async () => {
        const results = await Promise.allSettled([...departing.map((store) => store.purge()), ...(untouched ? [untouched.clear()] : [])]);
        if (results.some((result) => result.status === 'rejected')) throw new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
      };
    },
    onError,
  });
  const current = binding;
  return () => { void current.dispose(); if (binding === current) binding = undefined; };
}

export function trackTransfer(controller: AbortController): () => void {
  return binding ? binding.track(controller) : () => undefined;
}
