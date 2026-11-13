/** #408: 기존 js-yaml 파서로 필수 체크 생성·skip·출처 정책을 검증합니다. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { collectEnvironmentReferences } from "../_lib/environment-contract.mjs";
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

test("YAML 환경 매핑 검사는 실제 환경변수 접근 계약과 충돌하지 않는다", () => {
  const path = "scripts/_lib/required-checks-policy.mjs";
  const text = readFileSync(new URL("../_lib/required-checks-policy.mjs", import.meta.url), "utf8");
  // 정책 파일은 YAML 데이터만 읽으므로 전역 실행 환경의 이름이나 동적 접근이 없어야 합니다.
  const result = collectEnvironmentReferences([{ path, text }]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.references.size, 0);
});

function baseline() {
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => /\.ya?ml$/.test(name))
      .map((name) => [name, readFileSync(new URL(name, directory), "utf8")]),
  );
}

function protection() {
  return {
    required_status_checks: {
      strict: true,
      checks: REQUIRED_MAIN_STATUS_CHECKS.map(({ context, appId }) => ({
        context,
        app_id: appId,
      })),
    },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

test("승인된 10개 workflow와 모든 필수 PR 검사 경계가 유지된다", () => {
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
  [
    "PR paths 필터",
    "ci.yml",
    "    branches: [main]",
    "    branches: [main]\n    paths: ['src/**']",
  ],
  [
    "보안 PR paths-ignore 필터",
    "repository-security.yml",
    "    branches: [main]",
    "    branches: [main]\n    paths-ignore: ['docs/**']",
  ],
  ["synchronize 이벤트 삭제", "process-format.yml", ", synchronize,", ","],
  [
    "job 이름 변경",
    "repository-security.yml",
    "name: 추적 소스 · 도달 가능한 이력 · dependency 검토",
    "name: 보안 검증",
  ],
  [
    "보안 job 건너뜀",
    "repository-security.yml",
    "  repository:\n    name:",
    "  repository:\n    if: false\n    name:",
  ],
  [
    "브라우저 job 선행 의존성",
    "repository-security.yml",
    "  browser:\n    name:",
    "  browser:\n    needs: repository\n    name:",
  ],
  [
    "continue-on-error",
    "repository-security.yml",
    "      - name: 실제 registry와 정확한 검토 기한 대조",
    "      - name: 실제 registry와 정확한 검토 기한 대조\n        continue-on-error: true",
  ],
  [
    "필수 audit 실행 제거",
    "repository-security.yml",
    "run: npm run verify:dependencies",
    "run: echo skipped",
  ],
  [
    "보안 검사 step 조건부",
    "repository-security.yml",
    "      - name: 실제 registry와 정확한 검토 기한 대조",
    "      - name: 실제 registry와 정확한 검토 기한 대조\n        if: false",
  ],
  ["CSP 무효화", "repository-security.yml", "run: npm run verify:csp", "run: echo skipped"],
  [
    "운영 검사의 PR 허용",
    "production-smoke.yml",
    "if: github.event_name != 'pull_request'",
    "if: always()",
  ],
  [
    "checkout 인증 남김",
    "repository-security.yml",
    "persist-credentials: false",
    "persist-credentials: true",
  ],
  ["history 스캔 범위 축소", "repository-security.yml", "fetch-depth: 0", "fetch-depth: 1"],
  [
    "검사 명령을 주석에만 남김",
    "repository-security.yml",
    "run: npm run verify:dependencies",
    "run: |\n          true\n          # npm run verify:dependencies",
  ],
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
  missing.required_status_checks.checks = missing.required_status_checks.checks.filter(
    (item) => !item.context.includes("dependency"),
  );
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
    writeFileSync(
      invalid,
      JSON.stringify({ required_status_checks: { strict: false, checks: [] } }),
    );
    assert.match(execFileSync(process.execPath, [cli.pathname], { encoding: "utf8" }), /검사 통과/);
    assert.match(
      execFileSync(process.execPath, [cli.pathname, "--protection-file", valid], {
        encoding: "utf8",
      }),
      /검사 통과/,
    );
    const failure = spawnSync(process.execPath, [cli.pathname, "--protection-file", invalid], {
      encoding: "utf8",
    });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /필수 체크|관리자 보호/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("커밋 메시지 검사가 비활성 명령으로 바뀌면 차단한다", () => {
  const files = baseline();
  const name = "process-format.yml";
  assert.match(files[name], /node scripts\/check-commit-messages\.mjs/);
  files[name] = files[name].replace(
    /node scripts\/check-commit-messages\.mjs[^\n]*/,
    "echo bypass",
  );
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

test("모든 필수 PR workflow에서 synchronize 생성을 보장한다", () => {
  for (const filename of ["ci.yml", "repository-security.yml"]) {
    const files = baseline();
    files[filename] = files[filename].replace(
      "  pull_request:\n    branches: [main]",
      "  pull_request:\n    branches: [main]\n    types: [opened]",
    );
    assert.notDeepEqual(validateWorkflowCheckBoundaries(files), [], filename);
  }
  const files = baseline();
  const fullEvents =
    "types: [opened, edited, reopened, synchronize, ready_for_review, labeled, unlabeled]";
  assert.ok(files["process-format.yml"].includes(fullEvents));
  files["process-format.yml"] = files["process-format.yml"].replace(
    fullEvents,
    "types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled]",
  );
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

test("브라우저 스모크 실제 실행을 제거하고 --list만 남기면 차단한다", () => {
  const files = baseline();
  const before = "run: npm run test:e2e -- tests/e2e/ci-smoke.spec.ts\n";
  assert.ok(files["ci.yml"].includes(before));
  files["ci.yml"] = files["ci.yml"].replace(before, "run: echo smoke-not-run\n");
  assert.ok(files["ci.yml"].includes("npm run test:e2e -- tests/e2e/ci-smoke.spec.ts --list"));
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

test("OpenAPI·커밋 이력의 조건부 필수 실행 단계를 삭제하면 차단한다", () => {
  for (const stepName of Object.keys({
    "OpenAPI 기존 계약 추가 전용 검사": true,
    "OpenAPI 현재 문서·Route 검사": true,
    "새 커밋 메시지 검사": true,
  })) {
    const files = baseline();
    const content = files["process-format.yml"];
    const marker = "      - name: " + stepName + "\n";
    const start = content.indexOf(marker);
    assert.ok(start >= 0, stepName + " fixture missing");
    const nextStep = content.indexOf("\n      - ", start + marker.length);
    const nextJob = content.indexOf("\n  audit:", start + marker.length);
    const end = nextStep >= 0 ? nextStep : nextJob;
    assert.ok(end > start, stepName + " cannot find next boundary");
    files["process-format.yml"] = content.slice(0, start) + content.slice(end + 1);
    assert.notDeepEqual(validateWorkflowCheckBoundaries(files), [], stepName);
  }
});

test("필수 조건부 스텝을 중복 선언하면 차단한다", () => {
  const files = baseline();
  const anchor = "      - name: OpenAPI 현재 문서·Route 검사";
  assert.ok(files["process-format.yml"].includes(anchor));
  files["process-format.yml"] = files["process-format.yml"].replace(
    anchor,
    "      - name: OpenAPI 기존 계약 추가 전용 검사\n" + anchor,
  );
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

/** 실제 두 구현 대조에서 발견한 실행 무력화·0범위·context 중복을 고정합니다. */
/** 원문 치환이 실제로 적용됐는지 확인하여 비어 있는 변이를 통과시키지 않습니다. */
function replace(files, file, before, after) {
  assert.ok(files[file].includes(before), file + ": fixture changed");
  return { ...files, [file]: files[file].replace(before, after) };
}

/** 조건부 단계 한 건만 바꾸고 다음 단계·job 원문은 보존합니다. */
function step(files, name, transform) {
  const file = "process-format.yml";
  const source = files[file];
  const marker = "      - name: " + name + "\n";
  const start = source.indexOf(marker);
  assert.ok(start >= 0, name + ": fixture missing");
  const tail = source.slice(start + marker.length);
  const match = tail.match(/\n(?:      - |  [a-z][a-z-]*:)/);
  assert.ok(match, name + ": next boundary missing");
  const end = start + marker.length + match.index;
  return {
    ...files,
    [file]: source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end),
  };
}

const hardeningMutations = [
  ["echo-command", (f) => replace(f, "ci.yml", "run: npm run lint", "run: echo npm run lint")],
  [
    "printf-command",
    (f) => replace(f, "ci.yml", "run: npm run lint", `run: printf 'npm run lint'`),
  ],
  [
    "failure-absorbed",
    (f) => replace(f, "ci.yml", "run: npm run lint", "run: npm run lint || true"),
  ],
  [
    "npm-config-prelude",
    (f) =>
      replace(
        f,
        "ci.yml",
        "run: npm run lint",
        "run: |\n          npm config set script-shell /usr/bin/true\n          npm run lint",
      ),
  ],
  [
    "node-test-filter",
    (f) =>
      replace(
        f,
        "ci.yml",
        "node --test scripts/tests/required-checks-policy.test.mjs",
        "node --test --test-name-pattern=never-match scripts/tests/required-checks-policy.test.mjs",
      ),
  ],
  [
    "scanner-failure-absorbed",
    (f) =>
      replace(
        f,
        "repository-security.yml",
        'npm run verify:repository-secrets -- --gitleaks "$scanner_dir/gitleaks"',
        'npm run verify:repository-secrets -- --gitleaks "$scanner_dir/gitleaks" || true',
      ),
  ],
  [
    "early-success",
    (f) =>
      replace(f, "ci.yml", "run: npm run lint", "run: |\n          exit 0\n          npm run lint"),
  ],
  [
    "npm-noop-step",
    (f) =>
      replace(
        f,
        "ci.yml",
        "run: npm run lint",
        "env:\n          npm_config_script_shell: /usr/bin/true\n        run: npm run lint",
      ),
  ],
  [
    "npm-noop-job",
    (f) =>
      replace(
        f,
        "ci.yml",
        "    env:\n",
        "    env:\n      NPM_CONFIG_SCRIPT_SHELL: /usr/bin/true\n",
      ),
  ],
  [
    "node-options-step",
    (f) =>
      replace(
        f,
        "ci.yml",
        "run: npm run lint",
        "env:\n          NODE_OPTIONS: --require /tmp/exit-zero.cjs\n        run: npm run lint",
      ),
  ],
  ["path-workflow", (f) => replace(f, "ci.yml", "jobs:\n", "env:\n  PATH: /tmp/noop-bin\njobs:\n")],
  [
    "shell-defaults",
    (f) => replace(f, "ci.yml", "jobs:\n", "defaults:\n  run:\n    shell: bash {0}\njobs:\n"),
  ],
  [
    "history-same-sha",
    (f) =>
      step(f, "새 커밋 메시지 검사", (s) =>
        s
          .replace(
            "BASE_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}",
            "BASE_SHA: ${{ github.sha }}",
          )
          .replace(
            "HEAD_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}",
            "HEAD_SHA: ${{ github.sha }}",
          ),
      ),
  ],
  [
    "history-wrong-event-mode",
    (f) =>
      step(f, "새 커밋 메시지 검사", (s) =>
        s.replace(
          "HISTORY_MODE: ${{ github.event_name == 'pull_request' && '--pr-history' || '--history' }}",
          "HISTORY_MODE: ${{ github.event_name == 'pull_request' && '--history' || '--pr-history' }}",
        ),
      ),
  ],
  [
    "context-exact-duplicate",
    (f) =>
      replace(
        f,
        "mobile.yml",
        "name: 계약 · 타입 · 린트 · 테스트 · 번들",
        "name: Lint · Typecheck · Test · Build",
      ),
  ],
  [
    "context-dynamic-duplicate",
    (f) =>
      replace(
        f,
        "mobile.yml",
        "name: 계약 · 타입 · 린트 · 테스트 · 번들",
        "name: ${{ format('Lint · Typecheck · Test · {0}', 'Build') }}",
      ),
  ],
  [
    "context-yaml-escaped-duplicate",
    (f) =>
      replace(
        f,
        "mobile.yml",
        "name: 계약 · 타입 · 린트 · 테스트 · 번들",
        String.raw`name: "\u004cint · Typecheck · Test · Build"`,
      ),
  ],
  ["push-removed", (f) => replace(f, "ci.yml", "  push:\n    branches: [main]\n", "")],
  [
    "push-filter",
    (f) =>
      replace(
        f,
        "ci.yml",
        "  push:\n    branches: [main]",
        "  push:\n    branches: [main]\n    paths: [src]",
      ),
  ],
  ["contents-write", (f) => replace(f, "ci.yml", "  contents: read", "  contents: write")],
  [
    "pr-edited-removed",
    (f) =>
      replace(
        f,
        "process-format.yml",
        "types: [opened, edited, reopened, synchronize, ready_for_review, labeled, unlabeled]",
        "types: [opened, reopened, synchronize, ready_for_review, labeled, unlabeled]",
      ),
  ],
  [
    "conditional-name-duplicate",
    (f) =>
      replace(
        f,
        "process-format.yml",
        "      - name: OpenAPI 현재 문서·Route 검사",
        "      - name: OpenAPI 기존 계약 추가 전용 검사\n      - name: OpenAPI 현재 문서·Route 검사",
      ),
  ],
  ...[
    "OpenAPI 기존 계약 추가 전용 검사",
    "OpenAPI 현재 문서·Route 검사",
    "새 커밋 메시지 검사",
  ].flatMap((name) => [
    ["delete-" + name, (f) => step(f, name, () => "")],
    [
      "noop-without-if-" + name,
      (f) =>
        step(f, name, (s) =>
          s
            .replace(/\n        if:[^\n]*/, "")
            .replace(/\n        run:[^\n]*/, "\n        run: echo no-check"),
        ),
    ],
    [
      "absorbed-" + name,
      (f) => step(f, name, (s) => s.replace(/(\n        run:[^\n]*)/, "$1 || true")),
    ],
  ]),
];

for (const [reason, mutate] of hardeningMutations) {
  test(reason + " 실제 음성 변이 차단", () => {
    const files = baseline();
    const changed = mutate(files);
    assert.notDeepEqual(changed, files);
    assert.notDeepEqual(validateWorkflowCheckBoundaries(changed), [], reason);
  });
}

// 알려진 변수명 블록리스트 대신 모든 적용 범위에서 검토한 환경 매핑을 요구합니다.
for (const variable of [
  "npm_config_script_shell",
  "NPM_CONFIG_SCRIPT_SHELL",
  "NODE_OPTIONS",
  "PATH",
  "BASH_ENV",
  "ENV",
  "NPM_CONFIG_USERCONFIG",
]) {
  for (const scope of ["workflow", "job", "step"]) {
    test(scope + " 미검토 실행 환경 " + variable + " 차단", () => {
      const files = baseline();
      const value = "/tmp/unreviewed-execution-config";
      const changed =
        scope === "workflow"
          ? replace(files, "ci.yml", "jobs:\n", `env:\n  ${variable}: ${value}\njobs:\n`)
          : scope === "job"
            ? replace(files, "ci.yml", "    env:\n", `    env:\n      ${variable}: ${value}\n`)
            : replace(
                files,
                "ci.yml",
                "run: npm run lint",
                `env:\n          ${variable}: ${value}\n        run: npm run lint`,
              );
      assert.notDeepEqual(validateWorkflowCheckBoundaries(changed), []);
    });
  }
}

test("실제 YAML escape 해석으로 생긴 필수 context도 중복으로 검출한다", () => {
  const files = replace(
    baseline(),
    "mobile.yml",
    "name: 계약 · 타입 · 린트 · 테스트 · 번들",
    String.raw`name: "\u004cint · Typecheck · Test · Build"`,
  );
  assert.equal(
    parseWorkflow(files["mobile.yml"]).jobs.checks.name,
    "Lint · Typecheck · Test · Build",
  );
  assert.notDeepEqual(validateWorkflowCheckBoundaries(files), []);
});

for (const [reason, mutate] of [
  [
    "job shell 기본값",
    (files) =>
      replace(
        files,
        "ci.yml",
        "    steps:\n",
        "    defaults:\n      run:\n        shell: bash {0}\n    steps:\n",
      ),
  ],
  [
    "step shell",
    (files) =>
      replace(files, "ci.yml", "run: npm run lint", "shell: bash {0}\n        run: npm run lint"),
  ],
  [
    "step 실행 경로",
    (files) =>
      replace(
        files,
        "ci.yml",
        "run: npm run lint",
        "working-directory: apps/mobile\n        run: npm run lint",
      ),
  ],
]) {
  test(reason + " 변경으로 필수 실행 경계가 달라지면 차단한다", () => {
    assert.notDeepEqual(validateWorkflowCheckBoundaries(mutate(baseline())), []);
  });
}

// 단일 명령의 문법만 검사하면 이전 단계가 npm 설정/다음 단계 환경을 바꾸는 경로가 남습니다.
for (const [reason, mutate] of [
  [
    "job contents 권한 덮어쓰기",
    (files) =>
      replace(
        files,
        "ci.yml",
        "    runs-on: ubuntu-latest",
        "    runs-on: ubuntu-latest\n    permissions:\n      contents: write",
      ),
  ],
  [
    "선행 npm 영속 설정 변경",
    (files) =>
      replace(
        files,
        "ci.yml",
        "      - name: ESLint 검사",
        "      - run: npm config set script-shell /usr/bin/true\n      - name: ESLint 검사",
      ),
  ],
  [
    "선행 GITHUB_ENV 실행 환경 변경",
    (files) =>
      replace(
        files,
        "ci.yml",
        "      - name: ESLint 검사",
        '      - run: echo "npm_config_script_shell=/usr/bin/true" >> "$GITHUB_ENV"\n      - name: ESLint 검사',
      ),
  ],
  [
    "기존 보조 gate 제거",
    (files) =>
      replace(files, "ci.yml", "          node scripts/check-db-source-inventory.mjs\n", ""),
  ],
  [
    "기존 단계 순서 변경",
    (files) =>
      replace(
        files,
        "ci.yml",
        "      - name: ESLint 검사\n        run: npm run lint\n\n      - name: TypeScript 타입 검사\n        run: npm run typecheck",
        "      - name: TypeScript 타입 검사\n        run: npm run typecheck\n\n      - name: ESLint 검사\n        run: npm run lint",
      ),
  ],
  [
    "검토하지 않은 action 참조",
    (files) =>
      replace(
        files,
        "ci.yml",
        "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
        "unreviewed/setup-node@main",
      ),
  ],
]) {
  test(reason + " 검토한 pipeline/권한 경계 이탈을 차단한다", () => {
    const errors = validateWorkflowCheckBoundaries(mutate(baseline()));
    assert.notDeepEqual(errors, []);
    if (reason === "job contents 권한 덮어쓰기")
      assert.ok(errors.some((error) => error.includes("job permissions")));
    else assert.ok(errors.some((error) => error.includes("REVIEWED_PIPELINE_DRIFT")));
  });
}

// 최신 scope 그래프는 정상 생략만 허용하며, 탐지 실패/출력 누락은 항상 전체 CI로 복귀해야 합니다.
const scopeMutations = [
  [
    "실패 시 복귀 삭제",
    "ci.yml",
    "always() && (needs.scope.result != 'success' || needs.scope.outputs.web != 'false')",
    "needs.scope.outputs.web == 'true'",
    "job if/needs",
  ],
  ["scope 의존성 삭제", "ci.yml", "    needs: scope\n", "", "job if/needs"],
  [
    "scope 출력 위조",
    "ci.yml",
    "web: ${{ steps.detect.outputs.web }}",
    "web: 'false'",
    "scope output",
  ],
  [
    "scope detector 대체",
    "ci.yml",
    'node scripts/detect-ci-scope.mjs "$GITHUB_EVENT_NAME" "$GITHUB_OUTPUT"',
    "echo web=false",
    "scope output",
  ],
  [
    "scope 포맷 조건부 생략",
    "ci.yml",
    "      - name: 변경 소스 포맷 검사",
    "      - if: false\n        name: 변경 소스 포맷 검사",
    "unauthorized conditional",
  ],
  [
    "상시 계약 검증기 제거",
    "process-format.yml",
    "      - run: node scripts/check-required-checks-config.mjs\n",
    "",
    "required executable command",
  ],
  ["수동 EAS PR 실행", "mobile-eas-build.yml", "on:\n", "on:\n  pull_request:\n", "manual-only"],
  [
    "EAS 동적 이름 확대",
    "mobile-eas-build.yml",
    "${{ inputs.platform }} · ${{ inputs.profile }}",
    "${{ inputs.context }}",
    "unowned job name",
  ],
  [
    "EAS 플랫폼 확대",
    "mobile-eas-build.yml",
    "options: [android, ios]",
    "options: [android, ios, arbitrary]",
    "manual-only",
  ],
];

for (const [name, file, before, after, diagnostic] of scopeMutations) {
  test(name + " 최신 그래프 경계를 직접 검증한다", () => {
    const files = baseline();
    assert.ok(files[file].includes(before));
    files[file] = files[file].replace(before, after);
    assert.ok(validateWorkflowCheckBoundaries(files).some((error) => error.includes(diagnostic)));
  });
}

// 실제 container나 runner를 실행하지 않고 YAML 데이터만 바꿔 검토한 여섯 job의 실행 경계를 확인합니다.
const reviewedExecutionJobs = [
  ...REQUIRED_MAIN_STATUS_CHECKS.filter((check) => check.file),
  { file: "ci.yml", job: "scope" },
];
const executionMutations = reviewedExecutionJobs.flatMap(({ file, job }) => [
  [file + ":" + job + ":runner", file, job, "runs-on", "self-hosted", "execution boundary"],
  [
    file + ":" + job + ":runner-array",
    file,
    job,
    "runs-on",
    ["ubuntu-latest"],
    "execution boundary",
  ],
  [
    file + ":" + job + ":container",
    file,
    job,
    "container",
    { image: "example.invalid/review-only:never-executed" },
    "execution boundary",
  ],
  [file + ":" + job + ":services", file, job, "services", {}, "execution boundary"],
  [
    file + ":" + job + ":defaults",
    file,
    job,
    "defaults",
    { run: { shell: "bash" } },
    "environment/defaults",
  ],
]);
const cliMutations = [
  ...scopeMutations.map(([name, file, before, after]) => [
    name,
    (files) => {
      files[file] = files[file].replace(before, after);
    },
  ]),
  ...executionMutations.map(([name, file, job, field, value]) => [
    name,
    (files) => {
      const workflow = parseWorkflow(files[file]);
      workflow.jobs[job][field] = value;
      files[file] = JSON.stringify(workflow);
    },
  ]),
  ...["ci.yml", "process-format.yml", "repository-security.yml"].map((file) => [
    file + ":workflow-defaults",
    (files) => {
      const workflow = parseWorkflow(files[file]);
      workflow.defaults = { run: { shell: "bash" } };
      files[file] = JSON.stringify(workflow);
    },
  ]),
];

test("검토한 여섯 job은 ubuntu-latest이며 container/services/defaults가 없다", () => {
  const files = baseline();
  for (const { file, job } of reviewedExecutionJobs) {
    const current = parseWorkflow(files[file]).jobs[job];
    assert.equal(current["runs-on"], "ubuntu-latest");
    for (const field of ["container", "services", "defaults"])
      assert.equal(current[field], undefined);
  }
});
for (const [name, file, job, field, value, diagnostic] of executionMutations) {
  test(name + " 단계 지문과 독립적으로 실행 경계 이탈을 거부한다", () => {
    const files = baseline();
    const workflow = parseWorkflow(files[file]);
    workflow.jobs[job][field] = value;
    files[file] = JSON.stringify(workflow);
    const errors = validateWorkflowCheckBoundaries(files);
    assert.ok(errors.some((error) => error.includes(diagnostic)));
    assert.equal(
      errors.some((error) => error.includes("REVIEWED_PIPELINE_DRIFT")),
      false,
    );
  });
}

// 실제 CLI와 동일한 상대 경로 구조에서 음성 변이를 실행해 라이브러리 검사만 통과하는 공백을 막습니다.
test("최신 그래프와 실행 환경 음성 변이는 실제 CLI에서도 종료 코드 1로 차단한다", () => {
  const root = mkdtempSync(join(tmpdir(), "hra-checks-cli-mutations-"));
  try {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    mkdirSync(join(root, "scripts/_lib"), { recursive: true });
    symlinkSync(
      new URL("../../node_modules", import.meta.url).pathname,
      join(root, "node_modules"),
      "dir",
    );
    for (const path of ["check-required-checks-config.mjs", "_lib/required-checks-policy.mjs"]) {
      writeFileSync(
        join(root, "scripts", path),
        readFileSync(new URL("../" + path, import.meta.url)),
      );
    }
    for (const [name, mutate] of cliMutations) {
      const files = baseline();
      mutate(files);
      for (const [path, text] of Object.entries(files))
        writeFileSync(join(root, ".github/workflows", path), text);
      const result = spawnSync(
        process.execPath,
        [join(root, "scripts/check-required-checks-config.mjs")],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1, name);
      assert.match(result.stdout, /검사 실패/, name);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// GitHub 식의 검토된 논리식을 합성 needs 결과에 적용합니다. 실제 runner 취소 결과의 증거는 아닙니다.
test("scope 실패·취소·생략·출력 누락은 전체 CI, 정상 문서 범위만 생략한다", () => {
  const workflow = parseWorkflow(baseline()["ci.yml"]);
  const expression = workflow.jobs.ci.if.slice(3, -2).trim();
  for (const result of ["success", "failure", "cancelled", "skipped"]) {
    for (const web of ["false", "true", undefined]) {
      const run = runInNewContext(expression, {
        always: () => true,
        needs: { scope: { result, outputs: { web } } },
      });
      assert.equal(run, !(result === "success" && web === "false"), result + ":" + web);
    }
  }
  const contracts = parseWorkflow(baseline()["process-format.yml"]).jobs.contracts;
  assert.equal(contracts.needs, undefined);
  assert.equal(contracts.if, "github.event_name != 'issues'");
  assert.ok(
    contracts.steps.some(
      (step) =>
        step.run === "node scripts/check-required-checks-config.mjs" && step.if === undefined,
    ),
  );
});
