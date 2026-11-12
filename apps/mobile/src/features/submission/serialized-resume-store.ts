/** 세대별 재개 저장소입니다. 삭제는 진행 중 쓰기 뒤에 실행하고 이전 핸들의 후속 쓰기를 차단합니다. */
import { ApiError } from '../../api/errors';
import type { ResumeStore } from './resume-store';

export function createSerializedResumeStore(deps: {
  readonly store: ResumeStore;
  readonly isCurrent: () => boolean;
  readonly ready: () => Promise<void>;
}) {
  let pending = Promise.resolve();
  let revision = 0;
  let valid = true;
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const operation = pending.then(task);
    pending = operation.then(() => undefined, () => undefined);
    return operation;
  };
  const assertCurrent = () => {
    if (!valid || !deps.isCurrent()) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
  };
  return {
    read() {
      if (!valid || !deps.isCurrent()) return Promise.reject(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));
      const gate = deps.ready();
      return enqueue(async () => { await gate; assertCurrent(); return deps.store.read(); });
    },
    write(record: Parameters<ResumeStore['write']>[0]) {
      if (!valid || !deps.isCurrent()) return Promise.reject(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));
      const version = revision;
      const gate = deps.ready();
      return enqueue(async () => {
        await gate;
        assertCurrent();
        if (version !== revision) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
        await deps.store.write(record);
        if (!valid || !deps.isCurrent() || version !== revision) {
          await deps.store.clear();
          throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
        }
      });
    },
    clear() { revision++; return enqueue(async () => { if (valid && deps.isCurrent()) await deps.store.clear(); }); },
    purge() { revision++; return enqueue(() => deps.store.clear()); },
    invalidate() { valid = false; revision++; },
    settled: () => pending,
  };
}
