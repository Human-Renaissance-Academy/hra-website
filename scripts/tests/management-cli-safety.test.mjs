/**
 * Kakao 바인딩·보호 Blob 관리 CLI를 실제 자식 프로세스와 소유 PostgreSQL에서 검증한다.
 * Neon 요청은 기존 격리 psql 전송으로 실행하고 Blob SDK만 합성 저장소로 대체한다.
 * 실제 환경 파일·운영 DB·외부 API를 사용하지 않으며 원문 응답은 assertion에 출력하지 않는다.
 * SDK 격리는 설치 Node 24의 공개 registerHooks/--import 계약을 사용한다.
 * https://nodejs.org/download/release/v24.14.0/docs/api/module.html#moduleregisterhooksoptions
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createQaPostgres } from "../../tests/support/resource-qa-postgres.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const transport = new URL("../../tests/support/neon-psql-transport.mjs", import.meta.url).href;
const pgBin = process.env.HRA_TEST_PG_BIN;
const options = { skip: !pgBin, timeout: 60_000 };
const publicUrl =
  "https://4sompt13gxwuz2x8.public.blob.vercel-storage.com/class-materials/cli-private-sentinel.pdf";
const privateHost = "management-qa.private.blob.vercel-storage.com";
const privateUrl = `https://${privateHost}/protected-migration/cli-private-sentinel.pdf`;
const privateToken = "management-private-token-sentinel";

/** 각 사례는 별도 cluster·TMPDIR를 소유하며 자식에게 운영 자격정보를 상속하지 않는다. */
function sandbox(t) {
  const cluster = createQaPostgres(pgBin);
  t.after(() => {
    cluster.close();
    assert.equal(existsSync(cluster.root), false, "MANAGEMENT_OWNED_CLUSTER_REMOVED");
  });
  const root = mkdtempSync(join(tmpdir(), "hra-management-cli-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const preload = join(root, "isolated-preload.mjs");
  const auditFile = join(root, "counts.json");
  // 생성하는 preload도 호출 횟수와 고정 이벤트만 기록한다. SQL·URL·바이트는 기록하지 않는다.
  writeFileSync(
    preload,
    `
import { writeFileSync } from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import net from 'node:net'; import tls from 'node:tls';
import http from 'node:http'; import https from 'node:https'; import dns from 'node:dns';
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from ${JSON.stringify(transport)};
const execute=createPsqlTransport(process.env);
const counts={db:0,write:0,blob:0,headPublic:0,headPrivate:0,put:0,get:0,delPublic:0,delPrivate:0,fetchPublic:0,network:0,sdkInvalid:0,events:[]};
globalThis.__managementCounts=counts;
process.on('exit',()=>writeFileSync(${JSON.stringify(auditFile)},JSON.stringify(counts),{mode:0o600}));
const deny=()=>{counts.network++;throw new Error('MANAGEMENT_EXTERNAL_DENIED')};
net.connect=deny; net.createConnection=deny; tls.connect=deny;
http.request=deny; http.get=deny; https.request=deny; https.get=deny;
dns.lookup=deny; dns.resolve=deny;
globalThis.WebSocket=class {constructor(){deny()}};
syncBuiltinESMExports();
const blobSource=${JSON.stringify(`
const count=globalThis.__managementCounts;
const publicUrl=${JSON.stringify(publicUrl)}, privateUrl=${JSON.stringify(privateUrl)};
const privateToken=${JSON.stringify(privateToken)}, publicToken='management-public-token-sentinel';
const guard=condition=>{if(!condition){count.sdkInvalid++;throw new Error('MANAGEMENT_SDK_ARGUMENTS_INVALID')}};
export async function head(url,options){
 count.blob++;
 if(url===publicUrl){guard(options?.token===publicToken);count.headPublic++;count.events.push('headPublic');return {url,size:16,contentType:'application/pdf',etag:'management-etag'}}
 guard(url===privateUrl&&options?.token===privateToken);count.headPrivate++;
 if(process.env.MANAGEMENT_MODE==='headFailure')throw new Error('cli-private-sentinel');
 if(process.env.MANAGEMENT_MODE==='headUndefined')return {url};
 if(process.env.MANAGEMENT_MODE==='headNaN')return {url,size:NaN};
 return {url,size:16};
}
export async function put(path,bytes,options){
 count.blob++;guard(/^protected-migration\\/class_materials\\/resource-1-[0-9a-f-]{36}[.]pdf$/.test(path)&&Buffer.from(bytes).equals(Buffer.from('SYNTHETIC_BYTES!'))&&options?.access==='private'&&options?.token===privateToken&&options?.contentType==='application/pdf');
 count.put++;count.events.push('putPrivate');return {url:privateUrl};
}
export async function get(url,options){
 count.blob++;guard(url===privateUrl&&options?.access==='private'&&options?.token===privateToken&&options?.storeId==='management-qa'&&options?.useCache===false);
 count.get++;count.events.push('getPrivate');return {statusCode:200,stream:new Response(process.env.MANAGEMENT_MODE==='copyMismatch'?'SYNTHETIC_BYTeS!':'SYNTHETIC_BYTES!').body};
}
export async function del(url,options){
 count.blob++;
 if(url===privateUrl){guard(options?.token===privateToken);count.delPrivate++;return}
 guard(url===publicUrl&&options?.token===publicToken&&options?.ifMatch==='management-etag');count.delPublic++;
}
`)};
registerHooks({resolve(specifier,context,next){if(specifier==='@vercel/blob')return {url:'data:text/javascript,'+encodeURIComponent(blobSource),shortCircuit:true};return next(specifier,context)}});
let raced=false;
globalThis.fetch=async(input,options={})=>{
 const url=input instanceof Request?input.url:String(input);
 if(url===qaNeonEndpoint){
  const headers=new Headers(options.headers);
  if(headers.get('Neon-Connection-String')!==qaDatabaseUrl||options.method!=='POST')return deny();
  const payload=JSON.parse(options.body);if(payload.queries)return deny();
  counts.db++;if(/^\\s*(?:DO|UPDATE|INSERT|DELETE|ALTER|CREATE)\\b/i.test(payload.query)){counts.write++;counts.events.push('dbWrite')}
  try{
   // CAS 직전의 별도 변경과 커밋 후 응답 손실을 실제 PostgreSQL 경계에서 합성한다.
   if(process.env.MANAGEMENT_MODE==='swapConflict'&&payload.query.includes('UPDATE class_materials')){
    await execute({query:"UPDATE class_materials SET file_url='https://management-qa.private.blob.vercel-storage.com/concurrent.pdf'"});
   }
   const result=await execute(payload);
   if(process.env.MANAGEMENT_MODE==='swapResponseLost'&&payload.query.includes('UPDATE class_materials')){
    throw new Error('MANAGEMENT_SYNTHETIC_RESPONSE_LOST');
   }
   if(process.env.MANAGEMENT_MODE==='lateReference'&&!raced&&payload.query.includes('FROM markdown_image_assets a')){
    raced=true;await execute({query:"INSERT INTO markdown_image_references(asset_id) VALUES ('asset-public')"});
   }
   return Response.json(result);
  }catch(error){if(error.message==='MANAGEMENT_SYNTHETIC_RESPONSE_LOST')throw error;return Response.json({message:'MANAGEMENT_LOCAL_QUERY_FAILED',code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'P0001'},{status:400})}
 }
 if(url===${JSON.stringify(publicUrl)}&&['copyMismatch','copySuccess','swapResponseLost','swapConflict'].includes(process.env.MANAGEMENT_MODE)){
  if(options.redirect!=='error'||options.cache!=='no-store')return deny();
  counts.fetchPublic++;counts.events.push('fetchPublic');return new Response('SYNTHETIC_BYTES!');
 }
 return deny();
};
`,
    { mode: 0o600 },
  );
  const environment = {
    PATH: process.env.PATH,
    ...cluster.environment,
    TMPDIR: root,
    RESOURCE_PRIVATE_BLOB_HOST: privateHost,
    RESOURCE_PRIVATE_READ_WRITE_TOKEN: privateToken,
    RESOURCE_PRIVATE_BLOB_ENABLED: "true",
    BLOB_READ_WRITE_TOKEN: "management-public-token-sentinel",
  };
  const run = (script, args = [], mode = "default", overrides = {}) => {
    const result = spawnSync(
      process.execPath,
      ["--import", preload, join(repository, "scripts", script), ...args],
      {
        cwd: root,
        env: { ...environment, ...overrides, MANAGEMENT_MODE: mode },
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      },
    );
    // boolean만 비교하여 실패 시에도 자식 stdout/stderr 원문을 assertion에 첨부하지 않는다.
    assert.equal(Boolean(result.error), false, "MANAGEMENT_CHILD_COMPLETED");
    const output = result.stdout + result.stderr;
    for (const forbidden of [
      publicUrl,
      privateUrl,
      privateToken,
      "management-public-token-sentinel",
      "cli-private-sentinel",
      "SYNTHETIC_BYTES",
      "postgresql://",
      "kakao_101@",
      "DO $backfill$",
      "SELECT id, email",
    ]) {
      assert.equal(output.includes(forbidden), false, "MANAGEMENT_OUTPUT_REDACTED");
    }
    const counts = JSON.parse(readFileSync(auditFile, "utf8"));
    assert.equal(counts.network, 0, "MANAGEMENT_EXTERNAL_CALLS_ZERO");
    assert.equal(counts.sdkInvalid, 0, "MANAGEMENT_SDK_ACCESS_ARGUMENTS_VALID");
    return { status: result.status, counts, output };
  };
  // 잘못된 entrypoint와 응답 없는 자식을 별도로 주입해 실패 후 소유 자원 정리도 검증한다.
  const probeFailure = (mode) =>
    spawnSync(
      process.execPath,
      mode === "startup"
        ? ["--import", preload, join(root, "missing-entrypoint.mjs")]
        : ["--import", preload, "--input-type=module", "-e", "setInterval(()=>{},1000)"],
      {
        cwd: root,
        env: environment,
        encoding: "utf8",
        timeout: mode === "startup" ? 20_000 : 300,
        maxBuffer: 1024 * 1024,
      },
    );
  return { cluster, root, run, probeFailure };
}

/** 실제 CLI가 읽고 갱신하는 열만 갖춘 합성 users fixture다. */
function kakaoFixture(cluster, rows = 1) {
  cluster.sql(`CREATE TABLE users(id text PRIMARY KEY,email text NOT NULL,password_hash text,oauth_provider text,oauth_provider_account_id text);
    INSERT INTO users(id,email) SELECT 'fixture-'||n,'kakao_'||(100+n)||'@oauth.placeholder' FROM generate_series(1,${rows}) n;`);
}
const boundCount = (cluster) =>
  Number(cluster.sql("SELECT count(*) FROM users WHERE oauth_provider IS NOT NULL"));

/** 원본 URL은 합성 값이며 참조 판정의 SQL은 실제 PG에서 실행한다. 실제 앱 view의 재검증은 아니다. */
function blobFixture(cluster) {
  cluster.sql(`
    CREATE TABLE class_materials(id text PRIMARY KEY,file_url text);
    CREATE TABLE guidebooks(id text PRIMARY KEY,file_url text);
    CREATE TABLE weekly_texts(id text PRIMARY KEY,file_url text);
    CREATE TABLE weekly_text_images(id text PRIMARY KEY,url text);
    CREATE TABLE class_log_images(id text PRIMARY KEY,url text);
    CREATE TABLE markdown_image_assets(id text DEFAULT md5(random()::text),url text UNIQUE,uploaded_by_id text,deleted_at timestamptz);
    CREATE TABLE markdown_image_references(asset_id text);
    INSERT INTO class_materials VALUES('resource-1','${publicUrl}');
    INSERT INTO markdown_image_assets(id,url) VALUES('asset-public','${publicUrl}');
  `);
}

test(
  "Kakao 기본 실행은 실제 DB를 읽고 쓰기 없이 종료하며 기존 바인딩 충돌을 거부한다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    kakaoFixture(cluster);
    const dry = run("migrate-backfill-kakao-legacy-bindings.mjs");
    assert.equal(dry.status, 0);
    assert.equal(dry.counts.db, 2);
    assert.equal(dry.counts.write + dry.counts.blob, 0);
    assert.equal(boundCount(cluster), 0);
    cluster.sql(
      "INSERT INTO users VALUES('existing','synthetic@management.invalid','not-a-real-password','kakao','101')",
    );
    const conflict = run("migrate-backfill-kakao-legacy-bindings.mjs", ["--apply", "--expect=1"]);
    assert.equal(conflict.status, 1);
    assert.equal(conflict.counts.write + conflict.counts.blob, 0);
    assert.equal(boundCount(cluster), 1);
  },
);

test(
  "Kakao apply는 양수 expect·단일 expect·관측 건수를 쓰기와 백업 생성 전에 검증한다",
  options,
  (t) => {
    const { cluster, root, run } = sandbox(t);
    kakaoFixture(cluster);
    for (const args of [
      ["--apply"],
      ["--apply", "--expect=0"],
      ["--apply", "--expect=1", "--expect=1"],
      ["--apply", "--expect=2"],
    ]) {
      const result = run("migrate-backfill-kakao-legacy-bindings.mjs", args);
      assert.equal(result.status, 1);
      assert.equal(result.counts.write + result.counts.blob, 0);
      assert.equal(boundCount(cluster), 0);
    }
    assert.equal(
      readdirSync(root).some((name) => name.startsWith("hra-kakao-binding-")),
      false,
    );
  },
);

test(
  "Kakao 적용은 제한권한 ID 백업을 남기고 UPDATE 중 제약 오류 시 모든 바인딩을 보존한다",
  options,
  (t) => {
    const { cluster, root, run } = sandbox(t);
    kakaoFixture(cluster, 2);
    cluster.sql(
      "ALTER TABLE users ADD CONSTRAINT reject_second CHECK(oauth_provider_account_id IS DISTINCT FROM '102')",
    );
    const failed = run("migrate-backfill-kakao-legacy-bindings.mjs", ["--apply", "--expect=2"]);
    assert.equal(failed.status, 1);
    assert.equal(failed.counts.write, 1);
    assert.equal(boundCount(cluster), 0);
    const backups = readdirSync(root).filter((name) => name.startsWith("hra-kakao-binding-"));
    assert.equal(backups.length, 1);
    const directory = join(root, backups[0]);
    const file = join(directory, "previous-bindings.json");
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const backup = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(backup.length, 2);
    assert.equal(
      backup.every(
        (row) =>
          Object.keys(row).sort().join(",") === "id,oauthProvider,oauthProviderAccountId" &&
          row.oauthProvider === null &&
          row.oauthProviderAccountId === null,
      ),
      true,
      "KAKAO_BACKUP_IDS_ONLY",
    );
    cluster.sql("ALTER TABLE users DROP CONSTRAINT reject_second");
    const success = run("migrate-backfill-kakao-legacy-bindings.mjs", ["--apply", "--expect=2"]);
    assert.equal(success.status, 0);
    assert.equal(boundCount(cluster), 2);
    assert.equal(
      cluster.sql(
        "SELECT count(*) FROM users WHERE oauth_provider_account_id=substring(email FROM 7 FOR length(email)-24)",
      ),
      "2",
    );
  },
);

test(
  "보호 Blob 기본 실행은 DB 조회만 수행하고 apply/delete-public 동시 지정은 조회 전에 거부한다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    blobFixture(cluster);
    const dry = run("migrate-protected-resource-blobs.mjs");
    assert.equal(dry.status, 0);
    assert.equal(dry.counts.db, 1);
    assert.equal(dry.counts.write + dry.counts.blob + dry.counts.fetchPublic, 0);
    const conflict = run("migrate-protected-resource-blobs.mjs", ["--apply", "--delete-public"]);
    assert.equal(conflict.status, 1);
    assert.equal(conflict.counts.db + conflict.counts.blob, 0);
  },
);

test("보호 Blob 사본 hash 불일치는 DB 참조를 바꾸지 않고 비공개 사본만 회수한다", options, (t) => {
  const { cluster, run } = sandbox(t);
  blobFixture(cluster);
  const result = run("migrate-protected-resource-blobs.mjs", ["--apply"], "copyMismatch");
  assert.equal(result.status, 1);
  assert.equal(result.counts.headPublic, 1);
  assert.equal(result.counts.fetchPublic, 1);
  assert.equal(result.counts.put, 1);
  assert.equal(result.counts.get, 1);
  assert.equal(result.counts.delPrivate, 1);
  assert.equal(result.counts.delPublic, 0);
  assert.equal(
    cluster.sql(`SELECT count(*) FROM class_materials WHERE file_url='${publicUrl}'`),
    "1",
  );
  assert.equal(
    cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NOT NULL"),
    "0",
  );
});

test(
  "보호 Blob 정상 적용은 검증한 사본으로 DB 참조를 교체하고 양쪽 소유 원장과 공개 원본을 보존한다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    blobFixture(cluster);
    cluster.sql("UPDATE markdown_image_assets SET uploaded_by_id='fixture-owner'");
    const copied = run("migrate-protected-resource-blobs.mjs", ["--apply"], "copySuccess");
    assert.equal(copied.status, 0);
    // SDK는 실제 전달된 private access/token/storeId/대상/바이트를 검사하며 원문은 기록하지 않는다.
    assert.equal(
      copied.counts.events.join(","),
      "headPublic,fetchPublic,putPrivate,getPrivate,dbWrite,dbWrite,dbWrite",
    );
    assert.equal(copied.counts.delPublic + copied.counts.delPrivate, 0);
    assert.equal(
      cluster.sql(`SELECT count(*) FROM class_materials WHERE file_url='${privateUrl}'`),
      "1",
    );
    assert.equal(
      cluster.sql(`SELECT count(*) FROM markdown_image_assets
    WHERE url IN ('${publicUrl}','${privateUrl}') AND uploaded_by_id='fixture-owner' AND deleted_at IS NULL`),
      "2",
    );
    assert.equal(cluster.sql("SELECT count(*) FROM markdown_image_assets"), "2");
    const repeated = run("migrate-protected-resource-blobs.mjs", ["--apply"]);
    assert.equal(repeated.status, 0);
    assert.equal(repeated.counts.db, 1);
    assert.equal(repeated.counts.blob + repeated.counts.write, 0);
  },
);

test(
  "보호 Blob 교체 커밋 뒤 응답 손실은 참조 중인 사본과 원장을 보존하고 재실행은 쓰지 않는다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    blobFixture(cluster);
    const failed = run("migrate-protected-resource-blobs.mjs", ["--apply"], "swapResponseLost");
    assert.equal(failed.status, 1);
    assert.equal(
      cluster.sql(`SELECT count(*) FROM class_materials WHERE file_url='${privateUrl}'`),
      "1",
    );
    assert.equal(failed.counts.delPrivate + failed.counts.delPublic, 0);
    assert.equal(
      cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NULL"),
      "2",
    );
    const repeated = run("migrate-protected-resource-blobs.mjs", ["--apply"]);
    assert.equal(repeated.status, 0);
    assert.equal(repeated.counts.blob + repeated.counts.write, 0);
  },
);

test(
  "보호 Blob CAS 경합은 다른 참조를 덮어쓰지 않고 검증한 사본과 원장을 보존한다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    blobFixture(cluster);
    const failed = run("migrate-protected-resource-blobs.mjs", ["--apply"], "swapConflict");
    assert.equal(failed.status, 1);
    assert.equal(
      cluster.sql(
        `SELECT count(*) FROM class_materials WHERE file_url='${privateUrl}' OR file_url='${publicUrl}'`,
      ),
      "0",
    );
    assert.equal(failed.counts.delPrivate + failed.counts.delPublic, 0);
    assert.equal(
      cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NULL"),
      "2",
    );
    const repeated = run("migrate-protected-resource-blobs.mjs", ["--apply"]);
    assert.equal(repeated.status, 0);
    assert.equal(repeated.counts.blob + repeated.counts.write, 0);
  },
);

test(
  "공개 원본 삭제는 malformed 비공개 HEAD와 비활성 설정·누락 토큰에서 원본과 DB 상태를 보존한다",
  options,
  (t) => {
    const { cluster, run } = sandbox(t);
    blobFixture(cluster);
    cluster.sql(`UPDATE class_materials SET file_url='${privateUrl}'`);
    for (const mode of ["headUndefined", "headNaN"]) {
      const result = run("migrate-protected-resource-blobs.mjs", ["--delete-public"], mode);
      assert.equal(result.status, 1);
      assert.equal(result.counts.db, 1);
      assert.equal(result.counts.headPrivate, 1);
      assert.equal(result.counts.write + result.counts.delPublic + result.counts.headPublic, 0);
      assert.equal(
        result.output.includes("비공개 사본을 확인할 수 없어 공개 원본을 보존합니다."),
        true,
        "MANAGEMENT_HEAD_FAILURE_FIXED",
      );
    }
    for (const [overrides, message] of [
      [
        { RESOURCE_PRIVATE_BLOB_ENABLED: "false" },
        "새 업로드를 비공개 저장소로 전환한 뒤 이전해야 합니다.",
      ],
      [{ RESOURCE_PRIVATE_READ_WRITE_TOKEN: "" }, "비공개 저장소 연결이 필요합니다."],
    ]) {
      const result = run(
        "migrate-protected-resource-blobs.mjs",
        ["--delete-public"],
        "default",
        overrides,
      );
      assert.equal(result.status, 1);
      assert.equal(result.counts.db + result.counts.blob + result.counts.write, 0);
      assert.equal(result.output.includes(message), true, "MANAGEMENT_CONFIGURATION_FAILURE_FIXED");
    }
    assert.equal(
      cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NOT NULL"),
      "0",
    );
    assert.equal(cluster.sql("SELECT count(*) FROM markdown_image_assets"), "1");
    assert.equal(
      cluster.sql(`SELECT count(*) FROM class_materials WHERE file_url='${privateUrl}'`),
      "1",
    );
  },
);

test("공개 원본 삭제는 비공개 HEAD·직전 새 참조·ETag 조건을 확인한다", options, (t) => {
  const { cluster, run } = sandbox(t);
  blobFixture(cluster);
  const remaining = run("migrate-protected-resource-blobs.mjs", ["--delete-public"]);
  assert.equal(remaining.status, 1);
  assert.equal(remaining.counts.blob + remaining.counts.write, 0);
  cluster.sql(`UPDATE class_materials SET file_url='${privateUrl}'`);
  const failedHead = run(
    "migrate-protected-resource-blobs.mjs",
    ["--delete-public"],
    "headFailure",
  );
  assert.equal(failedHead.status, 1);
  assert.equal(failedHead.counts.headPrivate, 1);
  assert.equal(failedHead.counts.delPublic + failedHead.counts.write, 0);
  const raced = run("migrate-protected-resource-blobs.mjs", ["--delete-public"], "lateReference");
  assert.equal(raced.status, 0);
  assert.equal(raced.counts.headPrivate, 1);
  assert.equal(raced.counts.delPublic + raced.counts.headPublic + raced.counts.write, 0);
  cluster.sql("DELETE FROM markdown_image_references");
  const deleted = run("migrate-protected-resource-blobs.mjs", ["--delete-public"]);
  assert.equal(deleted.status, 0);
  assert.equal(deleted.counts.headPrivate, 1);
  assert.equal(deleted.counts.headPublic, 1);
  assert.equal(deleted.counts.delPublic, 1);
  assert.equal(
    cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NOT NULL"),
    "1",
  );
});

test(
  "CLI 시작 실패·timeout 후에도 소유 PostgreSQL과 가짜 SDK 임시 파일을 제거한다",
  options,
  () => {
    const cleanups = [];
    const fixture = sandbox({ after: (cleanup) => cleanups.push(cleanup) });
    try {
      const startup = fixture.probeFailure("startup");
      assert.equal(startup.status, 1);
      assert.equal(Boolean(startup.error), false);
      const timedOut = fixture.probeFailure("timeout");
      assert.equal(timedOut.error?.code, "ETIMEDOUT");
      assert.equal(timedOut.signal, "SIGTERM");
    } finally {
      // node:test의 after와 동일한 정리 함수를 실행하되 하나의 실패가 나머지 정리를 막지 않는다.
      const failures = [];
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          failures.push("MANAGEMENT_CLEANUP_FAILED");
        }
      }
      assert.equal(failures.length, 0, "MANAGEMENT_FAILURE_CLEANUP_COMPLETE");
    }
    assert.equal(existsSync(fixture.cluster.root) || existsSync(fixture.root), false);
  },
);
