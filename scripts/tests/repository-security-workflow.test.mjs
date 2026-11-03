/** 보안 작업의 실제 명령 연결·이력 범위·credential 부재·도구 무결성 및 YAML 파서 교차 정합성을 고정합니다. */
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
test("무의존성 필수 체크 경계 파서는 실제 js-yaml JSON_SCHEMA 파싱 결과와 일치한다", () => {
  const files = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name)).sort();
  assert.deepEqual(files, [...EXPECTED_WORKFLOW_FILES]);
  for (const filename of files) {
    const raw = readFileSync(new URL(filename, workflowsDir), "utf8");
    const summary = parseWorkflowSummary(filename, raw);
    const doc = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    assert.deepEqual(summary.parseErrors, []);
    assert.deepEqual(Object.keys(summary.triggers).sort(), Object.keys(doc.on ?? {}).sort());
    assert.deepEqual(Object.keys(summary.jobs).sort(), Object.keys(doc.jobs ?? {}).sort());
    for (const [jobId, jobDoc] of Object.entries(doc.jobs ?? {})) {
      const parsedJob = summary.jobs[jobId];
      assert.equal(parsedJob.name, jobDoc.name ?? null);
      assert.equal(parsedJob.ifCondition, jobDoc.if ?? null);
      assert.equal(parsedJob.hasStrategy, Boolean(jobDoc.strategy));
      assert.equal(parsedJob.hasReusableUses, Boolean(jobDoc.uses));
      assert.equal(parsedJob.hasContinueOnError, Boolean(jobDoc["continue-on-error"]));
    }
  }
});
