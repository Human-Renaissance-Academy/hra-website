/**
 * 역할: PR 필수 보안·품질 체크 경계와 main 브랜치 보호 설정 검증기의 회귀 테스트
 * 사용 위치:
 *   - .github/workflows/process-format.yml (외부 npm 패키지 없이 실행)
 *   - .github/workflows/repository-security.yml
 * 주요 기능:
 *   - 현재 `.github/workflows/*.yml` 전체가 6개 필수 체크 정본 및 관측 분리 경계를 통과하는지 검증
 *   - 이름 변경·paths 필터·if/needs skip·따옴표 키·비표준 들여쓰기·step.name 위장·continue-on-error·운영 호출 우회를 각각 변이 차단
 *   - GitHub 브랜치 보호 응답의 누락 체크·잘못된 app_id·조건부 체크 오등록·관리자 우회 허용을 차단
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXPECTED_WORKFLOW_FILES,
  GITHUB_ACTIONS_APP_ID,
  REQUIRED_MAIN_STATUS_CHECKS,
  VERCEL_APP_ID,
  validateBranchProtection,
  validateWorkflowCheckBoundaries,
} from "../_lib/required-checks-policy.mjs";

const workflowsDir = new URL("../../.github/workflows/", import.meta.url);
const cliPath = new URL("../check-required-checks-config.mjs", import.meta.url);

/** 현재 저장소 워크플로 전체를 읽어 변이 테스트 기준선으로 복제한다. */
function loadBaselineWorkflows() {
  const names = readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  return Object.fromEntries(
    names.map((name) => [name, readFileSync(new URL(name, workflowsDir), "utf8")]),
  );
}

/** 정본을 모두 만족하는 main 브랜치 보호 응답 fixture를 생성한다. */
function validProtectionFixture() {
  return {
    required_status_checks: {
      strict: true,
      contexts: REQUIRED_MAIN_STATUS_CHECKS.map((item) => item.context),
      checks: REQUIRED_MAIN_STATUS_CHECKS.map((item) => ({
        context: item.context,
        app_id: item.appId,
      })),
    },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

test("현재 저장소 워크플로는 필수 PR 체크 경계와 관측 분리 규칙을 통과한다", () => {
  const baseline = loadBaselineWorkflows();
  assert.deepEqual(Object.keys(baseline).sort(), [...EXPECTED_WORKFLOW_FILES]);
  assert.deepEqual(validateWorkflowCheckBoundaries(baseline), []);
});

test("필수 상태 검사 정본은 기존 CI·형식·Vercel에 두 보안 체크를 고정한다", () => {
  assert.deepEqual(
    REQUIRED_MAIN_STATUS_CHECKS.map((item) => ({ context: item.context, appId: item.appId })),
    [
      { context: "Lint · Typecheck · Test · Build", appId: GITHUB_ACTIONS_APP_ID },
      { context: "PR 형식", appId: GITHUB_ACTIONS_APP_ID },
      { context: "형식·릴리스 계약 테스트", appId: GITHUB_ACTIONS_APP_ID },
      { context: "추적 소스 · 도달 가능한 이력 · dependency 검토", appId: GITHUB_ACTIONS_APP_ID },
      { context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK", appId: GITHUB_ACTIONS_APP_ID },
      { context: "Vercel", appId: VERCEL_APP_ID },
    ],
  );
});

const workflowMutationCases = [
  [
    "미검토 신규 워크플로 추가 차단",
    (w) => {
      w["extra.yml"] = w["ci.yml"];
    },
  ],
  [
    "보안 워크플로에 paths 필터 추가(무기한 대기 유발) 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  pull_request:\n    branches: [main]\n",
        "  pull_request:\n    branches: [main]\n    paths:\n      - 'security/**'\n",
      );
    },
  ],
  [
    "따옴표 키로 paths 필터를 숨기는 우회(\"paths\") 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  pull_request:\n    branches: [main]\n",
        "  pull_request:\n    branches: [main]\n    \"paths\": [\"never/**\"]\n",
      );
    },
  ],
  [
    "pull_request 하위에서 branches 명시 제거 차단",
    (w) => {
      w["process-format.yml"] = w["process-format.yml"].replace(
        "    branches: [main]\n",
        "",
      );
    },
  ],
  [
    "앱 CI에 paths-ignore 추가(무기한 대기 유발) 차단",
    (w) => {
      w["ci.yml"] = w["ci.yml"].replace(
        "  pull_request:\n    branches: [main]\n",
        "  pull_request:\n    branches: [main]\n    paths-ignore:\n      - 'docs/**'\n",
      );
    },
  ],
  [
    "보안 워크플로에 branches-ignore 추가 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  pull_request:\n    branches: [main]\n",
        "  pull_request:\n    branches-ignore: [release]\n",
      );
    },
  ],
  [
    "형식 워크플로에서 synchronize 이벤트 제거 차단",
    (w) => {
      w["process-format.yml"] = w["process-format.yml"].replace(", synchronize,", ",");
    },
  ],
  [
    "필수 보안 job 이름 변경(브랜치 보호 매칭 불일치) 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "name: 추적 소스 · 도달 가능한 이력 · dependency 검토",
        "name: 저장소 보안 검사",
      );
    },
  ],
  [
    "필수 CSP job에 if 조건 추가(skipped 통과 우회) 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  browser:\n    name: 실제 production CSP · 에디터 · 인쇄 · Blob SDK\n",
        "  browser:\n    if: github.event_name != 'pull_request'\n    name: 실제 production CSP · 에디터 · 인쇄 · Blob SDK\n",
      );
    },
  ],
  [
    "필수 job이 skipped 선행 job을 needs로 의존하는 전이 skip 우회 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  browser:\n    name: 실제 production CSP · 에디터 · 인쇄 · Blob SDK\n",
        "  skip-gate:\n    if: github.event_name == 'schedule'\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n\n  browser:\n    needs: skip-gate\n    name: 실제 production CSP · 에디터 · 인쇄 · Blob SDK\n",
      );
    },
  ],
  [
    "PR 형식 job의 if 조건에 봇 예외 추가(skipped 통과 우회) 차단",
    (w) => {
      w["process-format.yml"] = w["process-format.yml"].replace(
        "if: github.event_name == 'pull_request'",
        "if: github.event_name == 'pull_request' && github.actor != 'dependabot[bot]'",
      );
    },
  ],
  [
    "PR 형식 실행 step에 봇 예외 if 추가 차단",
    (w) => {
      w["process-format.yml"] = w["process-format.yml"].replace(
        "      - run: node scripts/check-process-format.mjs --event\n        env:\n          GH_TOKEN: ${{ github.token }}\n          RELEASE_PLEASE_BOT_LOGIN: ${{ vars.RELEASE_PLEASE_BOT_LOGIN }}",
        "      - run: node scripts/check-process-format.mjs --event\n        if: github.actor != 'dependabot[bot]'\n        env:\n          GH_TOKEN: ${{ github.token }}\n          RELEASE_PLEASE_BOT_LOGIN: ${{ vars.RELEASE_PLEASE_BOT_LOGIN }}",
      );
    },
  ],
  [
    "앱 CI의 빌드 step에 if: false 추가 차단",
    (w) => {
      w["ci.yml"] = w["ci.yml"].replace(
        "      - name: Next.js 빌드\n        run: npm run build",
        "      - name: Next.js 빌드\n        if: false\n        run: npm run build",
      );
    },
  ],
  [
    "보안 단위 테스트 step에 따옴표 키 \"if\": \"false\" 추가 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 정책 실패 경로·산출물 차단 계약\n",
        "      - name: 정책 실패 경로·산출물 차단 계약\n        \"if\": \"false\"\n",
      );
    },
  ],
  [
    "비표준 step 들여쓰기('-   name:' + 10칸 속성)로 if/continue-on-error 숨기기 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: npm run verify:dependencies",
        "      -   name: 실제 registry와 정확한 검토 기한 대조\n          if: github.event_name == 'schedule'\n          continue-on-error: true\n          run: npm run verify:dependencies",
      );
    },
  ],
  [
    "step 이름에만 필수 명령을 적고 실제 run은 true로 바꾸는 위장 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: npm run verify:dependencies",
        "      - name: npm run verify:dependencies\n        run: true",
      );
    },
  ],
  [
    "step.run 주석에만 필수 명령을 남기는 위장 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: npm run verify:dependencies",
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: |\n          true\n          # npm run verify:dependencies",
      );
    },
  ],
  [
    "필수 job에 strategy matrix 추가(체크 이름 접미사 변형) 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "    runs-on: ubuntu-latest\n    timeout-minutes: 15\n",
        "    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [24]\n    timeout-minutes: 15\n",
      );
    },
  ],
  [
    "필수 단계에 continue-on-error 추가 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: npm run verify:dependencies",
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        continue-on-error: true\n        run: npm run verify:dependencies",
      );
    },
  ],
  [
    "필수 보안 단계에 조건부 step if 추가 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        run: npm run verify:dependencies",
        "      - name: 실제 registry와 정확한 검토 기한 대조\n        if: github.event_name == 'schedule'\n        run: npm run verify:dependencies",
      );
    },
  ],
  [
    "비필수 워크플로가 필수 체크 이름을 중복 선언(결과 혼동) 차단",
    (w) => {
      w["expanded-e2e.yml"] = w["expanded-e2e.yml"].replace(
        / {2}expanded:\n {4}name: [^\n]+/,
        "  expanded:\n    name: 실제 production CSP · 에디터 · 인쇄 · Blob SDK",
      );
    },
  ],
  [
    "보안 워크플로의 cancel-in-progress 활성화 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "cancel-in-progress: false",
        "cancel-in-progress: true",
      );
    },
  ],
  [
    "보안 job 수준 concurrency 추가(취소 우회) 차단",
    (w) => {
      w["repository-security.yml"] = w["repository-security.yml"].replace(
        "  repository:\n    name: 추적 소스 · 도달 가능한 이력 · dependency 검토\n",
        "  repository:\n    name: 추적 소스 · 도달 가능한 이력 · dependency 검토\n    concurrency:\n      group: custom-sec\n      cancel-in-progress: true\n",
      );
    },
  ],
  [
    "운영 가용성 점검의 PR 운영 호출 차단 조건 제거 차단",
    (w) => {
      w["production-smoke.yml"] = w["production-smoke.yml"].replace(
        "    if: github.event_name != 'pull_request'\n",
        "",
      );
    },
  ],
  [
    "조건부 인증 계측 워크플로의 paths 필터 제거 차단",
    (w) => {
      w["authentication-measurement.yml"] = w["authentication-measurement.yml"].replace(
        / {4}paths:\n(?: {6}- [^\n]+\n)+/,
        "",
      );
    },
  ],
  [
    "contracts의 PR OpenAPI 호환 검사를 workflow_dispatch 전용으로 바꾸는 우회 차단",
    (w) => {
      w["process-format.yml"] = w["process-format.yml"].replace(
        "      - name: OpenAPI 기존 계약 추가 전용 검사\n        if: github.event_name == 'push' || github.event_name == 'pull_request'",
        "      - name: OpenAPI 기존 계약 추가 전용 검사\n        if: github.event_name == 'workflow_dispatch'",
      );
    },
  ],
  [
    "YAML anchor/merge 문법을 통한 정적 검사 우회 차단",
    (w) => {
      w["ci.yml"] = `${w["ci.yml"]}\nanchor_trick: &trick\n`;
    },
  ],
];

for (const [caseName, mutate] of workflowMutationCases) {
  test(`워크플로 경계 회귀: ${caseName}`, () => {
    const baseline = loadBaselineWorkflows();
    const mutated = loadBaselineWorkflows();
    mutate(mutated);
    assert.notDeepEqual(mutated, baseline, `${caseName} 변이가 실제로 적용되지 않았습니다.`);
    const errors = validateWorkflowCheckBoundaries(mutated);
    assert.ok(errors.length > 0, `${caseName} 사례가 차단되지 않았습니다.`);
  });
}

test("정본과 일치하는 main 브랜치 보호 JSON은 검증을 통과한다", () => {
  const result = validateBranchProtection(validProtectionFixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingChecks, []);
  assert.deepEqual(result.unexpectedChecks, []);
  assert.deepEqual(result.errors, []);
});

test("보안 체크 2건이 빠진 이전 main 브랜치 보호 상태는 누락 항목을 정확히 진단한다", () => {
  const legacyProtection = validProtectionFixture();
  legacyProtection.required_status_checks.checks =
    legacyProtection.required_status_checks.checks.filter(
      (item) =>
        item.context !== "추적 소스 · 도달 가능한 이력 · dependency 검토" &&
        item.context !== "실제 production CSP · 에디터 · 인쇄 · Blob SDK",
    );
  const result = validateBranchProtection(legacyProtection);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingChecks, [
    { context: "추적 소스 · 도달 가능한 이력 · dependency 검토", appId: GITHUB_ACTIONS_APP_ID },
    { context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK", appId: GITHUB_ACTIONS_APP_ID },
  ]);
  assert.equal(result.errors.length, 2);
});

for (const [name, mutate] of [
  [
    "출처 미고정(app_id null) 상태 검사 거부",
    (p) => {
      p.required_status_checks.checks[0].app_id = null;
    },
  ],
  [
    "경로 필터가 있는 확장 E2E를 필수 체크로 잘못 등록한 경우 거부",
    (p) => {
      p.required_status_checks.checks.push({
        context: "공개 24건 · 학사 G1 10개 필수 사례",
        app_id: GITHUB_ACTIONS_APP_ID,
      });
    },
  ],
  [
    "strict 비활성화 거부",
    (p) => {
      p.required_status_checks.strict = false;
    },
  ],
  [
    "enforce_admins 비활성화 거부",
    (p) => {
      p.enforce_admins.enabled = false;
    },
  ],
  [
    "force push 허용 거부",
    (p) => {
      p.allow_force_pushes.enabled = true;
    },
  ],
  [
    "브랜치 삭제 허용 거부",
    (p) => {
      p.allow_deletions.enabled = true;
    },
  ],
]) {
  test(`브랜치 보호 설정 오류 차단: ${name}`, () => {
    const input = validProtectionFixture();
    mutate(input);
    const result = validateBranchProtection(input);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  });
}

test("CLI는 기본 워크플로 검사와 --protection-file 검증을 모두 수행하고 알 수 없는 인수를 거부한다", () => {
  const defaultOut = execFileSync(process.execPath, [cliPath.pathname], { encoding: "utf8" });
  assert.match(defaultOut, /워크플로 필수 체크·관측 분리 경계 검사 통과/);

  const tempDir = mkdtempSync(join(tmpdir(), "hra-req-checks-"));
  try {
    const validFile = join(tempDir, "valid-protection.json");
    const missingFile = join(tempDir, "missing-protection.json");
    writeFileSync(validFile, JSON.stringify(validProtectionFixture()), "utf8");

    const validOut = execFileSync(
      process.execPath,
      [cliPath.pathname, "--protection-file", validFile],
      { encoding: "utf8" },
    );
    assert.match(validOut, /main 브랜치 보호 설정 검사 통과/);

    const incomplete = validProtectionFixture();
    incomplete.required_status_checks.checks.pop();
    writeFileSync(missingFile, JSON.stringify(incomplete), "utf8");

    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath.pathname, "--protection-file", missingFile], {
          encoding: "utf8",
          stdio: "pipe",
        }),
      /필수 체크가 누락되었습니다/,
    );

    assert.throws(
      () =>
        execFileSync(process.execPath, [cliPath.pathname, "--unknown-flag"], {
          encoding: "utf8",
          stdio: "pipe",
        }),
      /알 수 없는 인수입니다/,
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
