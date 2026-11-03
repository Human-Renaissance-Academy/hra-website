/** 보안 작업의 실제 명령 연결·이력 범위·credential 부재·도구 무결성 및 YAML 파서 전체 구조 교차 정합성을 고정합니다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import {
  EXPECTED_WORKFLOW_FILES,
  parseWorkflowSummary,
} from "../_lib/required-checks-policy.mjs";

const workflowsDir = new URL("../../.github/workflows/", import.meta.url);
const workflow = readFileSync(new URL("repository-security.yml", workflowsDir), "utf8");

/** 공백·줄바꿈 차이를 정규화해 멀티라인/폴딩(`>-`) run 본문이 동일한지 대조한다. */
function normalizeRun(value) {
  if (typeof value !== "string") return null;
  return value.replace(/\s+/g, " ").trim();
}

test("secret·audit 게이트는 모든 PR과 main·예약에서 운영 비밀 없이 실행한다", () => {
  for (const trigger of ["pull_request:", "push:", "schedule:", "workflow_dispatch:"]) assert.ok(workflow.includes(trigger));
  assert.match(workflow, /fetch-depth: 0/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|upload-artifact|continue-on-error/);
  assert.match(workflow, /npm run verify:repository-secrets -- --gitleaks "\$scanner_dir\/gitleaks"/);
  assert.match(workflow, /npm run verify:dependencies/);
  assert.match(workflow, /npm run verify:public-sources/);
  assert.match(workflow, /node scripts\/check-required-checks-config\.mjs/);
});

test("공식 scanner archive를 고정 검증하고 실제 canary 및 소유 경로 정리를 실행한다", () => {
  assert.ok(workflow.includes("https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"));
  assert.match(workflow, /551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb/);
  assert.match(workflow, /sha256sum -c -/);
  assert.match(workflow, /trap cleanup EXIT/);
  assert.match(workflow, /p\.dirname\(target\)!==p\.resolve\(process\.env\.RUNNER_TEMP\)/);
  assert.match(workflow, /scripts\/tests\/secret-scan\.test\.mjs/);
});

test("CSP는 Vite 대체 화면이 아니라 production Next·격리 PostgreSQL·Chromium에서 검사한다", () => {
  assert.match(workflow, /apt-get install -y postgresql/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /node --test scripts\/tests\/csp-browser\.test\.mjs/);
  assert.match(workflow, /npm run verify:csp/);
});

test("무의존성 필수 체크 경계 파서는 실제 js-yaml JSON_SCHEMA 파싱 결과(트리거·동시성·job·step)와 전수 일치한다", () => {
  const files = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name)).sort();
  assert.deepEqual(files, [...EXPECTED_WORKFLOW_FILES]);
  for (const filename of files) {
    const raw = readFileSync(new URL(filename, workflowsDir), "utf8");
    const summary = parseWorkflowSummary(filename, raw);
    const doc = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    assert.deepEqual(summary.parseErrors, [], `${filename} 파싱 오류가 없어야 합니다.`);
    assert.deepEqual(Object.keys(summary.triggers).sort(), Object.keys(doc.on ?? {}).sort());

    if (doc.on?.pull_request) {
      const prDoc = doc.on.pull_request;
      const prParsed = summary.triggers.pull_request;
      assert.deepEqual(prParsed.branches, prDoc.branches ?? null);
      assert.equal(prParsed.branchesIgnore, Boolean(prDoc["branches-ignore"]));
      assert.equal(prParsed.paths, Boolean(prDoc.paths));
      assert.equal(prParsed.pathsIgnore, Boolean(prDoc["paths-ignore"]));
      assert.deepEqual(prParsed.types, prDoc.types ?? null);
    }

    if (doc.concurrency) {
      assert.equal(summary.concurrency?.group, String(doc.concurrency.group));
      assert.equal(summary.concurrency?.cancelInProgress, String(doc.concurrency["cancel-in-progress"]));
    } else {
      assert.equal(summary.concurrency, null);
    }

    assert.deepEqual(Object.keys(summary.jobs).sort(), Object.keys(doc.jobs ?? {}).sort());
    for (const [jobId, jobDoc] of Object.entries(doc.jobs ?? {})) {
      const parsedJob = summary.jobs[jobId];
      assert.equal(parsedJob.name, jobDoc.name ?? null);
      assert.equal(parsedJob.ifCondition, jobDoc.if !== undefined ? String(jobDoc.if) : null);
      assert.equal(parsedJob.hasNeeds, jobDoc.needs !== undefined);
      assert.equal(parsedJob.hasStrategy, jobDoc.strategy !== undefined);
      assert.equal(parsedJob.hasReusableUses, jobDoc.uses !== undefined);
      assert.equal(parsedJob.hasContinueOnError, jobDoc["continue-on-error"] !== undefined);

      const docSteps = jobDoc.steps ?? [];
      assert.equal(parsedJob.steps.length, docSteps.length, `${filename} (${jobId}) step 개수가 일치해야 합니다.`);
      for (let idx = 0; idx < docSteps.length; idx += 1) {
        const docStep = docSteps[idx];
        const parsedStep = parsedJob.steps[idx];
        assert.equal(parsedStep.name, docStep.name ?? null);
        assert.equal(parsedStep.ifCondition, docStep.if !== undefined ? String(docStep.if) : null);
        assert.equal(parsedStep.hasContinueOnError, docStep["continue-on-error"] !== undefined);
        assert.equal(normalizeRun(parsedStep.run), normalizeRun(docStep.run ?? null));
      }
    }
  }
});
