/**
 * production Next, 격리 PostgreSQL, G1 private 저장소로 모바일 Bearer 서버 HTTP 여정을 검증한다.
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
import { appEnvironment, childProcess, freePort, stopChild, waitForApp } from "../tests/support/mobile-bearer-runtime.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let cluster, store, network, app;
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
  // 모바일 앱 클라이언트 모듈(apps/mobile)의 E2E는 별도 앱 묶음에서 검증한다. 이 하네스는 서버 HTTP 경계만 확인한다.
} catch (error) {
  failed = true;
  console.error(error instanceof Error && (/^MOBILE_[A-Za-z0-9_]+$/.test(error.message) || error.message.includes("다시 빌드하세요")) ? error.message : "MOBILE_GATE_FAILED");
} finally {
  await stopChild(app);
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
