/**
 * 독립 raw reference의 사전 C[k]와 검토된 고정 후보 bytes를 소유 로컬 DB에서 비교합니다.
 * 임의 SQL·URL·운영 승인을 받지 않으며 실제 repository manifest는 변경하지 않습니다.
 * raw SQL과 source descriptor는 private WeakMap에 두고 공개 보고는 hash/count/code만 반환합니다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync, constants, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFreshReference, assertFreshReferenceObjects } from './db-fresh-reference.mjs';
import { assertOwnedLocalFactory } from './db-migration-local-adapter.mjs';
import { collectLocalCatalog } from './db-migration-catalog.mjs';
import { validateMigrationManifest, validateLedgerSnapshot } from '../../scripts/_lib/db-migration-manifest.mjs';
import { runLocalMigrations } from '../../scripts/_lib/db-migration-local-engine.mjs';
import { academicG1Actors, academicG1Ids, seedAcademicG1Domain } from './academic-g1-fixture.mjs';

const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const memory = new WeakMap();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const errors = new WeakSet();
const failure = code => { const error = Object.assign(new Error(code), { code }); errors.add(error); return error; };
const ensure = (condition, code) => { if (!condition) throw failure(code); };
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
// 순서는 원본 reference와 별도로 고정하며 원문 함수/SQL을 runtime 변환하지 않습니다.
const candidates = [
  ['schema-export', 'schema-export'],
  ['scripts/migrate-academic-students.sql', 'g1-students'],
  ['scripts/migrate-academic-enrollment-links.sql', 'g1-enrollment-links'],
  ['scripts/migrate-academic-roster.sql', 'g1-roster'],
  ['scripts/migrate-academic-assignments.sql', 'g1-assignments'],
  ['scripts/migrate-academic-submissions.sql', 'g1-submissions'],
  ['scripts/migrate-academic-assignment-actions.sql', 'g1-assignment-actions'],
  ['scripts/migrate-academic-upload-authorizations.sql', 'g1-upload-authorizations'],
  ['scripts/migrate-academic-submission-finalization.sql', 'g1-submission-finalization'],
  ['scripts/migrate-academic-submission-file-reads.sql', 'g1-submission-file-reads'],
  ['scripts/migrate-protect-application-answers.sql', 'custom-protect-application-answers'],
  ['scripts/migrate-protect-application-submissions.sql', 'custom-protect-application-submissions'],
  ['scripts/migrate-atomic-application-questions.sql', 'custom-atomic-application-questions'],
  ['scripts/migrate-assert-application-question-revision.sql', 'custom-assert-application-question-revision'],
  ['scripts/sql/rate-limit-reservations.sql', 'custom-rate-limit-reservations'],
  ['scripts/sql/markdown-image-references.sql', 'custom-markdown-image-references'],
  ['scripts/migrate-287-rate-limit-reservation-index.sql', 'custom-rate-limit-reservation-index'],
  ['scripts/migrate-mobile-sessions.sql', 'mobile-sessions'],
  ['scripts/migrate-recruitment-singleton.mjs', 'custom-recruitment-default'],
];
function bytesAt(file) {
  try {
    const path = resolve(repository, file);
    ensure(path.startsWith(repository + '/') && lstatSync(path).isFile() && realpathSync(path) === path && Number.isInteger(constants.O_NOFOLLOW), 'FRESH_BUNDLE_CANDIDATE_PATH');
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      ensure(fstatSync(descriptor).isFile() && fstatSync(descriptor).size <= 2 * 1024 * 1024, 'FRESH_BUNDLE_CANDIDATE_SIZE');
      const bytes = Buffer.alloc(2 * 1024 * 1024 + 1); let count = 0;
      while (count < bytes.length) { const length = readSync(descriptor, bytes, count, bytes.length - count, count); if (!length) break; count += length; }
      ensure(count <= 2 * 1024 * 1024, 'FRESH_BUNDLE_CANDIDATE_SIZE');
      return Buffer.from(bytes.subarray(0, count));
    } finally { closeSync(descriptor); }
  } catch { throw failure('FRESH_BUNDLE_CANDIDATE_READ'); }
}
function sourceFor(state, length) {
  const migrations = state.source.manifest.migrations.slice(0, length);
  return { manifest: { ...state.source.manifest, migrations }, fileContents: Object.fromEntries(migrations.map(row => [row.path, state.source.fileContents[row.path]])), trackedSqlPaths: migrations.map(row => row.path), untrackedSqlPaths: [], symlinkPaths: [] };
}
/** 실제 소유·비슈퍼유저 로그인은 상태를 쓰는 behavior probe에도 유지합니다. */
async function openSubject(factory) {
  try { assertOwnedLocalFactory(factory); } catch { throw failure('FRESH_BUNDLE_FACTORY_UNOWNED'); }
  const session = await factory.open();
  try {
    const identity = await session.identity();
    ensure(identity.databaseId === factory.expectedIdentity.databaseId && identity.scopeId === factory.expectedIdentity.scopeId, 'FRESH_BUNDLE_TARGET_MISMATCH');
    await session.query("SELECT pg_catalog.set_config('search_path','pg_catalog,public',false),pg_catalog.set_config('statement_timeout','10s',false),pg_catalog.set_config('lock_timeout','5s',false)");
    const role = (await session.query("SELECT current_user='hra_migration_operator' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AS ok FROM pg_catalog.pg_roles WHERE rolname=current_user")).rows[0];
    ensure(role?.ok, 'FRESH_BUNDLE_OPERATOR_INVALID');
    return session;
  } catch (error) { await session.destroy(); throw errors.has(error) ? error : failure('FRESH_BUNDLE_OPERATOR_INVALID'); }
}
async function rejects(session, sql, parameters, expected) {
  await session.query('SAVEPOINT fresh_bundle_rejection'); let code;
  try { await session.query(sql, parameters); } catch (error) { code = error?.code; }
  await session.query('ROLLBACK TO SAVEPOINT fresh_bundle_rejection'); await session.query('RELEASE SAVEPOINT fresh_bundle_rejection');
  ensure(code === expected, 'FRESH_BUNDLE_BEHAVIOR_SQLSTATE');
}
/** 동작 시험은 한 transaction에서 끝내고 합성 개인정보·행을 모두 rollback합니다. */
async function assertBehaviors(session) {
  let checks = 0;
  await session.query('BEGIN');
  try {
    const singleton = (await session.query("SELECT count(*)::integer AS total,count(*) FILTER(WHERE singleton_key=1 AND recruitment_status='UPCOMING' AND qualification_text IS NULL AND details_markdown IS NULL)::integer AS defaults FROM public.recruitment_settings")).rows[0];
    ensure(singleton.total === 1 && singleton.defaults === 1, 'FRESH_BUNDLE_SINGLETON'); checks++;
    await session.query("UPDATE public.recruitment_settings SET details_markdown='합성 수정 보존'");
    await session.query('INSERT INTO public.recruitment_settings(singleton_key) VALUES(1) ON CONFLICT(singleton_key) DO NOTHING');
    ensure((await session.query("SELECT details_markdown='합성 수정 보존' AS ok FROM public.recruitment_settings")).rows[0].ok, 'FRESH_BUNDLE_SINGLETON_PRESERVED'); checks++;
    await rejects(session, 'INSERT INTO public.recruitment_settings(singleton_key) VALUES(2)', [], '23514'); checks++;
    const form = 'c0000000-0000-4000-8000-000000000001', question = 'c0000000-0000-4000-8000-000000000002', submission = 'c0000000-0000-4000-8000-000000000003';
    await session.query("INSERT INTO public.application_forms(id,title,is_published) VALUES($1,'합성 질문',true)", [form]);
    await session.query("INSERT INTO public.application_questions(id,form_id,title,type,is_required) VALUES($1,$2,'합성 질문','LONG_ANSWER',true)", [question, form]);
    await session.query("INSERT INTO public.application_submissions(id,form_id,applicant_name,applicant_email) VALUES($1,$2,'합성 지원자','fresh-bundle@fixture.invalid')", [submission, form]);
    await session.query("INSERT INTO public.application_answers(submission_id,question_id,value) VALUES($1,$2,'합성 답변')", [submission, question]);
    await session.query('SELECT public.assert_application_form_questions_revision($1,0)', [form]); checks++;
    await rejects(session, 'SELECT public.assert_application_form_questions_revision($1,1)', [form], 'P0001'); checks++;
    await rejects(session, "SELECT public.save_application_form_questions($1,1,'[]'::jsonb)", [form], 'P0001'); checks++;
    await rejects(session, 'DELETE FROM public.application_forms WHERE id=$1', [form], '23503'); checks++;
    await session.query('SAVEPOINT fresh_bundle_answer');
    await session.query('DELETE FROM public.application_questions WHERE id=$1', [question]);
    await rejects(session, 'SET CONSTRAINTS application_answers_question_id_application_questions_id_fk IMMEDIATE', [], '23503'); checks++;
    await session.query('ROLLBACK TO SAVEPOINT fresh_bundle_answer'); await session.query('RELEASE SAVEPOINT fresh_bundle_answer');
    ensure((await session.query('SELECT count(*)=1 AS ok FROM public.application_answers WHERE submission_id=$1', [submission])).rows[0].ok, 'FRESH_BUNDLE_ANSWER_PRESERVED'); checks++;
    const reserve = "SELECT * FROM public.reserve_rate_limit(ARRAY['fresh-bundle'],ARRAY[repeat('b',64)],ARRAY[1],ARRAY[60])";
    const first = (await session.query(reserve)).rows[0]; ensure(first.allowed, 'FRESH_BUNDLE_RATE_ALLOWED'); checks++;
    const second = (await session.query(reserve)).rows[0]; ensure(!second.allowed && second.retry_after_sec > 0 && second.reservation_id === null, 'FRESH_BUNDLE_RATE_LIMITED'); checks++;
    await session.query('DELETE FROM public.rate_limit_events WHERE reservation_id=$1', [first.reservation_id]);
    ensure((await session.query(reserve)).rows[0].allowed, 'FRESH_BUNDLE_RATE_RELEASED'); checks++;
    await session.query("INSERT INTO public.markdown_image_assets(url) VALUES('synthetic-bundle-asset')");
    await session.query("INSERT INTO public.notices(title,content) VALUES('합성 참조','본문 synthetic-bundle-asset 후문')");
    ensure((await session.query("SELECT count(*)=1 AS ok FROM public.markdown_image_references r JOIN public.markdown_image_assets a ON a.id=r.asset_id WHERE a.url='synthetic-bundle-asset' AND r.source_type='notices'")).rows[0].ok, 'FRESH_BUNDLE_MARKDOWN'); checks++;
    for (const actor of Object.values(academicG1Actors)) await session.query("INSERT INTO public.users(id,name,email,role) VALUES($1,'합성 학생',$2,$3)", [actor.id, actor.email, actor.role]);
    await session.query("INSERT INTO public.cohorts(id,name) VALUES($1,'합성 기수 가'),($2,'합성 기수 나')", [academicG1Ids.cohortA, academicG1Ids.cohortB]);
    const seed = []; seedAcademicG1Domain({ sql: text => seed.push(text) }); for (const text of seed) await session.query(text);
    const countTargets = async () => Number((await session.query('SELECT count(*) AS count FROM public.assignment_targets WHERE assignment_id=$1', [academicG1Ids.active])).rows[0].count);
    const count = await countTargets(); await session.query('SELECT public.publish_academic_assignment($1,$2)', [academicG1Ids.active, academicG1Actors.manager.id]);
    ensure(count === 3 && await countTargets() === count, 'FRESH_BUNDLE_G1_SNAPSHOT'); checks++;
    const target = (await session.query('SELECT t.id FROM public.assignment_targets t JOIN public.cohort_enrollments e ON e.id=t.enrollment_id WHERE t.assignment_id=$1 AND e.student_id=$2', [academicG1Ids.active, academicG1Ids.studentA])).rows[0].id;
    const intent = (await session.query("SELECT public.issue_academic_assignment_upload($1,$2,$3,'synthetic.pdf',16) AS id", ['d0000000-0000-4000-8000-000000000001', target, academicG1Actors.studentA.id])).rows[0].id;
    await session.query('SELECT public.authorize_academic_assignment_upload($1,$2)', [intent, academicG1Actors.studentA.id]);
    await session.query("SELECT public.verify_authorized_academic_upload($1,$2,repeat('a',64),'synthetic-etag')", [intent, academicG1Actors.studentA.id]);
    const parameters = [target, academicG1Actors.studentA.id, intent, 'd0000000-0000-4000-8000-000000000002'];
    const final = (await session.query('SELECT public.complete_academic_assignment_submission($1,$2,$3,$4,true) AS result', parameters)).rows[0].result;
    const replay = (await session.query('SELECT public.complete_academic_assignment_submission($1,$2,$3,$4,true) AS result', parameters)).rows[0].result;
    ensure(!final.replayed && replay.replayed && replay.submissionId === final.submissionId, 'FRESH_BUNDLE_G1_REPLAY'); checks++;
    await session.query('SET CONSTRAINTS ALL IMMEDIATE');
    await session.query("INSERT INTO public.academic_submission_file_reads(actor_user_id,submission_id,file_id,access_scope) VALUES($1,$2,$3,'OWNER')", [academicG1Actors.studentA.id, final.submissionId, final.file.fileId]);
    await rejects(session, "UPDATE public.academic_submission_file_reads SET access_scope='MANAGEMENT'", [], 'P0001'); checks++;
    await rejects(session, 'DELETE FROM public.academic_submission_file_reads', [], 'P0001'); checks++;
  } finally { await session.query('ROLLBACK'); }
  return checks;
}

/** reference 기대값은 이 생성 시점에 모두 고정하고 subject 관측으로 다시 만들지 않습니다. */
export async function prepareFreshBundle(options = {}) {
  ensure(plain(options) && Reflect.ownKeys(options).length === 1 && Object.hasOwn(options, 'postgresBin'), 'FRESH_BUNDLE_OPTIONS');
  let reference;
  try {
    reference = await createFreshReference({ postgresBin: options.postgresBin });
    ensure(reference.contracts.length === candidates.length + 1 && Object.isFrozen(reference.contracts), 'FRESH_BUNDLE_REFERENCE_COUNT');
    const inventory = JSON.parse(readFileSync(resolve(repository, 'scripts/db/source-inventory.json'), 'utf8'));
    const migrations = [], fileContents = {}, steps = [];
    for (const [[origin, name], offset] of candidates.map((value, index) => [value, index])) {
      const candidatePath = `scripts/db/candidates/db-fresh/${name}.sql`, entry = inventory.sql.find(row => row.path === candidatePath), bytes = bytesAt(candidatePath);
      ensure(entry?.role === 'fresh_candidate' && entry.sha256 === digest(bytes), 'FRESH_BUNDLE_CANDIDATE_INVENTORY');
      ensure(entry.id === `fresh-${name}` && Array.isArray(entry.predecessors) && JSON.stringify(entry.predecessors) === JSON.stringify(offset === 0 ? [] : [migrations[offset - 1].id]), 'FRESH_BUNDLE_CANDIDATE_ORDER');
      const expected = reference.prefixes[offset + 1]; ensure(expected.source === origin, 'FRESH_BUNDLE_REFERENCE_ORDER');
      const path = `scripts/db/versioned/db-fresh/${name}.sql`;
      migrations.push({ id: entry.id, sequence: offset + 1, path, sha256: entry.sha256, transaction: 'required' }); fileContents[path] = Buffer.from(bytes);
      steps.push({ sequence: offset + 1, authorityDigest: expected.authorityDigest, referenceExecutedDigest: expected.executedSqlDigest, candidateDigest: entry.sha256 });
    }
    const source = { manifest: { schemaVersion: 1, state: 'configured', executionContract: 'postgresql-file-transaction-v1', migrations }, fileContents, trackedSqlPaths: migrations.map(row => row.path), untrackedSqlPaths: [], symlinkPaths: [] };
    const validation = validateMigrationManifest(source); ensure(validation.ok, 'FRESH_BUNDLE_SOURCE_INVALID');
    const summary = freeze({ code: 'FRESH_BUNDLE_PREPARED', migrations: migrations.length, contracts: reference.contracts.length, manifestDigest: validation.digest,
      rawExportDigest: reference.provenance.exportDigest, candidateExportDigest: steps[0].candidateDigest, schemaAuthorityDigest: reference.provenance.schemaDigest,
      steps, sourceOnly: false, observedLocalReference: true, syntheticVersionedPaths: true, freshReady: false, productionReady: false });
    const bundle = Object.freeze({
      summary: () => summary,
      contracts: () => reference.contracts,
      openReference: () => reference.open(),
      evidence: () => reference.evidence(),
      run: (factory, settings = {}) => runBundle(bundle, factory, settings),
      inspect: factory => inspectBundle(bundle, factory),
      checksumCanary: factory => checksumCanary(bundle, factory),
      close: () => { const state = memory.get(bundle); state.closed = true; return state.closePromise ??= reference.close(); },
    });
    memory.set(bundle, { source, reference, summary, closed: false }); return bundle;
  } catch (error) {
    try { await reference?.close(); } catch { throw failure('FRESH_BUNDLE_PREPARE_CLEANUP_FAILED'); }
    throw errors.has(error) ? error : failure('FRESH_BUNDLE_PREPARE_FAILED');
  }
}
async function runBundle(bundle, factory, settings) {
  const state = memory.get(bundle); ensure(state && !state.closed, 'FRESH_BUNDLE_CLOSED');
  ensure(plain(settings) && Reflect.ownKeys(settings).every(key => typeof key === 'string' && ['prefixLength', 'signal', 'timeoutMs'].includes(key)), 'FRESH_BUNDLE_RUN_OPTIONS');
  if (Object.hasOwn(settings, 'signal')) ensure(settings.signal instanceof AbortSignal, 'FRESH_BUNDLE_SIGNAL_INVALID');
  if (Object.hasOwn(settings, 'timeoutMs')) ensure(Number.isInteger(settings.timeoutMs) && settings.timeoutMs >= 100 && settings.timeoutMs <= 30000, 'FRESH_BUNDLE_TIMEOUT_INVALID');
  const prefixLength = Object.hasOwn(settings, 'prefixLength') ? settings.prefixLength : candidates.length;
  ensure(Number.isInteger(prefixLength) && prefixLength >= 1 && prefixLength <= candidates.length, 'FRESH_BUNDLE_PREFIX_INVALID');
  try { assertOwnedLocalFactory(factory); } catch { throw failure('FRESH_BUNDLE_FACTORY_UNOWNED'); }
  const result = await runLocalMigrations({ factory, source: sourceFor(state, prefixLength), catalogContracts: state.reference.contracts.slice(0, prefixLength + 1), ...(Object.hasOwn(settings, 'signal') ? { signal: settings.signal } : {}), ...(settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs }) });
  let behaviors = 0, objects = 0;
  if (prefixLength === candidates.length && result.manifestCompleted && result.cleanupComplete) {
    let session;
    try {
      session = await openSubject(factory); objects = await assertFreshReferenceObjects(session); behaviors = await assertBehaviors(session);
      ensure((await collectLocalCatalog(session)).digest === state.reference.contracts.at(-1).digest, 'FRESH_BUNDLE_BEHAVIOR_DRIFT');
    } catch (error) {
      result.phase = 'BLOCKED'; result.phases.push('BLOCKED'); result.code = errors.has(error) ? error.code : 'FRESH_BUNDLE_BEHAVIOR_FAILED'; result.firstErrorCode ??= result.code; result.manifestCompleted = false;
    } finally {
      try { await session?.close(); } catch { result.cleanupComplete = false; result.cleanupCodes.push('FRESH_BUNDLE_BEHAVIOR_CLEANUP_FAILED'); result.manifestCompleted = false; }
    }
  }
  return freeze({ ...result, manifestDigest: state.summary.manifestDigest, requestedManifestDigest: result.manifestDigest,
    requestedManifestCompleted: result.manifestCompleted, requestedPending: result.pending,
    manifestCompleted: prefixLength === candidates.length && result.manifestCompleted, pending: candidates.length - result.applied,
    requestedPrefix: prefixLength, behaviors, objects, freshReady: false, productionReady: false });
}

/** 전체 성공 ledger와 catalog를 따로 관측하여 한쪽 drift가 다른 쪽으로 가려지지 않게 합니다. */
async function inspectBundle(bundle, factory) {
  const state = memory.get(bundle); ensure(state && !state.closed, 'FRESH_BUNDLE_CLOSED');
  const session = await openSubject(factory);
  try {
    const presence = (await session.query(`SELECT pg_catalog.to_regclass('hra_migrations.applied_migrations') IS NOT NULL AS present,
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relname='__drizzle_migrations' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS native`)).rows[0];
    const exists = presence.present;
    const rows = exists ? (await session.query('SELECT id,sequence,sha256,status FROM hra_migrations.applied_migrations ORDER BY sequence')).rows : [];
    const ledger = validateLedgerSnapshot(state.source.manifest, { schemaVersion: 1, nativeLedgerExists: presence.native, ledgerExists: exists, ledgerSchemaVersion: exists ? 1 : null, rows });
    const catalog = await collectLocalCatalog(session), expected = ledger.ok ? state.reference.contracts[ledger.prefixLength] : null;
    return freeze({ ledgerExact: ledger.ok, applied: ledger.prefixLength, rows: rows.length, catalogMatches: !!expected && expected.digest === catalog.digest,
      catalogDigest: catalog.digest, counts: catalog.counts, productionReady: false });
  } catch { throw failure('FRESH_BUNDLE_INSPECTION_FAILED'); }
  finally { await session.close(); }
}
/** 디스크 후보를 바꾸지 않고 private 복사본 한 byte만 변형해 S1 사전 차단을 입증합니다. */
async function checksumCanary(bundle, factory) {
  const state = memory.get(bundle); ensure(state && !state.closed, 'FRESH_BUNDLE_CLOSED');
  try { assertOwnedLocalFactory(factory); } catch { throw failure('FRESH_BUNDLE_FACTORY_UNOWNED'); }
  const source = sourceFor(state, candidates.length);
  source.fileContents = Object.fromEntries(Object.entries(source.fileContents).map(([path, bytes]) => [path, Buffer.from(bytes)]));
  source.fileContents[source.manifest.migrations[0].path][0] ^= 1;
  const result = await runLocalMigrations({ factory, source, catalogContracts: state.reference.contracts });
  return freeze({ phase: result.phase, code: result.code, applied: result.applied, manifestCompleted: result.manifestCompleted,
    observedLocalDatabase: result.observedLocalDatabase, cleanupComplete: result.cleanupComplete, productionReady: false });
}
