/**
 * 실제 PG14의 독립 raw reference와 비슈퍼유저 owner/ACL/전체 catalog를 검증한다.
 * 원본·후보 공통 결함을 놓치지 않도록 고정 동작 assertion과 deliberate mutation을 사용한다.
 * 운영 DB·외부 Blob·URL은 사용하지 않으며 실패 출력에는 boolean/count/hash/code만 남긴다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createFreshReference, assertFreshReferenceObjects } from "../support/db-fresh-reference.mjs";
import { collectLocalCatalog } from "../support/db-migration-catalog.mjs";
import { academicG1Actors, academicG1Ids, seedAcademicG1Domain } from "../support/academic-g1-fixture.mjs";
import { recruitmentDefaultInsertSql } from "../../scripts/migrate-recruitment-singleton.mjs";

const postgresBin = process.env.HRA_TEST_PG_BIN;
assert.ok(postgresBin, "FRESH_PG_BIN_REQUIRED");
const fixedPath = "SET search_path TO pg_catalog, public";
const ensure = (value, code) => assert.equal(Boolean(value), true, code);

/** 원문 오류를 assertion에 전달하지 않고 SQLSTATE만 비교한다. */
async function rejects(session, sql, values, code) {
  await session.query("SAVEPOINT fresh_rejection"); let observed;
  try { await session.query(sql, values); } catch (error) { observed = error.code; }
  await session.query("ROLLBACK TO SAVEPOINT fresh_rejection");
  await session.query("RELEASE SAVEPOINT fresh_rejection");
  assert.equal(observed, code, "FRESH_EXPECTED_SQLSTATE");
}

/** 시험 데이터와 DDL 변경은 정상·실패 모두 rollback하며 원본 C[k]를 덮어쓰지 않는다. */
async function rollback(session, action) {
  await session.query("BEGIN");
  try { return await action(); } finally { await session.query("ROLLBACK"); }
}

test("전체 원본 fresh reference는 독립 prefix·변형·동작 계약을 비슈퍼유저로 충족한다", { timeout: 180_000 }, async t => {
  const reference = await createFreshReference({ postgresBin });
  t.after(async () => {
    await reference.close(); const evidence = reference.evidence();
    ensure(evidence.cleanupComplete && evidence.clusterRemoved && evidence.configurationRestored && evidence.activeSessions === 0 && evidence.activeSockets === 0 && evidence.openedSockets === evidence.closedSockets, "FRESH_OWNED_CLEANUP_COMPLETE");
    assert.equal(evidence.deniedNetwork, 0); assert.equal(evidence.privilegedFixtureFaults, 0);
  });
  const session = await reference.open();
  t.after(() => session.close());
  await session.query(fixedPath);
  const baseline = reference.contracts.at(-1).digest;

  await t.test("전체 prefix 계약을 고정하고 독립 reference 외의 준비 완료를 주장하지 않는다", async () => {
    assert.equal(reference.contracts.length, 20); assert.equal(reference.prefixes.length, 20);
    ensure(reference.checks.objects > 1000 && reference.checks.behaviors >= 10 && reference.checks.mutations === reference.contracts.length, "FRESH_PREFIX_ASSERTIONS_COMPLETE");
    assert.equal(reference.checks.immediateReplays, 18);
    ensure(reference.checks.scopePrivate && reference.checks.physicalBackend, "FRESH_OWNED_OPERATOR_PINNED");
    ensure(Object.isFrozen(reference.contracts) && reference.contracts.every(item => Object.isFrozen(item) && Object.isFrozen(item.counts)), "FRESH_CONTRACTS_FROZEN");
    for (const value of [reference.provenance.schemaDigest, reference.provenance.exportDigest, baseline]) assert.match(value, /^[a-f0-9]{64}$/);
    assert.equal(reference.provenance.toolVersion, "0.31.11");
    assert.equal(reference.provenance.inventoryLegacySqlSourceCount, 18);
    assert.equal(reference.provenance.inventoryCandidateSqlSourceCount, 19);
    assert.equal(reference.provenance.inventoryTotalSqlSourceCount, 37);
    assert.equal(reference.provenance.rawSqlSourceCount, 17);
    assert.equal(reference.provenance.generatedExportCount, 1);
    assert.equal(reference.provenance.handcraftedSqlCount, 1);
    for (const prefix of reference.prefixes) {
      assert.match(prefix.authorityDigest, /^[a-f0-9]{64}$/); assert.match(prefix.executedSqlDigest, /^[a-f0-9]{64}$/);
      if (prefix.source.startsWith("scripts/") && prefix.source.endsWith(".sql")) assert.equal(prefix.authorityDigest, prefix.executedSqlDigest, "FRESH_RAW_BYTES_UNCHANGED");
    }
    const singleton = reference.prefixes.at(-1);
    const moduleBytes = readFileSync(new URL("../../scripts/migrate-recruitment-singleton.mjs", import.meta.url));
    assert.equal(singleton.authorityDigest, createHash("sha256").update(moduleBytes).digest("hex"));
    assert.notEqual(singleton.authorityDigest, singleton.executedSqlDigest, "FRESH_HANDCRAFTED_AUTHORITY_SEPARATE");
    assert.equal(reference.readiness.freshReady, false); assert.equal(reference.readiness.productionReady, false);
    assert.equal(reference.readiness.unresolved.length, 3);
    assert.equal((await session.query("SELECT count(*)::integer AS count FROM hra_migrations.applied_migrations")).rows[0].count, 0);
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("보존한 기본 행 INSERT는 원문과 같고 빈 행 생성·재실행·편집 보존을 소유 PG에서 충족한다", async () => {
    // 기대문은 기존 MJS 51행에서 독립적으로 고정합니다. 후보나 reference의 SQL을 상수에서 만들지 않습니다.
    const expectedSql = "INSERT INTO recruitment_settings (singleton_key) VALUES (1) ON CONFLICT (singleton_key) DO NOTHING";
    ensure(recruitmentDefaultInsertSql === expectedSql, "FRESH_RECRUITMENT_INSERT_LITERAL_EXACT");
    assert.equal(createHash("sha256").update(recruitmentDefaultInsertSql).digest("hex"), "0ff1d8ac9b131e92da17b745cfaee5bcb60efec6673a16d8b4b81e97394f59cb", "FRESH_RECRUITMENT_INSERT_DIGEST_EXACT");
    // 전체 행의 값은 출력하지 않고 지문만 비교하여 rollback 뒤 기존 행이 그대로인지 확인합니다.
    const rowDigest = async () => (await session.query("SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id)::text,'[]')) AS digest FROM public.recruitment_settings r")).rows[0].digest;
    assert.equal((await session.query("SELECT count(*)::integer AS count FROM public.recruitment_settings")).rows[0].count, 1);
    const before = await rowDigest();
    await rollback(session, async () => {
      await session.query("SET LOCAL search_path TO pg_catalog, public");
      await session.query("DELETE FROM public.recruitment_settings");
      await session.query(recruitmentDefaultInsertSql);
      // 기본값 기대는 schema.ts와 schema export의 정의에서 고정하며 실행 대상 상수에서 유도하지 않습니다.
      const defaults = (await session.query(`SELECT count(*)::integer AS count,
        bool_and(singleton_key=1 AND id IS NOT NULL AND updated_at IS NOT NULL
          AND recruitment_status='UPCOMING' AND poster_layout='right'
          AND active_cohort_id IS NULL AND google_form_url IS NULL AND recruitment_start_date IS NULL
          AND poster_image_url IS NULL AND deadline_date IS NULL AND next_recruitment_year IS NULL
          AND next_recruitment_month IS NULL AND qualification_text IS NULL AND details_markdown IS NULL) AS valid_defaults
        FROM public.recruitment_settings`)).rows[0];
      assert.equal(defaults.count, 1);
      ensure(defaults.valid_defaults, "FRESH_RECRUITMENT_SCHEMA_DEFAULTS");
      await session.query("UPDATE public.recruitment_settings SET details_markdown=$1", ["합성 모집 내용 보존"]);
      const edited = await rowDigest();
      await session.query(recruitmentDefaultInsertSql);
      const replay = (await session.query("SELECT count(*)::integer AS count,count(*) FILTER(WHERE details_markdown=$1)::integer AS preserved FROM public.recruitment_settings", ["합성 모집 내용 보존"])).rows[0];
      assert.equal(replay.count, 1);
      assert.equal(replay.preserved, 1);
      assert.equal(await rowDigest(), edited, "FRESH_RECRUITMENT_EDITED_ROW_PRESERVED");
    });
    assert.equal(await rowDigest(), before, "FRESH_RECRUITMENT_PRIOR_ROW_RESTORED");
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("동명 table·index·view의 종류 위조는 객체 존재와 별개로 거부한다", async () => {
    const mutations = [
      "ALTER TABLE public.login_attempts RENAME TO reference_saved_login_attempts; CREATE VIEW public.login_attempts AS SELECT * FROM public.reference_saved_login_attempts",
      "DROP INDEX public.idx_rate_limit_reservation_id; CREATE TABLE public.idx_rate_limit_reservation_id(value integer)",
      "DROP VIEW public.markdown_image_references; CREATE TABLE public.markdown_image_references(asset_id uuid,source_type text,source_id uuid)",
    ];
    for (const mutation of mutations) {
      await rollback(session, async () => {
        await session.query(mutation);
        await assert.rejects(assertFreshReferenceObjects(session), error => error.code === "FRESH_EXPECTED_OBJECT_MISSING");
      });
      ensure(await assertFreshReferenceObjects(session) > 100, "FRESH_OBJECT_KINDS_RESTORED");
      assert.equal((await collectLocalCatalog(session)).digest, baseline);
    }
  });

  await t.test("함수 본문·ACL·SECURITY·search_path와 FK의 action/deferred/validated 변경을 각각 감지한다", async () => {
    const mutations = [
      "CREATE OR REPLACE FUNCTION public.guard_academic_submission_file_read() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS 'BEGIN RETURN NEW; END'",
      "GRANT EXECUTE ON FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) TO PUBLIC",
      "ALTER FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) SECURITY DEFINER",
      "ALTER FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) SET search_path=public",
      "ALTER TABLE public.application_answers DROP CONSTRAINT application_answers_question_id_application_questions_id_fk; ALTER TABLE public.application_answers ADD CONSTRAINT application_answers_question_id_application_questions_id_fk FOREIGN KEY(question_id) REFERENCES public.application_questions(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED",
      "ALTER TABLE public.application_answers ALTER CONSTRAINT application_answers_question_id_application_questions_id_fk NOT DEFERRABLE",
      "ALTER TABLE public.application_answers DROP CONSTRAINT application_answers_question_id_application_questions_id_fk; ALTER TABLE public.application_answers ADD CONSTRAINT application_answers_question_id_application_questions_id_fk FOREIGN KEY(question_id) REFERENCES public.application_questions(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED NOT VALID",
      "ALTER TABLE public.assignments DISABLE TRIGGER academic_assignment_guard",
      "ALTER TABLE public.users ENABLE ROW LEVEL SECURITY; CREATE POLICY reference_canary ON public.users USING(true)",
      "CREATE OR REPLACE VIEW public.markdown_image_references AS SELECT id AS asset_id,'mutation'::text AS source_type,id AS source_id FROM public.markdown_image_assets",
      "DROP INDEX public.idx_rate_limit_reservation_id; CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events(key_hash)",
    ];
    for (const mutation of mutations) {
      await rollback(session, async () => {
        await session.query(mutation);
        assert.notEqual((await collectLocalCatalog(session)).digest, baseline, "FRESH_SEMANTIC_MUTATION_DETECTED");
      });
      assert.equal((await collectLocalCatalog(session)).digest, baseline, "FRESH_SEMANTIC_MUTATION_RESTORED");
    }
    const fk = (await session.query("SELECT confdeltype='a' AND confupdtype='a' AND condeferrable AND condeferred AND convalidated AS ok FROM pg_catalog.pg_constraint WHERE conname='application_answers_question_id_application_questions_id_fk'")).rows[0];
    ensure(fk.ok, "FRESH_ANSWER_FK_EXACT");
  });

  await t.test("실패한 concurrent unique index의 실제 invalid 상태를 관측하고 소유 객체를 정리한다", async () => {
    await session.query("INSERT INTO public.rate_limit_events(reservation_id,scope,key_hash) VALUES('b0000000-0000-4000-8000-000000000001','fresh-invalid-index',repeat('a',64)),('b0000000-0000-4000-8000-000000000002','fresh-invalid-index',repeat('a',64))");
    try {
      let code;
      try { await session.query("CREATE UNIQUE INDEX CONCURRENTLY reference_invalid_index ON public.rate_limit_events(key_hash)"); } catch (error) { code = error.code; }
      assert.equal(code, "23505");
      ensure((await session.query("SELECT NOT indisvalid AS ok FROM pg_catalog.pg_index WHERE indexrelid='public.reference_invalid_index'::regclass")).rows[0].ok, "FRESH_ACTUAL_INDEX_INVALID");
      assert.notEqual((await collectLocalCatalog(session)).digest, baseline, "FRESH_INVALID_INDEX_DETECTED");
    } finally {
      await session.query("DROP INDEX IF EXISTS public.reference_invalid_index");
      await session.query("DELETE FROM public.rate_limit_events WHERE scope='fresh-invalid-index'");
    }
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("질문 revision·지연 답변 FK·지원서 보존·markdown 실제 참조를 검증한다", async () => {
    await rollback(session, async () => {
      const form = "c0000000-0000-4000-8000-000000000001";
      const question = "c0000000-0000-4000-8000-000000000002";
      const submission = "c0000000-0000-4000-8000-000000000003";
      await session.query("INSERT INTO public.application_forms(id,title,is_published) VALUES($1,'합성 질문 검증',true)", [form]);
      await session.query("INSERT INTO public.application_questions(id,form_id,title,type,is_required) VALUES($1,$2,'합성 질문','LONG_ANSWER',true)", [question, form]);
      await session.query("INSERT INTO public.application_submissions(id,form_id,applicant_name,applicant_email) VALUES($1,$2,'합성 지원자','fresh-reference@fixture.invalid')", [submission, form]);
      await session.query("INSERT INTO public.application_answers(submission_id,question_id,value) VALUES($1,$2,'합성 답변')", [submission, question]);
      await session.query("SELECT public.assert_application_form_questions_revision($1,0)", [form]);
      await rejects(session, "SELECT public.assert_application_form_questions_revision($1,1)", [form], "P0001");
      await rejects(session, "SELECT public.save_application_form_questions($1,1,'[]'::jsonb)", [form], "P0001");
      await rejects(session, "DELETE FROM public.application_forms WHERE id=$1", [form], "23503");
      await session.query("SAVEPOINT deferred_answer");
      await session.query("DELETE FROM public.application_questions WHERE id=$1", [question]);
      await rejects(session, "SET CONSTRAINTS application_answers_question_id_application_questions_id_fk IMMEDIATE", [], "23503");
      await session.query("ROLLBACK TO SAVEPOINT deferred_answer"); await session.query("RELEASE SAVEPOINT deferred_answer");
      ensure((await session.query("SELECT count(*)=1 AS ok FROM public.application_answers WHERE submission_id=$1", [submission])).rows[0].ok, "FRESH_ANSWER_PRESERVED");
      await session.query("INSERT INTO public.markdown_image_assets(url) VALUES('synthetic-reference-token')");
      await session.query("INSERT INTO public.notices(title,content) VALUES('합성 참조','본문 synthetic-reference-token 후문')");
      ensure((await session.query("SELECT count(*)=1 AS ok FROM public.markdown_image_references r JOIN public.markdown_image_assets a ON a.id=r.asset_id WHERE a.url='synthetic-reference-token' AND r.source_type='notices'")).rows[0].ok, "FRESH_MARKDOWN_REFERENCE_PRESENT");
    });
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("rate-limit 예약 상한·해제와 SQL287의 잘못된 기존 index 거부를 검증한다", async () => {
    await rollback(session, async () => {
      const reserve = "SELECT * FROM public.reserve_rate_limit(ARRAY['fresh-reference'],ARRAY[repeat('b',64)],ARRAY[1],ARRAY[60])";
      const first = (await session.query(reserve)).rows[0]; ensure(first.allowed, "FRESH_RESERVATION_ALLOWED");
      const second = (await session.query(reserve)).rows[0]; ensure(!second.allowed && second.retry_after_sec > 0 && second.reservation_id === null, "FRESH_RESERVATION_LIMITED");
      await session.query("DELETE FROM public.rate_limit_events WHERE reservation_id=$1", [first.reservation_id]);
      ensure((await session.query(reserve)).rows[0].allowed, "FRESH_RESERVATION_RELEASED");
    });
    const index = (await session.query("SELECT pg_catalog.pg_get_indexdef(indexrelid)='CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events USING btree (reservation_id)' AND indisvalid AND indisready AND indislive AS ok FROM pg_catalog.pg_index WHERE indexrelid='public.idx_rate_limit_reservation_id'::regclass")).rows[0];
    ensure(index.ok, "FRESH_RESERVATION_INDEX_EXACT");
    await session.query("BEGIN");
    try {
      await session.query("DROP INDEX public.idx_rate_limit_reservation_id; CREATE INDEX idx_rate_limit_reservation_id ON public.rate_limit_events(key_hash)");
      let code;
      try { await session.query(readFileSync(new URL("../../scripts/migrate-287-rate-limit-reservation-index.sql", import.meta.url), "utf8")); } catch (error) { code = error.code; }
      assert.equal(code, "P0001", "FRESH_SQL287_MALFORMED_INDEX_REJECTED");
    } finally { await session.query("ROLLBACK"); }
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("G1 공개 snapshot·업로드 검증·최종 제출 재실행·파일 접근 감사 불변을 실제 합성 데이터로 확인한다", async () => {
    await rollback(session, async () => {
      for (const actor of Object.values(academicG1Actors)) await session.query("INSERT INTO public.users(id,name,email,role) VALUES($1,'합성 학생',$2,$3)", [actor.id, actor.email, actor.role]);
      await session.query("INSERT INTO public.cohorts(id,name) VALUES($1,'합성 기수 가'),($2,'합성 기수 나')", [academicG1Ids.cohortA, academicG1Ids.cohortB]);
      // 기존 seed는 SQL 문장만 수집한 뒤 동일한 operator pinned session에서 순차 실행한다.
      const seed = []; seedAcademicG1Domain({ sql: text => seed.push(text) });
      for (const text of seed) await session.query(text);
      const before = Number((await session.query("SELECT count(*) AS count FROM public.assignment_targets WHERE assignment_id=$1", [academicG1Ids.active])).rows[0].count);
      await session.query("SELECT public.publish_academic_assignment($1,$2)", [academicG1Ids.active, academicG1Actors.manager.id]);
      assert.equal(Number((await session.query("SELECT count(*) AS count FROM public.assignment_targets WHERE assignment_id=$1", [academicG1Ids.active])).rows[0].count), before);
      // 계정 미연결 학생도 유효 학적이면 공개 snapshot에는 포함되며 제출 인가는 별도로 거부한다.
      ensure(before === 3, "FRESH_G1_TARGET_SNAPSHOT");
      const target = (await session.query("SELECT t.id FROM public.assignment_targets t JOIN public.cohort_enrollments e ON e.id=t.enrollment_id WHERE t.assignment_id=$1 AND e.student_id=$2", [academicG1Ids.active, academicG1Ids.studentA])).rows[0].id;
      const request = "d0000000-0000-4000-8000-000000000001";
      const key = "d0000000-0000-4000-8000-000000000002";
      const intent = (await session.query("SELECT public.issue_academic_assignment_upload($1,$2,$3,'synthetic.pdf',16) AS id", [request, target, academicG1Actors.studentA.id])).rows[0].id;
      await session.query("SELECT public.authorize_academic_assignment_upload($1,$2)", [intent, academicG1Actors.studentA.id]);
      await session.query("SELECT public.verify_authorized_academic_upload($1,$2,repeat('a',64),'synthetic-etag')", [intent, academicG1Actors.studentA.id]);
      const params = [target, academicG1Actors.studentA.id, intent, key];
      const result = (await session.query("SELECT public.complete_academic_assignment_submission($1,$2,$3,$4,true) AS result", params)).rows[0].result;
      const replay = (await session.query("SELECT public.complete_academic_assignment_submission($1,$2,$3,$4,true) AS result", params)).rows[0].result;
      ensure(!result.replayed && replay.replayed && replay.submissionId === result.submissionId, "FRESH_G1_FINALIZE_REPLAY");
      await session.query("SET CONSTRAINTS ALL IMMEDIATE");
      await session.query("INSERT INTO public.academic_submission_file_reads(actor_user_id,submission_id,file_id,access_scope) VALUES($1,$2,$3,'OWNER')", [academicG1Actors.studentA.id, result.submissionId, result.file.fileId]);
      await rejects(session, "UPDATE public.academic_submission_file_reads SET access_scope='MANAGEMENT'", [], "P0001");
      await rejects(session, "DELETE FROM public.academic_submission_file_reads", [], "P0001");
    });
    assert.equal((await collectLocalCatalog(session)).digest, baseline);
  });

  await t.test("서로 다른 소유 DB와 OID에서도 사전 prefix 전체 지문이 동일하다", async () => {
    const independent = await createFreshReference({ postgresBin });
    try {
      assert.equal(independent.contracts.length, reference.contracts.length);
      for (const [index, expected] of reference.contracts.entries()) {
        assert.equal(independent.contracts[index].digest, expected.digest, "FRESH_INDEPENDENT_PREFIX_EQUIVALENT");
        ensure(JSON.stringify(independent.contracts[index].counts) === JSON.stringify(expected.counts), "FRESH_INDEPENDENT_COUNTS_EQUIVALENT");
      }
    } finally {
      await independent.close(); const evidence = independent.evidence();
      ensure(evidence.cleanupComplete && evidence.clusterRemoved && evidence.activeSessions === 0 && evidence.activeSockets === 0, "FRESH_INDEPENDENT_CLEANUP_COMPLETE");
    }
  });
});
