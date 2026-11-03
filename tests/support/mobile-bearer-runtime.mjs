/** 실행별 자식 프로세스·임의 포트·환경 허용 목록을 관리한다. 출력은 메모리에서만 수집한다. */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { check } from "./mobile-bearer-http.mjs";

/** 값이 있는 시스템 변수 하나만 새 객체로 옮긴다. */
const keep = (name, value) => (value ? { [name]: value } : {});

/**
 * 자식 프로세스에 넘기는 시스템 변수 허용 목록이다. 이름마다 정적 접근만 사용해
 * 환경 계약 검사기(`scripts/check-environment-contract.mjs`)가 접근 대상을 추적할 수 있게 한다.
 */
export const safeEnvironment = () => ({
  ...keep("PATH", process.env.PATH),
  ...keep("HOME", process.env.HOME),
  ...keep("TMPDIR", process.env.TMPDIR),
  ...keep("TMP", process.env.TMP),
  ...keep("TEMP", process.env.TEMP),
  ...keep("SYSTEMROOT", process.env.SYSTEMROOT),
});

export async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

export function childProcess(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { output += String(chunk); });
  const done = new Promise(resolve => { child.once("error", () => resolve(-1)); child.once("close", resolve); });
  return { child, done, output: () => output };
}

export async function stopChild(instance) {
  if (!instance?.child.pid || instance.child.exitCode !== null) return;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try { process.kill(-instance.child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
    if (signal === "SIGTERM") await Promise.race([instance.done, delay(5_000)]);
  }
  await instance.done;
}

export async function waitForApp(origin, instance) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && instance.child.exitCode === null) {
    try {
      const response = await fetch(`${origin}/api/auth/csrf`, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      await response.body?.cancel(); if (response.ok) return;
    } catch (error) { if (!(error instanceof Error)) throw error; }
    await delay(200);
  }
  check(false, "APP_READY");
}

export function appEnvironment(context) {
  const { root, cluster, origin, store, authSecret, cronSecret, blobToken } = context;
  return { ...safeEnvironment(), ...cluster.environment, NODE_ENV: "production", LC_ALL: "C",
    AUTH_SECRET: authSecret, CRON_SECRET: cronSecret, AUTH_TRUST_HOST: "true", AUTH_URL: origin, NEXTAUTH_URL: origin,
    NEXT_PUBLIC_APP_URL: origin, NEXT_TELEMETRY_DISABLED: "1", AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "",
    AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "", BLOB_READ_WRITE_TOKEN: "",
    RESOURCE_PRIVATE_READ_WRITE_TOKEN: blobToken, RESOURCE_PRIVATE_BLOB_HOST: store.host,
    ACADEMIC_ENABLED: "true", ACADEMIC_ENROLLMENT_WRITES_ENABLED: "true", ACADEMIC_UPLOADS_ENABLED: "true",
    ACADEMIC_APPROVER_USER_ID: "10000000-0000-4000-8000-000000000003",
    ACADEMIC_SUBMISSION_BLOB_HOST: store.host, ACADEMIC_SUBMISSION_READ_WRITE_TOKEN: blobToken,
    ACADEMIC_UPLOAD_CLEANUP_ENABLED: "false", ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED: "false",
    VERCEL_BLOB_CALLBACK_URL: origin, VERCEL_BLOB_RETRIES: "0", HRA_G1_APP_ORIGIN: origin, HRA_G1_STORE_ORIGIN: store.origin,
    NODE_OPTIONS: `--import=${JSON.stringify(join(root, "tests/support/mobile-bearer-preload.mjs"))}` };
}
