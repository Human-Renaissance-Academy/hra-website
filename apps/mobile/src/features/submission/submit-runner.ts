/**
 * 화면 수명 동안 제출을 직렬화하고 429 대기시간을 지키는 순수 실행기입니다.
 * 중복 탭은 새 승인 의도를 만들지 않으며 실패한 작업을 자동으로 재전송하지 않습니다.
 */
import { ApiError } from '../../api/errors';
import { retryAfterRemaining, runSubmitFlow } from './submit-flow';
import type { SubmitCommand, SubmitDependencies, SubmitEvent, SubmitResult } from './types';

export function createSubmitRunner(deps: SubmitDependencies) {
  let busy = false;
  let retryAt = 0;
  return async (command: SubmitCommand, controls: { readonly signal?: AbortSignal; readonly onEvent?: (event: SubmitEvent) => void } = {}): Promise<SubmitResult> => {
    if (busy) return { kind: 'error', error: new ApiError({ status: 409, code: 'CONFLICT' }), retryAt: null, canResume: true };
    if (command.kind !== 'cancel' && retryAt > deps.now()) return { kind: 'error',
      error: new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: retryAfterRemaining(retryAt, deps.now()) }), retryAt, canResume: true };
    busy = true;
    try {
      const result = await runSubmitFlow(deps, command, controls);
      switch (result.kind) {
        case 'success': case 'cancelled': retryAt = 0; break;
        case 'error': retryAt = result.retryAt ?? 0; break;
        default: { const exhaustive: never = result; return exhaustive; }
      }
      return result;
    } finally { busy = false; }
  };
}
