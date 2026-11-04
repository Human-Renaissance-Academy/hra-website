/**
 * 전체 웹 export와 검토된 기존 SQL을 소유 로컬 비슈퍼유저 세션에 설치하는 독립 reference다.
 * 후보 engine/manifest를 실행하지 않으며 raw SQL·함수/ACL·합성 자료는 반환하지 않는다.
 * prefix catalog는 독립 객체 검사·동작 probe·원복하는 mutation을 통과한 뒤 고정한다.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createOwnedLocalFactory } from "./db-migration-local-adapter.mjs";
import { collectLocalCatalog } from "./db-migration-catalog.mjs";
import { exportQaSchemaSql } from "./qa-schema-export.mjs";
import { academicG1Migrations } from "./academic-g1-fixture.mjs";
import { localMigrationBootstrapSql } from "../../scripts/_lib/db-migration-local-engine.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const applyPath = "SET search_path TO public, pg_catalog";
const observePath = "SET search_path TO pg_catalog, public";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const ensure = (value, code) => { if (!value) throw Object.assign(new Error(code), { code }); };
const freeze = value => {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};

// 실행 가능한 원문 경로만 고정한다. SHA/path의 정본은 기존 inventory에서 가져온다.
const customSources = [
  "scripts/migrate-protect-application-answers.sql", "scripts/migrate-protect-application-submissions.sql",
  "scripts/migrate-atomic-application-questions.sql", "scripts/migrate-assert-application-question-revision.sql",
  "scripts/sql/rate-limit-reservations.sql", "scripts/sql/markdown-image-references.sql",
  "scripts/migrate-287-rate-limit-reservation-index.sql",
  "scripts/migrate-mobile-sessions.sql",
];
// 원본 REVOKE를 실제로 검토한 함수만 검사한다. 모든 함수가 PUBLIC revoke라고 가정하지 않는다.
const revokedFunctions = [
  "public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid)",
  "public.assert_academic_submission_owner(uuid,uuid,boolean)",
  "public.verify_academic_assignment_upload(uuid,uuid,text,text,integer,text)",
  "public.finalize_academic_assignment_submission(uuid,uuid,uuid,uuid)",
  "public.issue_academic_assignment_upload(uuid,uuid,uuid,text,integer)",
  "public.authorize_academic_assignment_upload(uuid,uuid)",
  "public.verify_authorized_academic_upload(uuid,uuid,text,text)",
  "public.cancel_academic_assignment_upload(uuid,uuid,uuid)",
  "public.claim_academic_upload_cleanup(uuid)",
  "public.complete_academic_assignment_submission(uuid,uuid,uuid,uuid,boolean)",
];

/** 경로·원문 bytes를 inventory와 검증하며 MJS 모듈을 import하거나 실행하지 않는다. */
function prepareSources() {
  const inventory = JSON.parse(readFileSync(join(repository, "scripts/db/source-inventory.json"), "utf8"));
  const installation = JSON.parse(readFileSync(join(repository, "scripts/db/installation-contract.json"), "utf8"));
  const paths = [...academicG1Migrations.map(name => `scripts/${name}`), ...customSources];
  const sources = paths.map((path, index) => {
    const entry = inventory.sql.find(row => row.path === path);
    const bytes = readFileSync(join(repository, path));
    ensure(entry && entry.sha256 === digest(bytes) && installation.sources.some(row => row.ref === path), "FRESH_SOURCE_INVENTORY_MISMATCH");
    return { id: entry.id ?? `custom-${index + 1}`, path, sql: bytes.toString("utf8"), authorityDigest: entry.sha256, repeats: 2 };
  });
  const singletonPath = "scripts/migrate-recruitment-singleton.mjs";
  const singleton = inventory.scripts.find(row => row.path === singletonPath);
  ensure(singleton && singleton.sha256 === digest(readFileSync(join(repository, singletonPath))), "FRESH_SINGLETON_SOURCE_MISMATCH");
  const sql = exportQaSchemaSql(repository);
  const schemaFiles = readdirSync(join(repository, "src/lib/db")).filter(name => name.endsWith(".ts")).sort();
  const schemaDigest = digest(JSON.stringify(schemaFiles.map(name => [name, digest(readFileSync(join(repository, "src/lib/db", name)))])));
  const tool = JSON.parse(readFileSync(join(repository, "node_modules/drizzle-kit/package.json"), "utf8"));
  ensure(tool.version === "0.31.10", "FRESH_EXPORT_TOOL_REVIEW_REQUIRED");
  return { installation, steps: [
    { id: "schema-export", path: "schema-export", sql, authorityDigest: schemaDigest, repeats: 1 }, ...sources,
    // 기본행만 원본 효과대로 재현하며 관리자가 편집할 콘텐츠는 만들지 않는다.
    { id: "recruitment-default", path: singletonPath,
      sql: "INSERT INTO public.recruitment_settings(singleton_key) VALUES (1) ON CONFLICT (singleton_key) DO NOTHING",
      authorityDigest: singleton.sha256, repeats: 2 },
  ], provenance: { toolVersion: tool.version, schemaDigest, exportDigest: digest(sql),
    exportCommand: "drizzle-kit export --dialect postgresql --schema ./src/lib/db/schema.ts",
    // 원본/후보 등록 수와 실제 실행한 raw SQL 수를 분리한다. 읽기 전용 preflight는 실행하지 않는다.
    inventoryLegacySqlSourceCount: inventory.sql.filter(entry => entry.role !== "fresh_candidate").length,
    inventoryCandidateSqlSourceCount: inventory.sql.filter(entry => entry.role === "fresh_candidate").length,
    inventoryTotalSqlSourceCount: inventory.sql.length, rawSqlSourceCount: sources.length,
    generatedExportCount: 1, handcraftedSqlCount: 1 } };
}

/** 이름/타입의 존재를 설치 대응표에서 검사하되 catalog의 관측 hash 자체를 기대값으로 쓰지 않는다. */
async function assertObjects(session, installation, installed) {
  let count = 0;
  for (const object of installation.objects.filter(row => installed.has(row.owner))) {
    if (["data-effect", "external-effect", "inspection"].includes(object.kind)) continue;
    for (const name of object.names) {
      const parts = name.split("."); let sql, values;
      if (object.kind === "function-set") {
        sql = "SELECT to_regprocedure($1) IS NOT NULL AS ok"; values = [name];
      } else if (object.kind === "type-set") {
        sql = "SELECT to_regtype($1) IS NOT NULL AS ok"; values = [name];
      } else if (object.kind === "column" || (object.kind === "constraint-set" && parts.length === 3)) {
        sql = "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass($1) AND attname=$2 AND attnum>0 AND NOT attisdropped) AS ok";
        values = [parts.slice(0, 2).join("."), parts[2]];
      } else if (object.kind === "constraint-set") {
        sql = "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_namespace n ON n.oid=k.connamespace WHERE n.nspname=$1 AND k.conname=$2) AS ok";
        values = parts;
      } else if (object.kind === "trigger-set") {
        sql = "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND t.tgname=$2 AND t.tgenabled='O') AS ok";
        values = parts;
      } else {
        ensure(["table-set", "index-set", "view"].includes(object.kind), "FRESH_OBJECT_KIND_UNSUPPORTED");
        const kinds = { "table-set": ["r", "p"], "index-set": ["i", "I"], view: ["v"] };
        sql = "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=to_regclass($1) AND relkind::text=ANY($2::text[])) AS ok";
        values = [name, kinds[object.kind]];
      }
      ensure((await session.query(sql, values)).rows[0]?.ok === true, "FRESH_EXPECTED_OBJECT_MISSING"); count++;
    }
  }
  return count;
}

/** 테스트와 후속 대조가 같은 고정 대응표의 객체 종류를 읽기 전용으로 재검증할 수 있다. */
export async function assertFreshReferenceObjects(session) {
  const installation = JSON.parse(readFileSync(join(repository, "scripts/db/installation-contract.json"), "utf8"));
  return assertObjects(session, installation, new Set(["schema-export", ...academicG1Migrations.map(name => `scripts/${name}`), ...customSources]));
}

/** owner/ACL/SECURITY/search_path/index/trigger/RLS를 원문을 반환하지 않는 boolean으로 확인한다. */
async function assertCommon(session) {
  const row = (await session.query(`SELECT
    current_user='hra_migration_operator' AND NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS non_super,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','hra_migrations')
      AND n.nspowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS schemas,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','hra_migrations') AND c.relowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS owners,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','hra_migrations') AND (p.proowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user) OR p.prosecdef)) AS functions,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_type y JOIN pg_catalog.pg_namespace n ON n.oid=y.typnamespace
      WHERE n.nspname IN ('public','hra_migrations') AND y.typowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)) AS types,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND CASE WHEN p.proname IN ('save_application_form_questions','assert_application_form_questions_revision') THEN p.proconfig IS NOT NULL
        WHEN p.proname='reserve_rate_limit' THEN p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
        ELSE p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[] END) AS function_paths,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','hra_migrations') AND NOT(i.indisvalid AND i.indisready AND i.indislive)) AS indexes,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND (c.relrowsecurity OR c.relforcerowsecurity)) AS rls,
    NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgenabled<>'O') AS triggers,
    (SELECT count(*)=0 FROM hra_migrations.applied_migrations) AS empty_ledger`)).rows[0];
  ensure(Object.values(row).every(value => value === true), "FRESH_COMMON_CONTRACT_FAILED");
  for (const signature of revokedFunctions) {
    ensure((await session.query(`SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p,
      LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE p.oid=to_regprocedure($1) AND a.grantee=0 AND a.privilege_type='EXECUTE') AS ok`, [signature])).rows[0].ok, "FRESH_PUBLIC_EXECUTE_EXPOSED");
  }
}

/** 기대 오류도 savepoint로 원복하여 이후 관측에 실패 transaction을 남기지 않는다. */
async function expectSqlState(session, text, values, expected) {
  await session.query("SAVEPOINT fresh_expected"); let code;
  try { await session.query(text, values); } catch (error) { code = error.code; }
  await session.query("ROLLBACK TO SAVEPOINT fresh_expected");
  await session.query("RELEASE SAVEPOINT fresh_expected");
  ensure(code === expected, "FRESH_BEHAVIOR_REJECTION_MISSING");
}

/** 각 원본 prefix의 최소 동작 검증은 모두 rollback하여 합성 행을 catalog 계약과 분리한다. */
async function assertStepBehavior(session, id) {
  await session.query("BEGIN"); let checks = 0;
  try {
    if (id === "g1-students") {
      ensure((await session.query("SELECT array_agg(enumlabel::text ORDER BY enumsortorder)=ARRAY['ENROLLED']::text[] AS ok FROM pg_catalog.pg_enum WHERE enumtypid='public.enrollment_status'::regtype")).rows[0].ok, "FRESH_ENROLLMENT_ENUM_MISMATCH"); checks++;
    } else if (id === "g1-enrollment-links") {
      await expectSqlState(session, "SELECT public.apply_academic_enrollment_links(NULL,NULL,'{}'::jsonb)", [], "P0001"); checks++;
    } else if (id === "g1-roster") {
      await expectSqlState(session, "SELECT public.register_academic_roster(NULL,NULL,NULL,NULL,NULL,NULL,NULL)", [], "P0001"); checks++;
    } else if (id === "g1-submissions") {
      await expectSqlState(session, "SELECT public.assert_academic_submission_owner(NULL,NULL,true)", [], "P0001"); checks++;
    } else if (id === "g1-assignment-actions") {
      await expectSqlState(session, "SELECT public.mutate_academic_assignment(NULL,NULL,NULL,NULL,NULL,'{}'::jsonb)", [], "HRA07"); checks++;
    } else if (id === "g1-upload-authorizations") {
      await expectSqlState(session, "SELECT public.issue_academic_assignment_upload(NULL,NULL,NULL,NULL,NULL)", [], "P0001"); checks++;
    } else if (id === "g1-submission-finalization") {
      await expectSqlState(session, "SELECT public.complete_academic_assignment_submission(NULL,NULL,NULL,NULL,true)", [], "SUB02"); checks++;
    } else if (id === "recruitment-default") {
      const row = (await session.query("SELECT count(*)::integer AS total,count(*) FILTER(WHERE singleton_key=1 AND recruitment_status='UPCOMING' AND qualification_text IS NULL AND details_markdown IS NULL)::integer AS defaults FROM public.recruitment_settings")).rows[0];
      ensure(row.total === 1 && row.defaults === 1, "FRESH_RECRUITMENT_DEFAULT_INVALID");
      await session.query("UPDATE public.recruitment_settings SET details_markdown='합성 편집 보존'");
      await session.query("INSERT INTO public.recruitment_settings(singleton_key) VALUES(1) ON CONFLICT(singleton_key) DO NOTHING");
      ensure((await session.query("SELECT details_markdown='합성 편집 보존' AS ok FROM public.recruitment_settings")).rows[0].ok, "FRESH_RECRUITMENT_CONTENT_REPLACED");
      await expectSqlState(session, "INSERT INTO public.recruitment_settings(singleton_key) VALUES(2)", [], "23514"); checks += 3;
    }
  } finally { await session.query("ROLLBACK"); }
  return checks;
}

// prefix마다 하나의 독립적 catalog 변경을 가하고 rollback 후 원래 지문이 복구되는지 확인한다.
function mutationFor(step, index) {
  if (step.id === "bootstrap") return "ALTER TABLE hra_migrations.applied_migrations ADD COLUMN reference_canary integer";
  if (step.id === "schema-export") return "ALTER TABLE public.alumni_stories ALTER COLUMN is_featured SET DEFAULT true";
  if (step.id === "g1-roster") return "GRANT EXECUTE ON FUNCTION public.register_academic_roster(uuid,uuid,uuid,uuid,text,text,uuid) TO PUBLIC";
  if (step.path === "scripts/migrate-protect-application-answers.sql") return "ALTER TABLE public.application_answers ALTER CONSTRAINT application_answers_question_id_application_questions_id_fk NOT DEFERRABLE";
  if (step.path === "scripts/sql/markdown-image-references.sql") return "CREATE OR REPLACE VIEW public.markdown_image_references AS SELECT id AS asset_id,'mutation'::text AS source_type,id AS source_id FROM public.markdown_image_assets";
  if (step.path === "scripts/migrate-287-rate-limit-reservation-index.sql") return "DROP INDEX public.idx_rate_limit_reservation_id";
  if (step.id === "g1-assignments") return "ALTER TABLE public.assignments DISABLE TRIGGER academic_assignment_guard";
  // 일반 prefix도 ledger 구조 변경이 whole-scope 지문에서 검출돼야 한다.
  return `ALTER TABLE hra_migrations.applied_migrations ADD COLUMN reference_canary_${index} integer`;
}

/** 고정된 로컬 원본 설치만 수행한다. 임의 SQL/target/factory/callback 입력을 받지 않는다. */
export async function createFreshReference(options = {}) {
  ensure(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => key === "postgresBin"), "FRESH_REFERENCE_OPTIONS_INVALID");
  let prepared;
  try { prepared = prepareSources(); }
  catch (error) { const code = /^FRESH_[A-Z_]+$/.test(error.code ?? "") ? error.code : "FRESH_REFERENCE_SOURCE_PREPARE_FAILED"; throw Object.assign(new Error(code), { code }); }
  const factory = createOwnedLocalFactory({ postgresBin: options.postgresBin });
  let session, phase = 0; const contracts = [], prefixes = []; const installed = new Set();
  const checks = { objects: 0, behaviors: 0, mutations: 0, immediateReplays: 0, physicalBackend: true, scopePrivate: false };
  try {
    // 다른 작업자의 root를 수정하지 않고 marker가 일치하는 이 factory의 권한만 확인한다.
    for (const name of readdirSync("/dev/shm").filter(name => name.startsWith("hra-migration-local-"))) {
      const root = join("/dev/shm", name); let owner;
      try { owner = JSON.parse(readFileSync(join(root, "owner.json"), "utf8")); } catch { continue; }
      if (owner.processId === process.pid && owner.scopeId === factory.expectedIdentity.scopeId) checks.scopePrivate = (statSync(root).mode & 0o777) === 0o700;
    }
    ensure(checks.scopePrivate, "FRESH_OWNED_SCOPE_PERMISSIONS_INVALID");
    session = await factory.open(); const identity = await session.identity();
    await session.query("SET statement_timeout TO '20s'"); await session.query("SET lock_timeout TO '5s'");
    const steps = [{ id: "bootstrap", path: "bootstrap", sql: localMigrationBootstrapSql,
      authorityDigest: digest(readFileSync(join(repository, "scripts/_lib/db-migration-local-engine.mjs"))), repeats: 1 }, ...prepared.steps];
    for (const [index, step] of steps.entries()) {
      phase = index;
      for (let repeat = 0; repeat < step.repeats; repeat++) {
        await session.query(applyPath);
        if (step.path === "scripts/migrate-287-rate-limit-reservation-index.sql") {
          ensure((await session.query("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.rate_limit_events'::regclass AND attname='reservation_id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped) AS ok")).rows[0].ok, "FRESH_RESERVATION_UUID_REQUIRED");
        }
        await session.query(step.sql);
        if (repeat > 0) checks.immediateReplays++;
      }
      await session.query(observePath);
      ensure((await session.identity()).backendId === identity.backendId, "FRESH_PHYSICAL_BACKEND_CHANGED");
      installed.add(step.path);
      checks.objects += await assertObjects(session, prepared.installation, installed);
      await assertCommon(session);
      checks.behaviors += await assertStepBehavior(session, step.id);
      const before = await collectLocalCatalog(session);
      await session.query("BEGIN");
      try {
        await session.query(mutationFor(step, index));
        ensure((await collectLocalCatalog(session)).digest !== before.digest, "FRESH_CATALOG_MUTATION_UNDETECTED");
      } finally { await session.query("ROLLBACK"); }
      ensure((await collectLocalCatalog(session)).digest === before.digest, "FRESH_MUTATION_ROLLBACK_DRIFT");
      checks.mutations++;
      contracts.push(freeze(before));
      prefixes.push(freeze({ id: step.id, sequence: index, source: step.path,
        // 원천 파일/스키마의 권위 hash와 실제 실행한 SQL bytes의 hash를 구분한다.
        authorityDigest: step.authorityDigest, executedSqlDigest: digest(step.sql),
        digest: before.digest, counts: before.counts, executions: step.repeats }));
    }
    await session.close(); session = null;
    const report = freeze({ contracts, prefixes, checks, provenance: prepared.provenance,
      readiness: { referenceComplete: true, freshReady: false, productionReady: false,
        unresolved: ["CANDIDATE_BUNDLE_NOT_COMPARED", "S3A_REQUIRED_COVERAGE_UNRESOLVED", "FULL_BEHAVIOR_AND_RECOVERY_GATES_PENDING"] } });
    return Object.freeze({ ...report, open: () => factory.open(), close: () => factory.close(), evidence: () => factory.evidence() });
  } catch (error) {
    let cleanupComplete = true;
    try { await session?.close(); } catch { cleanupComplete = false; }
    try { await factory.close(); } catch { cleanupComplete = false; }
    // 원본 error/cause/SQL은 전파하지 않고 고정 코드·prefix 번호·SQLSTATE만 남긴다.
    const code = typeof error.code === "string" && /^FRESH_[A-Z_]+$/.test(error.code) ? error.code : "FRESH_REFERENCE_INSTALL_FAILED";
    throw Object.assign(new Error(code), { code, phase, sqlstate: /^[0-9A-Z]{5}$/.test(error.code ?? "") ? error.code : null, cleanupComplete });
  }
}
