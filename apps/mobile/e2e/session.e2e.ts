/** 실제 인증 API의 회전·복원·세대 보호와 HTTP 재시도 정책을 관측한다. */
import { SessionManager } from '../src/auth/session-manager';
import { baseUrl, expireAccess, live, member, password, runtime, sql } from './support';

live('실제 모바일 세션', () => {
  beforeEach(async () => { await sql('TRUNCATE rate_limit_events'); });
  it('MOBILE_CLIENT_SESSION_RESTORE_SINGLE_FLIGHT', async () => {
    // Given: 실제 로그인으로 얻은 refresh만 메모리 저장소에 남긴다.
    const r = runtime(); await r.session.login(member, password);
    const saved = await r.store.read();
    const restored = new SessionManager({ api: r.api, store: r.store });
    // When: 복원과 동시 갱신을 실제 서버로 보낸다.
    await restored.restore();
    const first = await restored.getAccessToken();
    await Promise.all(Array.from({ length: 10 }, () => restored.refresh()));
    // Then: 복원/동시 호출 각 한 번만 회전하며 새 토큰을 저장한다.
    expect(restored.getSnapshot().status).toBe('signedIn');
    expect((await r.store.read())?.refreshToken === saved?.refreshToken).toBe(false);
    expect((await restored.getAccessToken()) === first).toBe(false);
    expect(r.counts.get('POST /api/v1/auth/refresh')).toBe(2);
    await restored.logout(); expect(await r.store.read()).toBeNull();
    expect(restored.getSnapshot().status).toBe('signedOut');
  });
  it('MOBILE_CLIENT_GENERATION_GUARD', async () => {
    // Given: 실제 refresh가 완료됐지만 전달만 barrier에서 보류한다.
    const r = runtime();
    let release: () => void = () => { throw new Error('MOBILE_BARRIER'); };
    let started: () => void = () => { throw new Error('MOBILE_BARRIER'); };
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const arrived = new Promise<void>(resolve => { started = resolve; });
    const session = new SessionManager({ store: r.store, api: { ...r.api, refresh: async token => {
      const result = await r.api.refresh(token); started(); await barrier; return result;
    } } });
    await session.login(member, password);
    const pending = session.refresh(); await arrived;
    // When: 새 로그인 후 구 세대 성공을 전달한다.
    await session.login(member, password); const current = await session.getAccessToken();
    release(); await pending;
    // Then: 구 세대 성공은 새 로그인을 덮어쓰지 못한다.
    expect((await session.getAccessToken()) === current).toBe(true);
    expect(session.getSnapshot().status).toBe('signedIn');
    await session.logout();
  });
  it('MOBILE_CLIENT_LOGOUT_ALL', async () => {
    // Given: 같은 계정에 두 실제 모바일 세션이 있다.
    const a = runtime(), b = runtime();
    await a.session.login(member, password); await b.session.login(member, password);
    const token = await b.session.getAccessToken();
    // When: 실제 logout-all을 실행한다.
    await a.session.logoutAll();
    // Then: 로컬 저장과 다른 모바일 세션 모두 철회된다.
    expect(await a.store.read()).toBeNull();
    const response = await fetch(`${baseUrl}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
    expect(response.status).toBe(401); await response.body?.cancel();
  });
  it('MOBILE_CLIENT_GET_COORDINATED_REFRESH', async () => {
    // Given: 실제 로그인 후 DB에서 access만 만료시킨다.
    const r = runtime(); await r.session.login(member, password);
    await expireAccess(await r.session.getAccessToken());
    // When: 보호 GET 두 건과 공개 GET을 함께 실행한다.
    const [me, assignments, notices] = await Promise.all([r.client.GET('/api/v1/me'), r.client.GET('/api/v1/assignments'), r.client.GET('/api/v1/notices')]);
    // Then: 실제 회전 한 번과 각 보호 GET 재시도 한 번으로 복구한다.
    expect(me.data?.user.role).toBe('MEMBER');
    expect(assignments.data?.assignments.length).toBeGreaterThan(0);
    expect(notices.data?.notices.length).toBeGreaterThan(0);
    expect(r.counts.get('POST /api/v1/auth/refresh')).toBe(1);
    expect(r.counts.get('GET /api/v1/me')).toBe(2);
    expect(r.counts.get('GET /api/v1/assignments')).toBe(2);
    await r.session.logout();
  });
  it('MOBILE_CLIENT_MUTATION_NOT_RETRIED', async () => {
    // Given: access가 서버에서 만료된 실제 세션이다.
    const r = runtime(); await r.session.login(member, password);
    await expireAccess(await r.session.getAccessToken());
    // When: 보호 변경 요청을 보낸다.
    await expect(r.client.POST('/api/v1/submissions', { body: { assignmentId: '70000000-0000-4000-8000-000000000001',
      uploadIntentId: '70000000-0000-4000-8000-000000000003', submissionKey: '70000000-0000-4000-8000-000000000004' } })).rejects.toMatchObject({ status: 401 });
    // Then: 인증은 회전해도 변경 요청은 단 한 번이다.
    expect(r.counts.get('POST /api/v1/submissions')).toBe(1);
    expect(r.counts.get('POST /api/v1/auth/refresh')).toBe(1);
    await r.session.logout();
  });
});
