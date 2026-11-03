/** 실제 PostgreSQL 잠금 순서·교착 롤백·계정 대기 만료·전체 회수 스냅샷을 반복 검증합니다. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * 대상 백엔드가 다른 트랜잭션의 잠금을 기다리는 상태를 DB에서 관측할 때까지 기다린다.
 * `minimumMilliseconds`를 주면 현재 문장이 DB 시계(clock_timestamp) 기준으로 그 시간 이상 실행 중일 때만 통과한다.
 * 테스트 프로세스의 벽시계 sleep이 아니라 서버가 보는 대기 시간을 관측하므로 부하에 따라 어긋나지 않는다.
 */
async function waitForBlock(admin, pid, minimumMilliseconds = 0) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const row = (await admin.query(
      `SELECT cardinality(pg_blocking_pids($1::int)) > 0
          AND coalesce((SELECT clock_timestamp() - query_start >= $2::double precision * interval '1 millisecond'
                          FROM pg_stat_activity WHERE pid = $1::int), false) AS blocked`,
      [pid, minimumMilliseconds])).rows[0];
    if (row.blocked) return;
    await delay(5);
  }
  assert.fail("제어된 DB 잠금 대기를 관측하지 못했습니다.");
}

/**
 * 교착 순환을 닫기 전에 회전자가 먼저 대기해 있어야 하는 DB 시간(밀리초).
 *
 * PostgreSQL은 deadlock_timeout(이 클러스터는 기본 1초)이 먼저 만료된 백엔드가 순환을 확인하고 스스로 희생자가 된다.
 * 즉 같은 설정이면 "먼저 기다리기 시작한 쪽"이 희생자다. 두 대기자의 시작이 수 ms 차이뿐이면 CPU 경합 한 번으로
 * 삭제자의 타이머가 먼저 처리되어 희생자가 뒤바뀔 수 있다. 희생자가 삭제자이면 회전 문장은 그대로 성공하고
 * 이 사례가 검증하려는 40P01 경로는 실행되지 않는다. 전체 검증 중 이 사례가 한 번 실패했는데, 실패 원문이 서비스가 감싼
 * 저장소 오류가 아니라 어댑터의 원시 40P01이어서 삭제자 쪽 희생으로 추정한다(같은 조건을 다시 재현하지는 못했다).
 *
 * 그래서 회전자가 이 시간만큼 먼저 기다린 뒤에 삭제자가 순환을 닫게 한다. 순환을 닫을 수 있는 구간은
 * [이 값, 1000ms) 이며, 500ms는 "삭제자 타이머가 먼저 처리될 여유(스케줄러 지연)"와
 * "회전자 타이머 만료 전에 순환을 닫을 여유(테스트 프로세스 지연)"를 같게 둔 값이다.
 * deadlock_timeout은 superuser만 세션에서 바꿀 수 있고 이 검증 계정은 superuser가 아니므로 시간차로 확정한다.
 */
const ROTATOR_HEAD_START_MS = 500;

export async function registerLockCases({ t, factory, admin, service, reset, userId }) {
  await t.test("계정 삭제와 회전의 강제 교착 20회는 저장소 503과 문장 전체 롤백이다", async () => {
    const dialect = new PgDialect();
    for (let iteration = 0; iteration < 20; iteration++) {
      // Given: 삭제자는 계정, 회전자는 세션을 먼저 잠가 실제 반대 순서를 만든다.
      await reset(); const original = await service.createMobileSession({ userId, sessionVersion: 0 });
      const deleter = await factory.open(), rotator = await factory.open();
      const execute = globalThis.__mobileSessionExecute;
      let rawCode;
      try {
        await deleter.query("BEGIN; SELECT id FROM public.users FOR UPDATE");
        await rotator.query("BEGIN; SELECT id FROM public.mobile_sessions FOR UPDATE");
        const pid = (await rotator.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        const deleterPid = (await deleter.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        globalThis.__mobileSessionExecute = async statement => {
          const query = dialect.sqlToQuery(statement);
          try { return await rotator.query(query.sql, query.params); }
          catch (error) { rawCode = error.code; throw error; }
        };
        const rotation = service.rotateRefreshToken(original.refreshToken);
        // 즉시 rejection handler를 붙여 PostgreSQL의 40P01을 미처리 거부로 만들지 않는다.
        const outcome = rotation.then(value => ({ value }), error => ({ error }));
        // 회전자가 계정 잠금을 DB 시계로 충분히 오래 기다린 뒤에만 삭제자가 순환을 닫아 희생자를 회전자로 확정한다.
        await waitForBlock(admin, pid, ROTATOR_HEAD_START_MS);
        // When: CASCADE가 회전자의 세션 잠금을 기다리며 교착 고리를 닫는다.
        // 40P01이 삭제자에게 가더라도 미처리 거부로 새지 않도록 즉시 결과 값으로 받는다.
        const deletion = deleter.query("DELETE FROM public.users").then(value => ({ value }), error => ({ error }));
        await waitForBlock(admin, deleterPid);
        const result = await outcome;
        // 삭제자가 희생자였다면 회전이 성공해 rawCode가 비므로, 원인이 드러나도록 메시지를 둔다.
        assert.equal(rawCode, "40P01", "교착 희생자는 회전 문장이어야 한다(삭제자가 희생자이면 회전이 성공해 코드가 비어 있다)");
        assert.ok(result.error instanceof service.MobileSessionStorageError);
        assert.equal(result.error.message.includes(original.refreshToken), false);
        await rotator.query("ROLLBACK");
        // 회전자가 물러나면 삭제자의 CASCADE 삭제는 정상 완료한다.
        assert.equal((await deletion).error, undefined, "삭제자는 교착 희생자가 아니어야 한다");
        await deleter.query("ROLLBACK");
        globalThis.__mobileSessionExecute = execute;
        // Then: 실제 서비스 오류의 HTTP 변환은 비밀 없는 503이고 기존 자격·이력은 불변이다.
        const response = await service.mobileAuthResponse(() => Promise.reject(result.error));
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error.code, "UNAVAILABLE");
        const row = (await admin.query("SELECT access_hash,refresh_hash,prev_refresh_hash FROM public.mobile_sessions")).rows[0];
        assert.deepEqual(row, { access_hash: service.hashMobileToken(original.accessToken), refresh_hash: service.hashMobileToken(original.refreshToken), prev_refresh_hash: null });
        assert.equal((await admin.query("SELECT count(*)::int AS count FROM public.mobile_session_refresh_history")).rows[0].count, 0);
      } finally {
        globalThis.__mobileSessionExecute = execute;
        await rotator.query("ROLLBACK"); await deleter.query("ROLLBACK");
        await rotator.close(); await deleter.close();
      }
    }
  });

  await t.test("계정 잠금 대기 중 갱신 만료를 넘으면 20회 모두 회전하지 않는다", async () => {
    for (let iteration = 0; iteration < 20; iteration++) {
      // Given: 운영 DB 시각으로 곧 만료되는 가족과 계정 배타 잠금
      await reset(); const original = await service.createMobileSession({ userId, sessionVersion: 0 });
      await admin.query("UPDATE public.mobile_sessions SET access_expires_at=statement_timestamp()+interval '100 milliseconds',refresh_expires_at=statement_timestamp()+interval '150 milliseconds'");
      const blocker = await factory.open();
      const execute = globalThis.__mobileSessionExecute, started = Promise.withResolvers();
      const dialect = new PgDialect();
      globalThis.__mobileSessionExecute = async statement => {
        const connection = await factory.open();
        try {
          const pid = (await connection.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
          const query = dialect.sqlToQuery(statement), pending = connection.query(query.sql, query.params);
          started.resolve(pid); return await pending;
        } finally { await connection.close(); }
      };
      let rotation;
      try {
        await blocker.query("BEGIN; SELECT id FROM public.users FOR UPDATE");
        rotation = service.rotateRefreshToken(original.refreshToken);
        await waitForBlock(admin, await started.promise);
        // When: 벽시계 sleep 대신 DB의 실제 만료 조건을 관측한 뒤 잠금을 푼다.
        for (;;) {
          if ((await admin.query("SELECT clock_timestamp()>=refresh_expires_at AS expired FROM public.mobile_sessions")).rows[0].expired) break;
          await delay(5);
        }
        await blocker.query("COMMIT");
        // Then
        assert.deepEqual(await rotation, { ok: false, reason: "EXPIRED" });
        assert.equal((await admin.query("SELECT refresh_hash FROM public.mobile_sessions")).rows[0].refresh_hash, service.hashMobileToken(original.refreshToken));
      } finally {
        globalThis.__mobileSessionExecute = execute;
        await blocker.query("ROLLBACK"); await blocker.close(); if (rotation) await rotation;
      }
    }
  });

  await t.test("전체 회수 문장이 볼 수 없는 동시 신규 로그인은 20회 모두 생존한다", async () => {
    for (let iteration = 0; iteration < 20; iteration++) {
      // Given: 기존 세션 잠금 때문에 전체 회수 문장의 스냅샷이 고정된 대기
      await reset(); const original = await service.createMobileSession({ userId, sessionVersion: 0 });
      const blocker = await factory.open();
      let logout;
      try {
        await blocker.query("BEGIN; SELECT id FROM public.mobile_sessions FOR UPDATE");
        const blockerPid = (await blocker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        logout = service.revokeAllSessionsForUser(userId);
        for (let attempt = 0; ; attempt++) {
          const blocked = (await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS blocked", [blockerPid])).rows[0].blocked;
          if (blocked) break;
          assert.ok(attempt < 200); await delay(5);
        }
        // When: 회수 문장 시작 뒤 신규 로그인을 커밋하고 기존 세션 잠금을 해제
        const fresh = await service.createMobileSession({ userId, sessionVersion: 0 });
        await blocker.query("COMMIT"); await logout;
        // Then: 보이는 세션만 회수한다. 향후 로그인을 금지하는 계정 버전 변경은 아니다.
        assert.equal(await service.authenticateAccessToken(original.accessToken), null);
        assert.equal((await service.authenticateAccessToken(fresh.accessToken))?.userId, userId);
      } finally { await blocker.query("ROLLBACK"); await blocker.close(); if (logout) await logout; }
    }
  });
}
