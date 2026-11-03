/**
 * 공개 E2E의 필수 사례 집계·정제 보고서·격리 설정을 합성 객체로 검증한다.
 * 실제 앱이나 운영 DB 없이 누락·skip·재시도·출력 유출을 재현한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Reporter, { requiredPublicBrowserCases } from "../../tests/support/expanded-public-reporter.mjs";
import { publicBrowserSpecs, prepareExpandedPublicBrowser } from "../../tests/support/expanded-public-browser.mjs";

const repository = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const counts = [1, 5, 5, 3, 6, 4];
const cases = () => publicBrowserSpecs.flatMap((file, index) => Array.from({ length: counts[index] }, (_, line) => ({
  title: `[PUBLIC:${Object.entries(requiredPublicBrowserCases).filter(([, name]) => name === file)[line][0]}] Bearer secret-token https://private.invalid`, expectedStatus: "passed", location: { file: `/private/${file}`, line: line + 1 },
})));

/** 환경·출력을 복원하면서 리포터의 실제 종료 계약과 기록 파일을 확인한다. */
async function report(t, { mutate = () => {}, list = false, execute = true, status = "passed", modifyResult = () => {}, runnerError = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "public-reporter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.HRA_PUBLIC_E2E_LIST;
  const original = console.log;
  const output = [];
  process.env.HRA_PUBLIC_E2E_LIST = String(list);
  console.log = (value) => output.push(value);
  try {
    const reporter = new Reporter({ summaryPath: path.join(root, "summary.json") });
    const tests = cases();
    mutate(tests);
    reporter.onBegin({}, { allTests: () => tests });
    if (execute) for (const [index, item] of tests.entries()) {
      const result = { status: "passed", retry: 0, errors: [{ message: "Bearer secret-token", stack: "https://private.invalid" }] };
      modifyResult(result, index);
      reporter.onTestEnd(item, result);
    }
    if (runnerError) reporter.onError({ message: "Bearer secret-token" });
    reporter.onStdOut("Bearer secret-token");
    reporter.onStdErr("https://private.invalid");
    const end = await reporter.onEnd({ status });
    const raw = await readFile(path.join(root, "summary.json"), "utf8");
    assert.doesNotMatch(raw + output.join("\n"), /Bearer|secret-token|private\.invalid|\/private\//);
    assert.ok(output.every((line) => /^[\x20-\x7e]+$/.test(line)));
    return { end, summary: JSON.parse(raw), output };
  } finally {
    console.log = original;
    if (previous === undefined) delete process.env.HRA_PUBLIC_E2E_LIST;
    else process.env.HRA_PUBLIC_E2E_LIST = previous;
  }
}

test("24건 성공과 원문 오류의 정제", async (t) => {
  const { end, summary, output } = await report(t);
  assert.equal(end.status, "passed");
  assert.equal(summary.completed, 24);
  assert.deepEqual(summary.cases.map((item) => item.caseId).sort(), Object.keys(requiredPublicBrowserCases).sort());
  assert.equal(output.at(-1), "PASS E2E_PUBLIC_REQUIRED:24");
});

test("목록 모드는 수집만 검증하고 일반 모드는 실행 누락을 거부", async (t) => {
  assert.equal((await report(t, { list: true, execute: false })).end.status, "passed");
  assert.equal((await report(t, { execute: false })).end.status, "failed");
});

test("사례 누락·중복·파일별 수 변경은 실패", async (t) => {
  for (const mutate of [
    (items) => items.pop(),
    (items) => { items[1] = items[0]; },
    (items) => { items[1].location.file = "/private/home.spec.ts"; },
    (items) => { items[0].expectedStatus = "skipped"; },
    (items) => { items[0].title = "식별자 없는 제목"; },
    (items) => { items[2].title = items[1].title; },
  ]) assert.equal((await report(t, { mutate })).end.status, "failed");
});

test("skip·실패·재시도·실행기 오류는 종료 실패", async (t) => {
  for (const status of ["skipped", "failed", "timedOut", "interrupted"]) {
    assert.equal((await report(t, { modifyResult: (result, index) => { if (!index) result.status = status; } })).end.status, "failed");
  }
  assert.equal((await report(t, { modifyResult: (result) => { result.retry = 1; } })).end.status, "failed");
  assert.equal((await report(t, { runnerError: true })).end.status, "failed");
  assert.equal((await report(t, { status: "failed" })).end.status, "failed");
});

test("설정은 네 명세·Chromium·산출물 차단 및 원점 경계를 고정", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "public-config-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const result = await prepareExpandedPublicBrowser({ repository, fixtureRoot, origin: "http://127.0.0.1:3100" });
  const { default: config } = await import(pathToFileURL(result.configPath).href);
  assert.ok(Object.isFrozen(publicBrowserSpecs));
  assert.deepEqual(config.testMatch, publicBrowserSpecs);
  assert.equal(config.testDir, path.join(repository, "tests/e2e"));
  assert.equal(config.workers, 1);
  assert.equal(config.retries, 0);
  assert.equal(config.forbidOnly, true);
  assert.equal(config.timeout, 60000);
  assert.deepEqual(config.expect, { timeout: 20000 });
  assert.deepEqual(config.projects, [{ name: "chromium", use: { browserName: "chromium" } }]);
  assert.deepEqual(config.use, { baseURL: "http://127.0.0.1:3100", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
  assert.equal(config.reporter[0][1].summaryPath, result.summaryPath);
  assert.equal(path.dirname(config.outputDir), fixtureRoot);
  for (const origin of ["https://127.0.0.1:3100", "http://example.com", "http://user@localhost", "http://localhost/path", "http://localhost/", "http://localhost?token=x"]) {
    await assert.rejects(prepareExpandedPublicBrowser({ repository, fixtureRoot, origin }), /E2E_PUBLIC_ORIGIN_INVALID/);
  }
  await assert.rejects(prepareExpandedPublicBrowser({ repository, fixtureRoot: "relative", origin: "http://localhost" }), /E2E_PUBLIC_PATH_INVALID/);
  const link = path.join(fixtureRoot, "link");
  await symlink(fixtureRoot, link);
  await assert.rejects(prepareExpandedPublicBrowser({ repository, fixtureRoot: link, origin: "http://localhost" }), /E2E_PUBLIC_PATH_INVALID/);
  await assert.rejects(prepareExpandedPublicBrowser({ repository, fixtureRoot, origin: "http://localhost" }), /EEXIST/);
});

/** 실제 TS 명세 로더와 ESM 리포터를 함께 실행하여 수집 경계도 검증한다. */
test("실제 Playwright 목록은 지정한 24건만 수집한다", async (t) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "public-list-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const { configPath, summaryPath } = await prepareExpandedPublicBrowser({ repository, fixtureRoot, origin: "http://127.0.0.1:3100" });
  const result = spawnSync(process.execPath, [path.join(repository, "node_modules/@playwright/test/cli.js"), "test", "--config", configPath, "--list"], {
    cwd: repository, timeout: 60_000, encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      NODE_OPTIONS: "", HRA_PUBLIC_E2E_LIST: "true", HRA_PUBLIC_E2E_ORIGIN: "http://127.0.0.1:3100" },
  });
  assert.equal(result.status, 0, "필수 공개 명세 수집은 성공해야 한다");
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  assert.equal(summary.collected, 24);
  assert.equal(summary.completed, 0);
  assert.equal(summary.status, "passed");
  assert.equal(summary.mode, "list");
});

/** 원문 메시지·스택·URL 대신 허용한 오류 코드와 명세 줄 번호만 남긴다. */
test("실패 진단은 고정 matcher 코드와 명세 위치로 정제한다", async (t) => {
  for (const [message, code] of [
    ["expect(locator).toBeVisible() timed out", "TO_BE_VISIBLE"],
    ["expect(locator).toHaveAttribute()", "TO_HAVE_ATTRIBUTE"],
    ["expect(locator).toBeFocused()", "TO_BE_FOCUSED"],
    ["expect(value).toBeLessThanOrEqual()", "TO_BE_LESS_THAN_OR_EQUAL"],
    ["외부 브라우저 요청은 허용하지 않는다", "NETWORK_BLOCKED"],
    ["Test timeout exceeded", "TIMEOUT"], ["unrecognized failure", "OTHER"],
  ]) {
    const { summary, output } = await report(t, {
      modifyResult: (result, index) => {
        if (index) return;
        result.status = "failed";
        result.errors = [{ message: `${message} Bearer secret-token https://private.invalid`, stack: "at /private/home.spec.ts:57:3" }];
      },
    });
    assert.deepEqual(summary.cases[0].errors, [{ code, line: 57 }]);
    assert.ok(output.includes(`FAIL E2E_PUBLIC_ERROR:HOME:${code}:57`));
  }
  const located = await report(t, { modifyResult: (result, index) => {
    if (index) return;
    result.status = "failed";
    result.errors = [{ message: "secret-token", location: { file: "/private/home.spec.ts", line: 39 }, stack: "at /private/home.spec.ts:57:3" }];
  } });
  assert.deepEqual(located.summary.cases[0].errors, [{ code: "OTHER", line: 39 }]);
  const unrelated = await report(t, { modifyResult: (result, index) => {
    if (index) return;
    result.status = "failed";
    result.errors = [{ message: "secret-token", location: { file: "/private/other.spec.ts", line: 39 }, stack: "at /private/other.spec.ts:57:3" }];
  } });
  assert.deepEqual(unrelated.summary.cases[0].errors, [{ code: "OTHER", line: 0 }]);
});
