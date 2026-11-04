/**
 * production Next, 격리 PostgreSQL, G1 private 저장소로 모바일 전체 HTTP 여정을 검증한다.
 * 환경 파일·운영 자격을 상속하지 않으며 원문 출력은 메모리 검사 후 고정 사례명으로만 공개한다.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQaPostgres, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
import { createAcademicPrivateStore } from "../tests/support/academic-private-store.mjs";
import { installAcademicGateNetwork } from "../tests/support/academic-g1-network.mjs";
import { installMobileFixture } from "../tests/support/mobile-bearer-fixture.mjs";
import { check, createMobileHttp, pass } from "../tests/support/mobile-bearer-http.mjs";
import { verifyMobileAuth } from "../tests/support/mobile-bearer-auth.mjs";
import { verifyMobileSubmission } from "../tests/support/mobile-bearer-submission.mjs";
import { verifyBuildProvenance } from "../tests/support/mobile-bearer-provenance.mjs";
import { measureStatements, verifyRefreshExhaustion, verifySlowBodies } from "../tests/support/mobile-bearer-boundaries.mjs";
import { appEnvironment, childProcess, freePort, safeEnvironment, stopChild, waitForApp } from "../tests/support/mobile-bearer-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let cluster, store, network, app, jest;
const blobHost = "academicg1qa.private.blob.vercel-storage.com";
const blobToken = `vercel_blob_rw_academicg1qa_${randomBytes(24).toString("hex")}`;
const authSecret = randomBytes(48).toString("hex"), cronSecret = randomBytes(32).toString("hex");
let failed = false;
try {
  check(![".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local"]
    .some(name => existsSync(join(root, name))), "ENV_FILE");
  check(existsSync(join(root, ".next/BUILD_ID")), "BUILD_REQUIRED");
  const provenance = verifyBuildProvenance(root);
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installMobileFixture(cluster); pass("REAL_MIGRATION_REPEAT");
  store = await createAcademicPrivateStore({ host: blobHost, token: blobToken });
  const origin = `http://127.0.0.1:${await freePort()}`;
  network = installAcademicGateNetwork({ appOrigin: origin, storeOrigin: store.origin, blobHost });
  const context = { root, cluster, origin, store, authSecret, cronSecret, blobToken, http: createMobileHttp(origin) };
  app = childProcess(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", new URL(origin).port],
    { cwd: root, env: appEnvironment(context) });
  await waitForApp(origin, app);
  await verifySlowBodies(context);
  const cookie = await verifyMobileAuth(context);
  await verifyRefreshExhaustion(context);
  await verifyMobileSubmission({ ...context, cookie });
  await measureStatements(context);
  console.log(`PASS MOBILE_BUILD_PROVENANCE build=${provenance.id} source=${provenance.fingerprint} inputs=${provenance.inputs}`);
  // 독립 클라이언트 사례 사이에만 예산을 초기화한다. 각 사용자 흐름 내부에서는 초기화하지 않는다.
  cluster.sql("TRUNCATE rate_limit_events");
  jest = childProcess("npx", ["--no-install", "jest", "-c", "jest.e2e.config.cjs", "--runInBand"], {
    cwd: join(root, "apps/mobile"), env: { ...safeEnvironment(), ...cluster.environment, HRA_E2E_BASE_URL: origin,
      HRA_G1_STORE_ORIGIN: store.origin, ACADEMIC_SUBMISSION_BLOB_HOST: blobHost, NODE_OPTIONS: "", CI: "true" } });
  const jestExit = await jest.done;
  // Jest의 상세 assertion은 원문 토큰을 포함할 수 있다. 안전한 사례 결과/소스 위치만 통과시킨다.
  for (const line of jest.output().split(/\r?\n/)) if (/^(?:PASS|FAIL) MOBILE_[A-Z0-9_:]+$/.test(line)) console.log(line);
  if (jestExit !== 0) {
    for (const line of jest.output().split(/\r?\n/)) if (line.startsWith("DIAGNOSTIC ") && !/hra_(?:at|rt)_|vercel_blob_|password/i.test(line)) console.error(line);
    for (const match of jest.output().matchAll(/(?:e2e\/[^\s():]+|src\/[^\s():]+):\d+:\d+/g)) console.error(`LOCATION ${match[0]}`);
  }
  check(jestExit === 0, `CLIENT_JEST_EXIT_${jestExit}`); pass("CLIENT_MODULES");
  check(["SUBMIT_DOWNLOAD_ABORT", "INTERRUPTED_RESUME_REPLAY_CANCEL", "SESSION_RESTORE_SINGLE_FLIGHT", "GENERATION_GUARD",
    "LOGOUT_ALL", "GET_COORDINATED_REFRESH", "MUTATION_NOT_RETRIED"].every(code =>
    jest.output().split(/\r?\n/).filter(line => line === `PASS MOBILE_CLIENT_${code}`).length === 1), "CLIENT_REQUIRED_CASES");
} catch (error) {
  failed = true;
  console.error(error instanceof Error && (/^MOBILE_[A-Za-z0-9_]+$/.test(error.message) || error.message.includes("다시 빌드하세요")) ? error.message : "MOBILE_GATE_FAILED");
} finally {
  await stopChild(jest); await stopChild(app);
  const output = app?.output() ?? "";
  const clean = ![blobToken, authSecret, cronSecret, qaPassword].some(secret => output.includes(secret)) &&
    !/hra_(?:at|rt)_[A-Za-z0-9_-]+|vercel_blob_(?:rw|client)_[A-Za-z0-9_+/=-]+|authorization\s*[:=]\s*["']?Bearer|authjs\.(?:session-token|csrf-token)=/i.test(output);
  if (!clean || output.includes("QA_G1_NETWORK_BLOCKED:") || (network && network.snapshot().blocked > 0)) {
    failed = true; console.error("MOBILE_LOG_OR_NETWORK_LEAK");
  } else pass("NO_SECRET_EXTERNAL_NETWORK");
  for (const code of new Set(output.match(/QA_TRANSPORT_FAILURE:[A-Z0-9_]+/g) ?? [])) console.error(code);
  await network?.close(); await store?.close(); cluster?.close(); pass("CLEANUP");
}
if (failed) process.exitCode = 1;
