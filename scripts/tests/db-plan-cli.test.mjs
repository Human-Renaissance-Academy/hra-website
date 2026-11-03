/**
 * 계획 전용 DB CLI의 직접 실행·npm 별칭·모듈 import 경계를 실제 자식 프로세스로 검증합니다.
 * DB 드라이버와 자격정보 조회, SQL 읽기·외부 통신·추가 프로세스 실행을 계수하면서 차단합니다.
 * 합성 값만 전달하며 운영 환경 파일·DB·네트워크를 사용하지 않습니다.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";

// npm 별칭도 저장소의 실제 명령을 그대로 사용하되 환경 파일이 없는 별도 디렉터리에서 실행합니다.
const repository = fileURLToPath(new URL("../../", import.meta.url));
const targets = [
  { name: "질문", script: "scripts/migrate-atomic-application-questions.mjs", alias: "db:migrate-atomic-application-questions", prefix: "ATOMIC_QUESTION_INSTALLER" },
  { name: "Markdown 이미지", script: "scripts/migrate-add-markdown-image-assets.mjs", alias: "db:migrate-add-markdown-image-assets", prefix: "MARKDOWN_IMAGE_INSTALLER" },
  { name: "모집설정", script: "scripts/migrate-recruitment-singleton.mjs", alias: "db:migrate-recruitment-singleton", prefix: "RECRUITMENT_INSTALLER" },
  { name: "지원서 중복 제약", script: "scripts/migrate-add-application-submissions-unique.mjs", alias: "db:migrate-add-application-unique", prefix: "APPLICATION_UNIQUE_INSTALLER" },
  { name: "기존 요청 제한 로그", script: "scripts/migrate-add-rate-limit-tables.mjs", alias: "db:migrate-add-rate-limit-tables", prefix: "LEGACY_RATE_TABLE_INSTALLER" },
  { name: "기수 선언", script: "scripts/seed-cohorts.mjs", alias: "seed-cohorts", prefix: "COHORT_SEED", declaredCount: 19 },
];
const commands = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")).scripts;
const syntheticUrl = "postgresql://atomic-only:atomic-credential-sentinel@atomic-qa.invalid/atomic_only";
const unsafeMarker = "ATOMIC_PRIVATE_URL_SQL_SENTINEL";
const emptyCounts = { dbImports: 0, dbClients: 0, credentialReads: 0, network: 0, processCalls: 0, sqlReads: 0 };
// 기수 선언의 필드 이름·타입만 고정합니다. 실제 이름·내용·날짜 값은 결과나 실패 메시지에 넣지 않습니다.
const cohortFieldTypes = [["name", "string"], ["startDate", "string"], ["endDate", "string"], ["description", "string"], ["isActive", "boolean"], ["order", "number"], ["recruitmentStatus", "string"]];

/** 네트워크를 열기 전에 실패시키며 원문을 기록하지 않는 preload와 실행 경로를 만듭니다. */
function sandbox(t, target = targets[0]) {
  const { script, alias } = target;
  const root = mkdtempSync(join(tmpdir(), "hra-db-plan-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(repository, script), join(root, script));
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, scripts: { [alias]: commands[alias] } }));
  const capture = join(root, "counts.json");
  const importCompletion = join(root, "import-completed.json");
  const preload = join(root, "preload.mjs");
  const npmUserConfig = join(root, "user.npmrc");
  const npmGlobalConfig = join(root, "global.npmrc");
  writeFileSync(npmUserConfig, "");
  writeFileSync(npmGlobalConfig, "");
  writeFileSync(preload, `
import fs from 'node:fs';
import net from 'node:net';import tls from 'node:tls';
import http from 'node:http';import https from 'node:https';import dns from 'node:dns';
import childProcess from 'node:child_process';
import {registerHooks,syncBuiltinESMExports} from 'node:module';
// npm 부모의 통신도 막지만 자격정보 계수·결과 파일은 실제 명령 자식에만 적용합니다.
const counts=${JSON.stringify(emptyCounts)};
const deny=()=>{counts.network++;throw new Error(${JSON.stringify(unsafeMarker)})};
net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;tls.connect=deny;
http.request=deny;http.get=deny;https.request=deny;https.get=deny;dns.lookup=deny;dns.resolve=deny;
globalThis.fetch=async()=>deny();globalThis.WebSocket=class{constructor(){deny()}};
syncBuiltinESMExports();
if(!['npm','npm-cli.js'].includes((process.argv[1]??'').split('/').at(-1))){
 process.on('exit',()=>fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify(counts),{mode:0o600}));
 for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']){
  childProcess[name]=()=>{counts.processCalls++;throw new Error(${JSON.stringify(unsafeMarker)})};
 }
 const originalRead=fs.readFileSync;
 fs.readFileSync=(file,...args)=>{
  if(String(file).endsWith('.sql')){counts.sqlReads++;throw new Error(${JSON.stringify(unsafeMarker)})}
  return originalRead(file,...args);
 };
 const originalAsyncRead=fs.promises.readFile;
 fs.promises.readFile=async(file,...args)=>{
  if(String(file).endsWith('.sql')){counts.sqlReads++;throw new Error(${JSON.stringify(unsafeMarker)})}
  return originalAsyncRead(file,...args);
 };
 syncBuiltinESMExports();
 const environment=process.env;
 process.env=new Proxy(environment,{get(target,key){
  if(typeof key==='string'&&(key==='DATABASE_URL'||key.startsWith('PG')||key==='HRA_DB_APPLY_ALLOWED'||key==='HRA_DB_APPROVAL')){
   counts.credentialReads++;throw new Error(${JSON.stringify(unsafeMarker)});
  }
  return Reflect.get(target,key);
 }});
 globalThis.__atomicCliCounts=counts;
 const sdk='export function neon(){globalThis.__atomicCliCounts.dbClients++;throw new Error('+JSON.stringify(${JSON.stringify(unsafeMarker)})+')}';
 registerHooks({resolve(specifier,context,next){
  if(specifier==='@neondatabase/serverless'){
   counts.dbImports++;return {url:'data:text/javascript,'+encodeURIComponent(sdk),shortCircuit:true};
  }
  if(['pg','postgres','postgres-pool'].includes(specifier)){
   counts.dbImports++;throw new Error(${JSON.stringify(unsafeMarker)});
  }
  return next(specifier,context);
 }});
}
`, { mode: 0o600 });
  const environment = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: root,
    NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`,
    npm_config_userconfig: npmUserConfig, npm_config_globalconfig: npmGlobalConfig,
    npm_config_cache: join(root, "npm-cache"), npm_config_update_notifier: "false",
    DATABASE_URL: syntheticUrl, PGPASSWORD: "atomic-credential-sentinel",
  };

  /** 원문을 assertion 메시지에 붙이지 않고 종료 상태·고정 코드·정제된 계수만 반환합니다. */
  function run(args = [], { mode = "direct", env = {} } = {}) {
    rmSync(capture, { force: true });
    rmSync(importCompletion, { force: true });
    let program = process.execPath;
    let parameters = [join(root, script), ...args];
    if (mode === "npm") {
      program = "npm";
      parameters = ["--offline", "--silent", "run", alias, "--", ...args];
    } else if (mode === "import") {
      parameters = ["--input-type=module", "--eval", `
        const before=process.exitCode;
        await import(${JSON.stringify(pathToFileURL(join(root, script)).href)});
        (await import('node:fs')).writeFileSync(${JSON.stringify(importCompletion)},JSON.stringify({continued:true,exitCodeUnchanged:process.exitCode===before}));
      `];
    } else if (mode === "cohort-export") {
      parameters = ["--input-type=module", "--eval", `
        const before=process.exitCode;
        const data=(await import(${JSON.stringify(pathToFileURL(join(root, script)).href)})).cohortsData;
        const fields=${JSON.stringify(cohortFieldTypes)};
        const fixedShape=Array.isArray(data)&&data.every(row=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===fields.length&&fields.every(([key,type])=>Object.hasOwn(row,key)&&typeof row[key]===type));
        const jsonSha256=fixedShape?(await import('node:crypto')).createHash('sha256').update(JSON.stringify(data)).digest('hex'):null;
        (await import('node:fs')).writeFileSync(${JSON.stringify(importCompletion)},JSON.stringify({continued:true,exitCodeUnchanged:process.exitCode===before,declaredCount:Array.isArray(data)?data.length:null,fixedShape,jsonSha256}));
      `];
    } else if (mode === "canary") {
      parameters = ["--input-type=module", "--eval", `
        let blocked=0;
        try{process.env.DATABASE_URL}catch{blocked++}
        try{(await import('@neondatabase/serverless')).neon()}catch{blocked++}
        try{await fetch('https://atomic-qa.invalid')}catch{blocked++}
        try{(await import('node:child_process')).spawnSync('never-started')}catch{blocked++}
        try{(await import('node:fs')).readFileSync('never-read.sql')}catch{blocked++}
        if(blocked!==5)throw new Error('ATOMIC_CANARY_NOT_BLOCKED');
      `];
    }
    const result = spawnSync(program, parameters, {
      cwd: root, env: { ...environment, ...env }, encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024,
    });
    assert.equal(Boolean(result.error), false, "ATOMIC_CHILD_COMPLETED");
    assert.equal(existsSync(capture), true, "ATOMIC_GUARD_OBSERVED_CHILD");
    const output = result.stdout + result.stderr;
    for (const sentinel of [syntheticUrl, "atomic-credential-sentinel", unsafeMarker, "atomic-qa.invalid", "private-approval-sentinel"]) {
      assert.equal(output.includes(sentinel), false, "ATOMIC_OUTPUT_REDACTED");
    }
    const imported = existsSync(importCompletion) ? JSON.parse(readFileSync(importCompletion, "utf8")) : null;
    return { ...result, counts: JSON.parse(readFileSync(capture, "utf8")), imported };
  }
  return { root, run };
}

test("기수 선언의 원문·실제 export는 독립 고정 해시와 개수·필드 형식을 부작용 없이 보존한다", t => {
  const target = targets.find(item => item.alias === "seed-cohorts");
  assert.equal(Boolean(target), true, "COHORT_DECLARATION_TARGET_PRESENT");
  const source = readFileSync(join(repository, target.script), "utf8");
  const ast = ts.createSourceFile(target.script, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, "COHORT_DECLARATION_PARSEABLE");
  const declarations = [];
  // AST만 읽으며 기존 모듈을 실행하거나 기대 값을 실행 대상 export에서 만들지 않습니다.
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "cohortsData") declarations.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(declarations.length, 1, "COHORT_DECLARATION_UNIQUE");
  const initializer = declarations[0].initializer;
  assert.equal(Boolean(initializer && ts.isArrayLiteralExpression(initializer)), true, "COHORT_DECLARATION_ARRAY_LITERAL");
  assert.equal(createHash("sha256").update(initializer.getText(ast)).digest("hex"), "02891d6c408c5b2323f1281544436b79e6e1d1a8dd928f386e6cad4607f730ff", "COHORT_DECLARATION_LITERAL_HASH");
  assert.equal(initializer.elements.length, 19, "COHORT_DECLARED_COUNT");
  // 문자열·숫자·불리언 literal만 해석하고 호출·계산·전개식은 허용하지 않습니다.
  function primitive(node) {
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    assert.fail("COHORT_DECLARATION_PRIMITIVE_REQUIRED");
  }
  const declared = initializer.elements.map(row => {
    assert.equal(ts.isObjectLiteralExpression(row), true, "COHORT_DECLARATION_ROW_LITERAL");
    assert.equal(row.properties.length, 7, "COHORT_DECLARATION_FIELD_COUNT");
    return Object.fromEntries(row.properties.map((property, index) => {
      assert.equal(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name), true, "COHORT_DECLARATION_LITERAL_PROPERTY");
      const [key, type] = cohortFieldTypes[index];
      assert.equal(property.name.text === key, true, "COHORT_DECLARATION_FIELD_NAME");
      const value = primitive(property.initializer);
      assert.equal(typeof value === type, true, "COHORT_DECLARATION_FIELD_TYPE");
      return [key, value];
    }));
  });
  assert.equal(new Set(declared.map(row => row.name)).size, 19, "COHORT_DECLARATION_DISTINCT_KEYS");
  // 고정 JSON 해시는 기존 선언의 필드 순서로 직렬화한 값이며 원문 데이터 자체는 반환하지 않습니다.
  const expectedJsonSha256 = "4ccf99a8beee050fcdf04ac0cb714305cf5efb5fe4cedadf826ed2de925f2655";
  assert.equal(createHash("sha256").update(JSON.stringify(declared)).digest("hex"), expectedJsonSha256, "COHORT_DECLARATION_JSON_HASH");
  const fixture = sandbox(t, target);
  const result = fixture.run([], { mode: "cohort-export" });
  assert.equal(result.status, 0, "COHORT_EXPORT_IMPORTED");
  assert.equal(result.stdout.length, 0, "COHORT_EXPORT_NO_OUTPUT");
  assert.equal(result.stderr.length, 0, "COHORT_EXPORT_NO_ERROR_OUTPUT");
  assert.deepEqual(result.counts, emptyCounts);
  assert.deepEqual(result.imported, { continued: true, exitCodeUnchanged: true, declaredCount: 19, fixedShape: true, jsonSha256: expectedJsonSha256 });
  // 계획 응답에도 실제 선언의 문자열 값을 섞지 않습니다. 실패 때도 비교 결과만 기록합니다.
  const plan = fixture.run();
  assert.equal(plan.status, 0);
  assert.deepEqual(plan.counts, emptyCounts);
  for (const row of declared) {
    for (const value of Object.values(row).filter(item => typeof item === "string" && item.length > 0)) {
      assert.equal(plan.stdout.includes(value), false, "COHORT_PLAN_NO_DECLARATION_VALUE");
    }
  }
});

/** 차단기를 생략했거나 계수 파일이 사라져 0회로 오인하지 않는지 실제 자식으로 검증합니다. */
test("격리 canary는 DB import·클라이언트·자격정보·네트워크·프로세스·SQL 읽기를 탐지한다", t => {
  const result = sandbox(t).run([], { mode: "canary" });
  assert.equal(result.status, 0);
  assert.deepEqual(result.counts, { dbImports: 1, dbClients: 1, credentialReads: 1, network: 1, processCalls: 1, sqlReads: 1 });
});

for (const target of targets) {
  for (const mode of ["direct", "npm"]) {
    test(`${target.name}/${mode}: 환경 파일·자격정보가 없어도 무인자는 접속 없는 계획이다`, t => {
      const fixture = sandbox(t, target);
      assert.equal(existsSync(join(fixture.root, ".env")), false);
      const result = fixture.run([], { mode, env: { DATABASE_URL: "", PGPASSWORD: "" } });
      assert.equal(result.status, 0, "ATOMIC_PLAN_SUCCEEDED");
      assert.equal(result.stdout.includes(`[${target.prefix}_PLAN]`), true);
      if (target.declaredCount !== undefined) assert.equal(result.stdout.includes(`선언 항목 ${target.declaredCount}개`), true);
      assert.equal(result.stderr.length, 0);
      assert.deepEqual(result.counts, emptyCounts);
    });

    test(`${target.name}/${mode}: URL과 자체 승인 환경값이 있어도 무인자는 계획만 출력한다`, t => {
      const result = sandbox(t, target).run([], { mode, env: { HRA_DB_APPLY_ALLOWED: "true", HRA_DB_APPROVAL: '{"approved":"private-approval-sentinel"}' } });
      assert.equal(result.status, 0, "ATOMIC_PLAN_SUCCEEDED");
      assert.equal(result.stdout.includes(`[${target.prefix}_PLAN]`), true);
      if (target.declaredCount !== undefined) assert.equal(result.stdout.includes(`선언 항목 ${target.declaredCount}개`), true);
      assert.equal(result.stderr.length, 0);
      assert.deepEqual(result.counts, emptyCounts);
    });

    test(`${target.name}/${mode}: 동의 인자만으로 신뢰되지 않은 대상에 적용할 수 없다`, t => {
      const fixture = sandbox(t, target);
      for (const env of [{}, { HRA_DB_APPLY_ALLOWED: "true", HRA_DB_APPROVAL: '{"approved":"private-approval-sentinel"}', VERCEL_ENV: "development" }]) {
        const result = fixture.run(["--confirm-apply"], { mode, env });
        assert.equal(result.status, 1);
        assert.equal(result.stdout.length, 0);
        assert.equal(result.stderr.includes(`[${target.prefix}_TARGET_UNTRUSTED]`), true);
        assert.deepEqual(result.counts, emptyCounts);
      }
    });

    test(`${target.name}/${mode}: 알 수 없는·중복·URL·자체 승인 인자는 원문 없이 접속 전에 거부한다`, t => {
      const fixture = sandbox(t, target);
      for (const args of [
        ["--apply"], ["--confirm-apply", "--confirm-apply"], ["--confirm-apply", "--unknown"],
        ["--url", syntheticUrl], ["--confirm-apply", "--url", syntheticUrl],
        ["--confirm-apply", "--isolated"], ["--approval", '{"approved":"private-approval-sentinel"}'],
        ["--confirm-apply", "--approval", '{"approved":"private-approval-sentinel"}'], ["--help"],
      ]) {
        const result = fixture.run(args, { mode });
        assert.equal(result.status, 1);
        assert.equal(result.stdout.length, 0);
        assert.equal(result.stderr.includes(`[${target.prefix}_ARGUMENTS]`), true);
        assert.deepEqual(result.counts, emptyCounts);
      }
    });
  }

  test(`${target.name}: 모듈 import는 출력·종료·DB import·자격정보 조회 부작용이 없다`, t => {
    const result = sandbox(t, target).run([], { mode: "import" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.length, 0);
    assert.equal(result.stderr.length, 0);
    assert.deepEqual(result.counts, emptyCounts);
    assert.deepEqual(result.imported, { continued: true, exitCodeUnchanged: true });
  });
}
