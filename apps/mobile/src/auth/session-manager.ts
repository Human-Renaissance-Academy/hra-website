/**
 * React와 무관한 세션 상태 기계입니다. 시작·401·복귀·백그라운드가 같은 갱신 Promise를 공유합니다.
 * 세대 검사는 늦은 응답의 세션 훼손을 막고 저장 큐는 로그아웃/새 로그인과 회전 저장을 직렬화합니다.
 */
import { ApiError } from '../api/errors';
import type { SessionAccess } from '../api/client';
import type { AuthApi, DeviceInfo, SessionState, SessionTokens, SessionUser, StoredSession, TokenStore } from './types';

type Dependencies = { readonly api: AuthApi; readonly store: TokenStore; readonly now?: () => number };

export class SessionManager implements SessionAccess {
  private state: SessionState = { status: 'loading', user: null, error: null };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private stored: StoredSession | null = null;
  private tokens: SessionTokens | null = null;
  private flight: { readonly generation: number; readonly promise: Promise<void> } | null = null;
  private restoration: Promise<void> | null = null;
  private persistence: Promise<void> = Promise.resolve();
  private retryAt = 0;
  private readonly now: () => number;
  constructor(private readonly dependencies: Dependencies) { this.now = dependencies.now ?? Date.now; }

  getSnapshot = (): SessionState => this.state;
  getGeneration = (): number => this.generation;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private persist(generation: number, task: () => Promise<void>): Promise<void> {
    const operation = this.persistence.then(async () => { if (generation === this.generation) await task(); });
    // 실패는 호출자에게 돌려주고, 큐에서는 거절 값의 종류와 무관하게 삼켜 뒤따르는 저장 작업(특히 로그아웃의 삭제)이 항상 실행되게 합니다.
    this.persistence = operation.then(() => undefined, () => undefined);
    return operation;
  }
  private async accept(tokens: SessionTokens, user: SessionUser, generation: number) {
    if (generation !== this.generation) return;
    const snapshot: StoredSession = { refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt, user };
    this.stored = snapshot;
    await this.persist(generation, () => this.dependencies.store.write(snapshot));
    if (generation !== this.generation) return;
    this.stored = snapshot;
    this.tokens = tokens;
    this.retryAt = 0;
    this.publish({ status: 'signedIn', user, error: null });
  }
  private async clear(generation: number, error: ApiError | null = null) {
    if (generation !== this.generation) return;
    const next = ++this.generation;
    this.tokens = null;
    this.stored = null;
    this.retryAt = 0;
    this.publish({ status: 'signedOut', user: null, error });
    try { await this.persist(next, () => this.dependencies.store.clear()); }
    catch (failure) {
      if (!(failure instanceof ApiError)) throw failure;
      if (next === this.generation) this.publish({ status: 'signedOut', user: null, error: failure });
    }
  }

  restore(): Promise<void> {
    if (this.restoration) return this.restoration;
    const generation = this.generation;
    this.restoration = (async () => {
      try {
        const saved = await this.dependencies.store.read();
        if (generation !== this.generation) return;
        if (!saved || Date.parse(saved.refreshTokenExpiresAt) <= this.now()) { await this.clear(generation); return; }
        this.stored = saved;
        // 복원 중에는 보호 화면을 열지 않고 갱신 결과 또는 오프라인 상태가 확정될 때까지 기다립니다.
        await this.refresh();
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (generation === this.generation && !this.stored) await this.clear(generation, error);
      }
    })();
    return this.restoration;
  }

  async login(email: string, password: string, device?: DeviceInfo): Promise<void> {
    const generation = ++this.generation;
    this.tokens = null;
    this.stored = null;
    this.publish({ status: 'signedOut', user: null, error: null });
    await this.persist(generation, () => this.dependencies.store.clear());
    try {
      const result = await this.dependencies.api.login({ email, password, ...(device ? { device } : {}) });
      await this.accept(result.session, result.user, generation);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (generation === this.generation) this.publish({ status: 'signedOut', user: null, error });
      throw error;
    }
  }

  // 명시적 재확인만 애매한 통신 실패 후 다음 시도를 시작합니다.
  refresh(): Promise<void> {
    const generation = this.generation;
    if (this.flight?.generation === generation) return this.flight.promise;
    if (!this.stored) return Promise.reject(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));
    if (this.now() < this.retryAt) return Promise.reject(new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: Math.ceil((this.retryAt - this.now()) / 1000) }));
    const saved = this.stored;
    const promise = (async () => {
      try {
        const tokens = await this.dependencies.api.refresh(saved.refreshToken);
        await this.accept(tokens, saved.user, generation);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (generation === this.generation) {
          if (error.status === 401) await this.clear(generation, error);
          else {
            if (error.status === 429) this.retryAt = this.now() + (error.retryAfterSeconds ?? 60) * 1000;
            this.publish({ status: 'signedIn', user: saved.user, error });
          }
        }
        throw error;
      } finally {
        if (this.flight?.generation === generation) this.flight = null;
      }
    })();
    this.flight = { generation, promise };
    return promise;
  }

  async check(): Promise<void> {
    if (!this.stored) return;
    if (!this.tokens || this.state.error || Date.parse(this.tokens.accessTokenExpiresAt) - this.now() <= 60_000) await this.refresh();
  }
  async getAccessToken(): Promise<string | null> {
    if (!this.stored) return null;
    // 자동 호출은 이전의 애매한 실패를 재시도하지 않습니다. 화면의 재시도/복귀 check가 필요합니다.
    if (this.state.error) throw this.state.error;
    await this.check();
    return this.tokens?.accessToken ?? null;
  }
  async refreshAfterUnauthorized(token: string | null): Promise<void> {
    if (!this.stored) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
    if (this.state.error) throw this.state.error;
    // 이미 다른 요청이 토큰을 교체했다면 늦게 도착한 401은 다시 회전시키지 않습니다.
    if (this.tokens?.accessToken !== token) return;
    await this.refresh();
  }
  async logout(): Promise<void> {
    const saved = this.stored;
    const clearing = this.clear(this.generation);
    try { if (saved) await this.dependencies.api.logout(saved.refreshToken); }
    catch (error) { if (!(error instanceof ApiError)) throw error; }
    finally { await clearing; }
  }
  // 전체 로그아웃도 logout과 같이 서버 결과와 관계없이 이 기기의 자격 증명을 반드시 지웁니다.
  // 서버 회수가 실패하면 다른 기기 세션은 남아 있을 수 있으므로 로컬 정리 뒤 원래 오류를 다시 던집니다.
  async logoutAll(): Promise<void> {
    const generation = this.generation;
    try {
      const token = await this.getAccessToken();
      if (!token) throw new ApiError({ status: 401, code: 'UNAUTHENTICATED' });
      await this.dependencies.api.logoutAll(token);
    } finally {
      await this.clear(generation);
    }
  }
}
