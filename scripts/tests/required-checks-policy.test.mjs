/** #408: 기존 js-yaml 파서로 필수 체크 생성·skip·출처 정책을 검증합니다. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXPECTED_WORKFLOW_FILES,
  GITHUB_ACTIONS_APP_ID,
  REQUIRED_MAIN_STATUS_CHECKS,
  VERCEL_APP_ID,
  parseWorkflow,
  validateBranchProtection,
  validateWorkflowCheckBoundaries,
} from "../_lib/required-checks-policy.mjs";

const directory = new URL("../../.github/workflows/", import.meta.url);
const cli = new URL("../check-required-checks-config.mjs", import.meta.url);

function baseline() {
  return Object.fromEntries(readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => [name, readFileSync(new URL(name, directory), "utf8")]));
}

function protection() {
  return {
    required_status_checks: {
      strict: true,
      checks: REQUIRED_MAIN_STATUS_CHECKS.map(({ context, appId }) => ({
        context, app_id: appId,
      })),
    },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

test("승인된 9개 workflow와 모든 필수 PR 검사 경계가 유지된다", () => {
  const files = baseline();
  assert.deepEqual(Object.keys(files).sort(), [...EXPECTED_WORKFLOW_FILES]);
  assert.deepEqual(validateWorkflowCheckBoundaries(files), []);
  for (const name of Object.keys(files)) assert.ok(parseWorkflow(files[name]).jobs);
});

test("목표 필수 체크는 액션·보안 5종과 외부 Vercel 상태 1종이다", () => {
  assert.deepEqual(
    REQUIRED_MAIN_STATUS_CHECKS.map((entry) => [entry.context, entry.appId]),
    [
      ["Lint · Typecheck · Test · Build", GITHUB_ACTIONS_APP_ID],
      ["PR 형식", GITHUB_ACTIONS_APP_ID],
      ["형식·릴리스 계약 테스트", GITHUB_ACTIONS_APP_ID],
      ["추적 소스 · 도달 가능한 이력 · dependency 검토", GITHUB_ACTIONS_APP_ID],
      ["실제 production CSP · 에디터 · 인쇄 · Blob SDK", GITHUB_ACTIONS_APP_ID],
      ["Vercel", VERCEL_APP_ID],
    ],
  );
});

const mutations = [
  ["PR paths 필터", "ci.yml", "    branches: [main]", "    branches: [main]\n    paths: ['src/**']"],
  ["보안 PR paths-ignore 필터", "repository-security.yml", "    branches: [main]", "    branches: [main]\n    paths-ignore: ['docs/**']"],
  ["synchronize 이벤트 삭제", "process-format.yml", ", synchronize,", ","],
  ["job 이름 변경", "repository-security.yml", "name: 추적 소스 · 도달 가능한 이력 · dependency 검토", "name: 보안 검증"],
  ["보안 job 건너뜀", "repository-security.yml", "  repository:\n    name:", "  repository:\n    if: false\n    name:"],
  ["브라우저 job 선행 의존성", "repository-security.yml", "  browser:\n    name:", "  browser:\n    needs: repository\n    name:"],
  ["continue-on-error", "repository-security.yml", "      - name: 실제 registry와 정확한 검토 기한 대조", "      - name: 실제 registry와 정확한 검토 기한 대조\n        continue-on-error: true"],
  ["필수 audit 실행 제거", "repository-security.yml", "run: npm run verify:dependencies", "run: echo skipped"],
  ["보안 검사 step 조건부", "repository-security.yml", "      - name: 실제 registry와 정확한 검토 기한 대조", "      - name: 실제 registry와 정확한 검토 기한 대조\n        if: false"],
  ["CSP 무효화", "repository-security.yml", "run: npm run verify:csp", "run: echo skipped"],
  ["운영 검사의 PR 허용", "production-smoke.yml", "if: github.event_name != 'pull_request'", "if: always()"],
  ["checkout 인증 남김", "repository-security.yml", "persist-credentials: false", "persist-credentials: true"],
  ["history 스캔 범위 축소", "repository-security.yml", "fetch-depth: 0", "fetch-depth: 1"],
  ["검사 명령을 주석에만 남김", "repository-security.yml", "run: npm run verify:dependencies", "run: |\n          true\n          # npm run verify:dependencies"],
  ["파일 목록에 미검토 workflow 추가", "extra.yml", null, null],
];

for (const [reason, name, original, replacement] of mutations) {
  test(reason + " 차단", () => {
    const files = baseline();
    if (name === "extra.yml") {
      files[name] = files["ci.yml"];
    } else {
      assert.ok(files[name].includes(original), reason + ": fixture changed");
      files[name] = files[name].replace(original, replacement);
    }
    assert.notDeepEqual(validateWorkflowCheckBoundaries(files), [], reason);
  });
}

test("YAML 중복 키·잘못된 파서는 fail-closed", () => {
  const files = baseline();
  files["ci.yml"] += "\non:\n  pull_request:\n";
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

test("실제 관리자 스냅샷 없이 필수 체크 적용 완료를 주장하지 않는다", () => {
  assert.equal(validateBranchProtection(protection()).ok, true);
  const missing = protection();
  missing.required_status_checks.checks = missing.required_status_checks.checks
    .filter((item) => !item.context.includes("dependency"));
  const result = validateBranchProtection(missing);
  assert.equal(result.ok, false);
  assert.equal(result.missingChecks.length, 1);
  const wrongApp = protection();
  wrongApp.required_status_checks.checks[5].app_id = GITHUB_ACTIONS_APP_ID;
  assert.equal(validateBranchProtection(wrongApp).ok, false);
  const unsafe = protection();
  unsafe.enforce_admins.enabled = false;
  assert.equal(validateBranchProtection(unsafe).ok, false);
});

test("CLI는 보호 JSON 스냅샷 대조를 명시적으로 요청할 때만 수행한다", () => {
  const root = mkdtempSync(join(tmpdir(), "hra-protection-fixture-"));
  try {
    const valid = join(root, "valid.json");
    const invalid = join(root, "invalid.json");
    writeFileSync(valid, JSON.stringify(protection()));
    writeFileSync(invalid, JSON.stringify({ required_status_checks: { strict: false, checks: [] } }));
    assert.match(execFileSync(process.execPath, [cli.pathname], { encoding: "utf8" }), /검사 통과/);
    assert.match(execFileSync(process.execPath, [cli.pathname, "--protection-file", valid],
      { encoding: "utf8" }), /검사 통과/);
    const failure = spawnSync(process.execPath, [cli.pathname, "--protection-file", invalid],
      { encoding: "utf8" });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /필수 체크|관리자 보호/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
