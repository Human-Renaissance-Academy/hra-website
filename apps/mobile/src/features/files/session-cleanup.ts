/**
 * 세션 세대가 바뀌면 진행 중 전송을 중단하고 이전 계정의 보호 파일·재개 기록을 지웁니다.
 * UI/인증 구현은 수정하지 않고 앱 수명 조립 지점에서 연결하는 순수 수명 관리 포트입니다.
 */
import { ApiError } from '../../api/errors';
export interface SessionLifecycle {
  getGeneration(): number;
  subscribe(listener: () => void): () => void;
}
export function bindProtectedSessionCleanup(deps: {
  readonly session: SessionLifecycle; readonly clearProtectedCache: () => Promise<void>;
  readonly clearResume: () => Promise<void>; readonly onError: (error: ApiError) => void;
  readonly captureCleanup?: () => (() => Promise<void>);
  readonly startup?: () => Promise<void>;
}) {
  let generation = deps.session.getGeneration();
  let storageError: ApiError | null = null;
  const reportFailure = () => {
    storageError = new ApiError({ status: 0, code: 'STORAGE_UNAVAILABLE' });
    deps.onError(storageError);
  };
  let pending = deps.startup?.() ?? Promise.resolve();
  pending = pending.catch(reportFailure);
  const active = new Set<AbortController>();
  const draining = new Set<Promise<void>>();
  const unsubscribe = deps.session.subscribe(() => {
    if (generation === deps.session.getGeneration()) return;
    generation = deps.session.getGeneration();
    // 이전 계정과 저장소를 await 이전에 캡처하고 쓰기를 즉시 무효화합니다.
    const cleanup = deps.captureCleanup?.() ?? deps.clearResume;
    const transfers = [...draining];
    for (const controller of active) controller.abort();
    pending = pending.then(async () => {
      await Promise.allSettled(transfers);
      const results = await Promise.allSettled([deps.clearProtectedCache(), cleanup()]);
      if (results.some((result) => result.status === 'rejected')) reportFailure();
      else storageError = null;
    });
  });
  return {
    track(controller: AbortController): () => void {
      active.add(controller);
      let release = () => {};
      const completed = new Promise<void>((resolve) => { release = resolve; });
      draining.add(completed);
      return () => { active.delete(controller); draining.delete(completed); release(); };
    },
    settled: () => pending,
    ready: async () => { await pending; if (storageError) throw storageError; },
    async dispose() {
      unsubscribe();
      for (const controller of active) controller.abort();
      await Promise.allSettled([...draining]);
      await pending;
      active.clear();
    },
  };
}
