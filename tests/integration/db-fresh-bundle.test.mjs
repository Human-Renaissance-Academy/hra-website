/**
 * 전체 reviewed fresh 후보를 독립 reference C[k]와 대조하는 소유 로컬 PG 통합 gate다.
 * ledger·객체/권한·동작·실제 ACK fault/timeout을 검사하되 SQL·URL·회원 행은 출력하지 않는다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareFreshBundle } from '../support/db-fresh-bundle.mjs';
import { createOwnedLocalFactory } from '../support/db-migration-local-adapter.mjs';

const postgresBin = process.env.HRA_TEST_PG_BIN;
assert.ok(postgresBin, 'FRESH_BUNDLE_PG_REQUIRED');
const ensure = (value, code) => assert.equal(Boolean(value), true, code);
function cleanupEvidence(factory) {
  const evidence = factory.evidence();
  ensure(evidence.cleanupComplete && evidence.clusterRemoved && evidence.configurationRestored && evidence.activeSessions === 0 && evidence.activeSockets === 0 && evidence.openedSockets === evidence.closedSockets, 'FRESH_BUNDLE_OWNED_CLEANUP');
  assert.equal(evidence.deniedNetwork, 0);
}
async function owned(t) {
  const factory = createOwnedLocalFactory({ postgresBin });
  t.after(async () => { await factory.close(); cleanupEvidence(factory); }); return factory;
}
async function query(factory, text, parameters = []) {
  const session = await factory.open();
  try { await session.query("SELECT pg_catalog.set_config('search_path','pg_catalog,public',false)"); return await session.query(text, parameters); }
  finally { await session.close(); }
}

test('독립 reference와 전체 fresh bundle의 prefix·실패·재개 gate', { timeout: 900_000 }, async t => {
  const started = Date.now(), bundle = await prepareFreshBundle({ postgresBin }), summary = bundle.summary(), contracts = bundle.contracts();
  t.after(async () => { await bundle.close(); cleanupEvidence(bundle); ensure(Date.now() - started < 900000, 'FRESH_BUNDLE_BOUNDED_RUN'); });

  await t.test('사전 기대 C0..C19와 source/raw/candidate hash를 분리하고 동결한다', () => {
    assert.equal(summary.migrations, 19); assert.equal(summary.contracts, 20);
    assert.notEqual(summary.rawExportDigest, summary.candidateExportDigest, 'FRESH_EXPORT_DELTA_VISIBLE');
    for (const hash of [summary.manifestDigest, summary.rawExportDigest, summary.candidateExportDigest, summary.schemaAuthorityDigest]) assert.match(hash, /^[a-f0-9]{64}$/);
    ensure(Object.isFrozen(summary) && Object.isFrozen(contracts) && contracts.every(row => Object.isFrozen(row) && Object.isFrozen(row.counts)), 'FRESH_EXPECTED_CONTRACTS_IMMUTABLE');
    assert.equal(summary.freshReady, false); assert.equal(summary.productionReady, false); assert.equal(summary.syntheticVersionedPaths, true);
  });
  await t.test('잘못된 실행옵션·checksum 변형은 client 0으로 거부하며 native ledger를 실제 관측', async t => {
    const factory = await owned(t), before = factory.evidence().openedSockets;
    for (const invalid of [null, [], () => {}, false, 0, '', { signal: false }, { signal: 0 }, { signal: '' }, { signal: undefined }, { signal: { aborted: false } }, { prefixLength: null }, { prefixLength: 0 }, { timeoutMs: undefined }, { timeoutMs: '10000' }, { timeoutMs: 0 }, { url: 'synthetic-invalid-target' }]) {
      await assert.rejects(bundle.run(factory, invalid), error => /^FRESH_BUNDLE_[A-Z_]+$/.test(error?.code ?? ''));
      assert.equal(factory.evidence().openedSockets, before, 'FRESH_INVALID_OPTIONS_OPENED_CLIENT');
    }
    const result = await bundle.checksumCanary(factory);
    ensure(result.code === 'SOURCE_INVALID' && !result.manifestCompleted && !result.observedLocalDatabase && result.cleanupComplete, 'FRESH_CHECKSUM_DRIFT_BLOCKED');
    assert.equal(factory.evidence().openedSockets, before); assert.equal(bundle.summary().manifestDigest, summary.manifestDigest);
    await query(factory, 'CREATE SCHEMA drizzle;CREATE TABLE drizzle.__drizzle_migrations(hash text)');
    const native = await bundle.run(factory); ensure(native.code === 'NATIVE_LEDGER_PRESENT' && !native.manifestCompleted, 'FRESH_NATIVE_LEDGER_NOT_BLOCKED');
    const observed = await bundle.inspect(factory); ensure(!observed.ledgerExact && !observed.catalogMatches && observed.rows === 0, 'FRESH_NATIVE_LEDGER_NOT_OBSERVED');
    assert.equal(factory.evidence().helperCalls, 0);
  });
  await t.test('각 prefix 종료 후 같은 bytes의 append 재개와 전체19 완료·replay0·독립 동작', async t => {
    const factory = await owned(t);
    for (let prefixLength = 1; prefixLength <= summary.migrations; prefixLength++) {
      const before = factory.evidence().helperCalls, result = await bundle.run(factory, { prefixLength });
      ensure(result.phase === 'VERIFIED' && result.code === 'APPLIED' && result.requestedManifestCompleted && result.cleanupComplete, 'FRESH_PREFIX_APPLY_FAILED');
      assert.equal(result.applied, prefixLength); assert.equal(result.pending, summary.migrations - prefixLength); assert.equal(result.manifestCompleted, prefixLength === summary.migrations);
      assert.equal(result.catalogDigest, contracts[prefixLength].digest); assert.equal(factory.evidence().helperCalls - before, 1, 'FRESH_COMPLETED_PREFIX_REPLAYED');
      const observed = await bundle.inspect(factory); ensure(observed.ledgerExact && observed.catalogMatches && observed.rows === prefixLength, 'FRESH_EXACT_PREFIX_OBSERVED');
      if (prefixLength === summary.migrations) ensure(result.behaviors >= 17 && result.objects > 100, 'FRESH_INDEPENDENT_BEHAVIORS');
    }
    const before = factory.evidence().helperCalls, retry = await bundle.run(factory);
    ensure(retry.manifestCompleted && retry.pending === 0 && retry.catalogDigest === contracts.at(-1).digest && retry.behaviors >= 17, 'FRESH_SAME_IMMUTABLE_RETRY');
    assert.equal(factory.evidence().helperCalls, before); assert.equal(factory.evidence().commits, 19);
    ensure(factory.evidence().lockRequests >= 20, 'FRESH_SHARED_GLOBAL_LOCK');
  });
  for (const position of [1, 9, 19]) await t.test(`실제 wire COMMIT ACK 유실 ${position} prefix reconcile 후 남은 파일만 재개`, async t => {
    const factory = await owned(t); factory.faults.dropCommitAckAt(position);
    const unknown = await bundle.run(factory);
    ensure(unknown.phase === 'VERIFIED' && unknown.firstErrorCode === 'COMMIT_OUTCOME_UNKNOWN' && unknown.phases.includes('RECONNECTING') && unknown.phases.includes('RECONCILING'), 'FRESH_ACK_RECONCILIATION');
    assert.equal(unknown.applied, position); assert.equal(unknown.pending, 19 - position); assert.equal(unknown.manifestCompleted, position === 19); assert.equal(unknown.catalogDigest, contracts[position].digest);
    assert.equal(factory.evidence().helperCalls, position, 'FRESH_UNKNOWN_AUTO_REPLAY'); assert.equal(factory.evidence().droppedCommitAcks, 1);
    const observed = await bundle.inspect(factory); ensure(observed.ledgerExact && observed.catalogMatches && observed.rows === position, 'FRESH_UNKNOWN_EXACT_PREFIX');
    const completed = await bundle.run(factory); ensure(completed.manifestCompleted && completed.applied === 19 && completed.behaviors >= 17, 'FRESH_UNKNOWN_EXPLICIT_RESUME');
    assert.equal(factory.evidence().helperCalls, 19, 'FRESH_UNKNOWN_RESUME_REPLAYED');
  });
  for (const mode of ['statement', 'lock']) await t.test(`전체 bundle의 ${mode} timeout은 실패 파일 객체·row만 rollback하고 prefix2 보존`, { timeout: 45000 }, async t => {
    const factory = await owned(t); let holder;
    if (mode === 'lock') { holder = await factory.open(); await holder.query('BEGIN'); await holder.query('SELECT pg_catalog.pg_advisory_xact_lock(145311848,1)'); }
    const body = mode === 'statement' ? 'PERFORM pg_catalog.pg_sleep(9);' : 'PERFORM pg_catalog.pg_advisory_xact_lock(145311848,1);';
    factory.faults.beforeNextQuery(text => text.startsWith('INSERT INTO hra_migrations.applied_migrations') && factory.evidence().helperCalls === 3,
      session => session.query(`CREATE TABLE public.fresh_bundle_partial_canary(id integer);
        CREATE FUNCTION pg_temp.fresh_bundle_wait() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $wait$BEGIN ${body} RETURN NEW; END;$wait$;
        CREATE TRIGGER fresh_bundle_wait BEFORE INSERT ON hra_migrations.applied_migrations FOR EACH ROW EXECUTE FUNCTION pg_temp.fresh_bundle_wait();`));
    let result;
    try { result = await bundle.run(factory); }
    finally { if (holder) { await holder.query('ROLLBACK'); await holder.close(); } }
    ensure(result.phase === 'FAILED_PRECOMMIT' && result.code === 'LEDGER_INSERT_FAILED' && !result.manifestCompleted && !result.phases.includes('COMMIT_OUTCOME_UNKNOWN') && result.cleanupComplete, 'FRESH_TIMEOUT_ATOMIC_FAILURE');
    assert.equal(result.applied, 2); assert.equal(result.pending, 17); assert.equal(factory.evidence().helperCalls, 3);
    const observed = await bundle.inspect(factory); ensure(observed.ledgerExact && observed.catalogMatches && observed.rows === 2 && observed.catalogDigest === contracts[2].digest, 'FRESH_TIMEOUT_PREFIX_PRESERVED');
    const partial = (await query(factory, "SELECT to_regclass('public.fresh_bundle_partial_canary') IS NULL AND to_regprocedure('public.inspect_academic_enrollment_candidates()') IS NULL AS absent")).rows[0].absent;
    ensure(partial, 'FRESH_TIMEOUT_OBJECTS_ROLLED_BACK');
    const resumed = await bundle.run(factory); ensure(resumed.manifestCompleted, 'FRESH_TIMEOUT_EXPLICIT_RESUME'); assert.equal(factory.evidence().helperCalls, 20);
  });
  await t.test('같은 full bundle의 physical backend 변경은 다음 write 전에 차단', async t => {
    const factory = await owned(t); factory.faults.displaceIdentityAfterNextHelper(); const result = await bundle.run(factory);
    ensure(result.phase === 'FAILED_PRECOMMIT' && result.code === 'BACKEND_CHANGED' && !result.manifestCompleted, 'FRESH_BACKEND_CHANGE_BLOCKED');
    assert.equal(factory.evidence().helperCalls, 1); const observed = await bundle.inspect(factory); ensure(observed.ledgerExact && observed.catalogMatches && observed.rows === 0, 'FRESH_BACKEND_ROLLBACK_C0');
  });
  await t.test('full19 ledger checksum drift는 catalog가 같아도 재적용 없이 거부', async t => {
    const factory = await owned(t); ensure((await bundle.run(factory)).manifestCompleted, 'FRESH_LEDGER_SETUP'); const before = factory.evidence().helperCalls;
    await query(factory, "UPDATE hra_migrations.applied_migrations SET sha256=repeat('f',64) WHERE sequence=1");
    const result = await bundle.run(factory); ensure(result.phase === 'BLOCKED' && result.code === 'LEDGER_PREFIX_MISMATCH' && !result.manifestCompleted, 'FRESH_LEDGER_DRIFT_BLOCKED'); assert.equal(factory.evidence().helperCalls, before);
    const observed = await bundle.inspect(factory); ensure(!observed.ledgerExact && observed.rows === 19 && observed.catalogDigest === contracts.at(-1).digest, 'FRESH_LEDGER_CATALOG_INDEPENDENT');
  });
  await t.test('full19 ACL drift는 ledger가 같아도 복구·재적용 없이 거부', async t => {
    const factory = await owned(t); ensure((await bundle.run(factory)).manifestCompleted, 'FRESH_ACL_SETUP'); const before = factory.evidence().helperCalls;
    await query(factory, 'GRANT EXECUTE ON FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) TO PUBLIC');
    const result = await bundle.run(factory); ensure(result.phase === 'BLOCKED' && result.code === 'CATALOG_MISMATCH' && !result.manifestCompleted, 'FRESH_ACL_DRIFT_BLOCKED'); assert.equal(factory.evidence().helperCalls, before);
    const observed = await bundle.inspect(factory); ensure(observed.ledgerExact && observed.rows === 19 && !observed.catalogMatches, 'FRESH_ACL_LEDGER_INDEPENDENT');
  });
  await t.test('ACK 재연결 target 교체는 외국 소유 DB의 bootstrap/write 전에 차단', async t => {
    const factory = await owned(t), foreign = await owned(t); factory.faults.dropCommitAckAt(1);
    factory.faults.beforeNextOpen(() => { factory.faults.beforeNextOpen(() => { factory.faults.nextOpenUses(foreign); }); });
    const result = await bundle.run(factory); ensure(result.phase === 'BLOCKED' && result.code === 'TARGET_MISMATCH' && result.firstErrorCode === 'COMMIT_OUTCOME_UNKNOWN' && !result.manifestCompleted, 'FRESH_RECONNECT_TARGET_BLOCKED');
    assert.equal(factory.evidence().helperCalls, 1); assert.equal((await bundle.inspect(factory)).rows, 1);
    ensure((await query(foreign, "SELECT to_regclass('hra_migrations.applied_migrations') IS NULL AS empty")).rows[0].empty, 'FRESH_FOREIGN_TARGET_WRITE_ZERO');
  });
  for (const mode of ['read', 'catalog']) await t.test(`성공 COMMIT 후 ${mode} 오류는 committed BLOCKED이며rollback/replay 0`, async t => {
    const factory = await owned(t);
    if (mode === 'read') factory.faults.failNextQuery(text => factory.evidence().commits >= 1 && text.includes('hra-catalog:schemas'));
    else factory.faults.beforeNextQuery(text => factory.evidence().commits >= 1 && text.includes('hra-catalog:schemas'), () => query(factory, 'ALTER TABLE public.alumni_stories ALTER COLUMN is_featured SET DEFAULT true'));
    const result = await bundle.run(factory);
    ensure(result.phase === 'BLOCKED' && result.code === (mode === 'read' ? 'CATALOG_READ_FAILED' : 'CATALOG_MISMATCH') && result.phases.includes('COMMITTED') && result.phases.includes('VERIFYING') && !result.phases.includes('COMMIT_OUTCOME_UNKNOWN') && !result.phases.includes('FAILED_PRECOMMIT') && !result.manifestCompleted, 'FRESH_COMMITTED_FAILURE_STATE');
    assert.equal(result.applied, 1); assert.equal(factory.evidence().helperCalls, 1); assert.equal((await bundle.inspect(factory)).rows, 1);
  });
});
