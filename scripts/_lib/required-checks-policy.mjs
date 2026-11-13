/** #408: 실행 가능한 PR 검사 이름·트리거와 보안 게이트의 최소 구조를 검사합니다.
 * 실제 main 보호 설정과 Vercel Git 연동은 이 파일로 변경되지 않습니다.
 * YAML 문법은 기존 의존성 js-yaml JSON_SCHEMA를 사용하며 자체 파서를 만들지 않습니다.
 */
import yaml from "js-yaml";
import { createHash } from "node:crypto";

export const GITHUB_ACTIONS_APP_ID = 15368;
export const VERCEL_APP_ID = 8329;

// 2026-11-03에 제안된 목표 설정입니다. 실제 GitHub 관리 화면의 현재 값이 아닙니다.
export const REQUIRED_MAIN_STATUS_CHECKS = Object.freeze([
  {
    context: "Lint · Typecheck · Test · Build",
    appId: GITHUB_ACTIONS_APP_ID,
    file: "ci.yml",
    job: "ci",
  },
  {
    context: "PR 형식",
    appId: GITHUB_ACTIONS_APP_ID,
    file: "process-format.yml",
    job: "pull-request",
  },
  {
    context: "형식·릴리스 계약 테스트",
    appId: GITHUB_ACTIONS_APP_ID,
    file: "process-format.yml",
    job: "contracts",
  },
  {
    context: "추적 소스 · 도달 가능한 이력 · dependency 검토",
    appId: GITHUB_ACTIONS_APP_ID,
    file: "repository-security.yml",
    job: "repository",
  },
  {
    context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK",
    appId: GITHUB_ACTIONS_APP_ID,
    file: "repository-security.yml",
    job: "browser",
  },
  { context: "Vercel", appId: VERCEL_APP_ID, file: null, job: null },
]);

export const NON_REQUIRED_WORKFLOWS = Object.freeze([
  "authentication-measurement.yml",
  "expanded-e2e.yml",
  "mobile-server-e2e.yml",
  "mobile-eas-build.yml",
  "mobile.yml",
  "production-smoke.yml",
  "release-please.yml",
]);
export const EXPECTED_WORKFLOW_FILES = Object.freeze(
  ["ci.yml", "process-format.yml", "repository-security.yml", ...NON_REQUIRED_WORKFLOWS].sort(),
);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const CHECK_COMMANDS = {
  "ci.yml:scope": [
    "npm run format:check",
    "node --test scripts/tests/code-format-scope.test.mjs",
    "node --test scripts/tests/ci-scope.test.mjs",
    'node scripts/detect-ci-scope.mjs "$GITHUB_EVENT_NAME" "$GITHUB_OUTPUT"',
  ],
  "ci.yml:ci": [
    "node --test scripts/tests/required-checks-policy.test.mjs",
    "node scripts/check-required-checks-config.mjs",
    "npm run lint",
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run verify:auth-proxy",
    "npm run test:academic-g1",
    "npm run test:e2e -- tests/e2e/ci-smoke.spec.ts",
  ],
  "process-format.yml:pull-request": ["node scripts/check-process-format.mjs --event"],
  "process-format.yml:contracts": [
    "node --test scripts/tests/required-checks-policy.test.mjs",
    "node scripts/check-required-checks-config.mjs",
    "node --test scripts/tests/release-policy.test.mjs",
    "node scripts/check-release-config.mjs",
    "node --test scripts/tests/commit-messages.test.mjs",
    "node --test scripts/tests/openapi-append-only.test.mjs scripts/tests/openapi-cli.test.mjs",
  ],
  "repository-security.yml:repository": [
    "scripts/tests/secret-scan.test.mjs",
    "scripts/tests/dependency-policy.test.mjs",
    "scripts/tests/repository-security-workflow.test.mjs",
    "node scripts/check-required-checks-config.mjs",
    "npm run verify:public-sources",
    "npm run verify:repository-secrets",
    "npm run verify:dependencies",
  ],
  "repository-security.yml:browser": [
    "node --test scripts/tests/csp-browser.test.mjs",
    "npm run verify:csp",
  ],
};
const JOB_IF = {
  "ci.yml:ci":
    "${{ always() && (needs.scope.result != 'success' || needs.scope.outputs.web != 'false') }}",
  "process-format.yml:pull-request": "github.event_name == 'pull_request'",
  "process-format.yml:contracts": "github.event_name != 'issues'",
};
// PR과 push의 모드·범위가 바뀌면 0개 커밋을 검사하고 성공할 수 있어 정확한 식을 고정합니다.
const BASE_SHA =
  "${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}";
const HEAD_SHA =
  "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
const HISTORY_MODE = "${{ github.event_name == 'pull_request' && '--pr-history' || '--history' }}";
const CONDITIONAL_STEPS = {
  "OpenAPI 기존 계약 추가 전용 검사": {
    command: 'node scripts/check-openapi-compat.mjs --base-sha "$BASE_SHA"',
    condition: "github.event_name == 'push' || github.event_name == 'pull_request'",
    environment: { BASE_SHA },
  },
  "OpenAPI 현재 문서·Route 검사": {
    command: "node scripts/check-openapi-compat.mjs --self",
    condition: "github.event_name == 'workflow_dispatch'",
    environment: {},
  },
  "새 커밋 메시지 검사": {
    command: 'node scripts/check-commit-messages.mjs "$HISTORY_MODE" "$BASE_SHA" "$HEAD_SHA"',
    condition: "github.event_name == 'push' || github.event_name == 'pull_request'",
    environment: { HISTORY_MODE, BASE_SHA, HEAD_SHA },
  },
};

/** 환경 값을 오류에 출력하지 않고 검토한 키·값·완전성만 대조합니다. */
function sameEnvironment(actual, expected) {
  return (
    (actual === undefined || isObject(actual)) &&
    Object.keys(actual ?? {}).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual?.[key] === value)
  );
}

/** npm 별칭·NODE_OPTIONS·PATH·BASH_ENV·ENV 등을 놓치지 않도록 필요한 환경만 허용합니다.
 * CI의 합성 DB/세션, PR 형식의 읽기 토큰, 조건부 검사의 고정 범위 외에는 현재 필요 환경이 없습니다.
 * 플랫폼 환경이나 임의 셸의 무결성을 입증하는 sandbox는 아닙니다.
 */
function expectedEnvironment(key, step) {
  if (!step && key === "ci.yml:ci")
    return {
      DATABASE_URL: "postgresql://ci:ci@127.0.0.1:1/isolated",
      AUTH_SECRET: "ci-only-secret-for-isolated-smoke-tests",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    };
  if (
    step &&
    key === "process-format.yml:pull-request" &&
    step.run === "node scripts/check-process-format.mjs --event"
  )
    return {
      GH_TOKEN: "${{ github.token }}",
      RELEASE_PLEASE_BOT_LOGIN: "${{ vars.RELEASE_PLEASE_BOT_LOGIN }}",
    };
  if (step && key === "process-format.yml:contracts")
    return CONDITIONAL_STEPS[step.name]?.environment ?? {};
  return {};
}

/** 검토한 scanner 복합 셸의 변경 감지입니다. 보안 승인이나 실제 실행 증거가 아닙니다.
 * 함수·trap·파이프·실패 흡수 등 본문이 바뀌면 해당 실행/음성 회귀를 검토한 뒤 지문과 회귀를 함께 갱신합니다.
 */
const SCANNER_RUN_SHA256 = "23bb69922f1ca0f1d9b889848fa2ac221b8131c023173158e5a2f3c31ff3be50";

const NODE_TEST_COMMAND = /^node --test(?: scripts\/tests\/[A-Za-z0-9_.-]+\.test\.mjs)+$/;
const DIRECT_CHECK_COMMANDS = Object.values(CHECK_COMMANDS).flat();

/** 검토된 pipeline의 변경 감지이며 보안 불변식·실행 성공·검토 승인의 증명이 아닙니다.
 * 별도 선행 run/uses가 npm 설정이나 GITHUB_ENV를 바꾸는 경로도 있어 필수 5 job과 scope의 전체 단계 형태를 고정합니다.
 * 정상적인 gate/순서/env/uses 변경도 먼저 실제 실행·실패 전파 회귀를 검토하고 workflow와 이 지문을 함께 갱신합니다.
 */
const REVIEWED_PIPELINE_DIGESTS = {
  "ci.yml:scope": "5631be5b87ad05d36adc00a72acf62af9423cbc5e3b5bf4b4b79c74240519d37",
  "ci.yml:ci": "8b83bc1da3bc6b368d0b02a4623e85381933e6b9c3c8486cce8e34e390aabaa2",
  "process-format.yml:pull-request":
    "ae70c42a9c814c1df9e9c238b87353f08b462cc50160cfa6b485820e83a263f1",
  "process-format.yml:contracts":
    "c02c5b2b2da9b9b9b5dee407bc154adfbdcb4c00f4fbc442342ad41955a9ff0c",
  "repository-security.yml:repository":
    "edcac22b2b55d615bed5b784ed51bfd5d079c07afebc966953750dbccfbf9e97",
  "repository-security.yml:browser":
    "baed69b6efce5a1146adba27a84cea126c7c8fc336113e253567c9475d5be168",
};
const REVIEWED_JOB_PERMISSIONS = {
  "process-format.yml:pull-request": { contents: "read", "pull-requests": "read" },
  "process-format.yml:contracts": { contents: "read" },
};

/** 검토한 직접 명령만 인정하며, npm config 같은 설정 변경이나 혼합 셸은 전체 블록을 인정하지 않습니다. */
function directCommands(step, key) {
  if (typeof step.run !== "string") return [];
  if (
    key === "repository-security.yml:repository" &&
    createHash("sha256").update(step.run.trim()).digest("hex") === SCANNER_RUN_SHA256
  ) {
    return ["npm run verify:repository-secrets"];
  }
  const lines = step.run
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  // 셸 연산자·치환·함수·따옴표 결합을 해석하지 않습니다. Node 배치 테스트만 파일 인수 집합을 허용합니다.
  return lines.every((line) => DIRECT_CHECK_COMMANDS.includes(line) || NODE_TEST_COMMAND.test(line))
    ? lines
    : [];
}

/** Node 배치 테스트는 실제 파일 인수만 허용하며 --test-name-pattern/--list 같은 축소 옵션을 거부합니다. */
function hasCommand(commands, required) {
  return commands.some((line) => {
    if (line === required) return true;
    if (!required.startsWith("node --test ") && !required.startsWith("scripts/tests/"))
      return false;
    if (!NODE_TEST_COMMAND.test(line)) return false;
    const requiredFiles = required.startsWith("node --test ")
      ? required.split(" ").slice(2)
      : [required];
    return requiredFiles.every((file) => line.split(" ").slice(2).includes(file));
  });
}

export function parseWorkflow(text) {
  const parsed = yaml.load(text, { schema: yaml.JSON_SCHEMA, json: false });
  if (!isObject(parsed) || !isObject(parsed.on) || !isObject(parsed.jobs)) {
    throw new Error("워크플로에 on/jobs mapping이 필요합니다.");
  }
  return parsed;
}

export function validateWorkflowCheckBoundaries(workflows) {
  const errors = [];
  const names = Object.keys(workflows).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_WORKFLOW_FILES)) {
    errors.push("워크플로 파일 목록이 승인된 기준과 다릅니다.");
  }
  const parsed = {};
  for (const [file, source] of Object.entries(workflows)) {
    try {
      parsed[file] = parseWorkflow(source);
    } catch {
      errors.push(file + ": YAML 파싱 또는 필수 구조가 잘못되었습니다.");
    }
  }

  for (const file of ["ci.yml", "process-format.yml", "repository-security.yml"]) {
    const work = parsed[file];
    if (!work) continue;
    // YAML의 환경 매핑은 실행 프로세스 환경과 구분해 구조 분해로 읽습니다.
    const { env: workflowEnvironment } = work;
    if (workflowEnvironment !== undefined || work.defaults !== undefined) {
      errors.push(
        file + ": required workflow environment/defaults must retain reviewed execution settings.",
      );
    }
    for (const event of ["pull_request", "push"]) {
      const trigger = work.on[event];
      if (
        !isObject(trigger) ||
        !Array.isArray(trigger.branches) ||
        trigger.branches.length !== 1 ||
        trigger.branches[0] !== "main" ||
        ["paths", "paths-ignore", "branches-ignore"].some((k) => k in trigger)
      ) {
        errors.push(file + ": " + event + " must run for every main change without path filters.");
      }
    }
    // 별도 types 선언이 없으면 GitHub 기본 opened/synchronize/reopened가 실행됩니다.
    // 명시된 이벤트 목록으로 default 이벤트를 축소하면 보안 필수 체크가 사라집니다.
    const eventTypes = work.on.pull_request?.types;
    const requiredEvents =
      file === "process-format.yml"
        ? [
            "opened",
            "edited",
            "reopened",
            "synchronize",
            "ready_for_review",
            "labeled",
            "unlabeled",
          ]
        : ["opened", "reopened", "synchronize"];
    if (
      (file === "process-format.yml" && !Array.isArray(eventTypes)) ||
      (eventTypes !== undefined &&
        (!Array.isArray(eventTypes) || requiredEvents.some((event) => !eventTypes.includes(event))))
    ) {
      errors.push(file + ": required PR activity types are missing.");
    }
    if (work.on.pull_request_target !== undefined) {
      errors.push(file + ": pull_request_target is not allowed.");
    }
    if (work.permissions?.contents !== "read") {
      errors.push(file + ": workflow requires read-only default content permission.");
    }
  }

  // scope는 필수 상태 이름이 아니지만 required Web CI의 실패 시 복귀 경계를 소유합니다.
  for (const expected of [
    ...REQUIRED_MAIN_STATUS_CHECKS,
    { file: "ci.yml", job: "scope", context: "변경 범위 판별" },
  ]) {
    if (!expected.file) continue;
    const work = parsed[expected.file];
    const key = expected.file + ":" + expected.job;
    const job = work?.jobs?.[expected.job];
    if (!isObject(job) || job.name !== expected.context || !Array.isArray(job.steps)) {
      errors.push(key + ": required job or name/steps missing.");
      continue;
    }
    // 단계 지문이 같아도 runner·컨테이너가 달라지면 명령 실행 경계가 바뀌므로 별도로 검사합니다.
    if (
      job["runs-on"] !== "ubuntu-latest" ||
      job.container !== undefined ||
      job.services !== undefined
    ) {
      errors.push(key + ": reviewed runner/container/services execution boundary changed.");
    }
    if (
      job.if !== JOB_IF[key] ||
      job.needs !== (key === "ci.yml:ci" ? "scope" : undefined) ||
      job.strategy !== undefined ||
      job["continue-on-error"] !== undefined ||
      job.uses !== undefined
    ) {
      errors.push(key + ": job if/needs/strategy/error policy could skip the required check.");
    }
    if (
      createHash("sha256").update(JSON.stringify(job.steps)).digest("hex") !==
      REVIEWED_PIPELINE_DIGESTS[key]
    ) {
      errors.push(
        key +
          ": REVIEWED_PIPELINE_DRIFT: reviewed step pipeline changed; execution review is required.",
      );
    }
    if (key === "ci.yml:scope") {
      const detectors = job.steps.filter((step) => step?.id === "detect");
      if (
        !sameEnvironment(job.outputs, { web: "${{ steps.detect.outputs.web }}" }) ||
        detectors.length !== 1 ||
        detectors[0].run !==
          'node scripts/detect-ci-scope.mjs "$GITHUB_EVENT_NAME" "$GITHUB_OUTPUT"'
      ) {
        errors.push(key + ": scope output must come from the reviewed fail-closed detector.");
      }
    }
    const expectedPermissions = REVIEWED_JOB_PERMISSIONS[key];
    if (
      expectedPermissions
        ? !sameEnvironment(job.permissions, expectedPermissions)
        : job.permissions !== undefined
    ) {
      errors.push(key + ": job permissions must retain the reviewed read-only mapping.");
    }
    const { env: jobEnvironment } = job;
    if (job.defaults !== undefined || !sameEnvironment(jobEnvironment, expectedEnvironment(key))) {
      errors.push(key + ": unreviewed job environment/defaults could disable execution.");
    }
    if (
      expected.job === "pull-request" &&
      job.concurrency?.group !== "process-format-pr-${{ github.event.pull_request.number }}"
    ) {
      errors.push(key + ": unexpected concurrency group.");
    }
    for (const step of job.steps) {
      if (!isObject(step) || step["continue-on-error"] !== undefined) {
        errors.push(key + ": invalid or fail-open step.");
        continue;
      }
      const { env: stepEnvironment } = step;
      if (
        step.shell !== undefined ||
        step["working-directory"] !== undefined ||
        !sameEnvironment(stepEnvironment, expectedEnvironment(key, step))
      ) {
        errors.push(key + ": unreviewed step execution environment/shell/directory.");
      }
      // if를 삭제하고 같은 이름의 echo만 남기는 경우도 거부합니다.
      const allowed =
        key === "process-format.yml:contracts" ? CONDITIONAL_STEPS[step.name] : undefined;
      if (allowed) {
        if (
          step.if !== allowed.condition ||
          step.run !== allowed.command ||
          !sameEnvironment(stepEnvironment, allowed.environment)
        ) {
          errors.push(
            key +
              ": required conditional step must retain exact command/condition/environment: " +
              step.name,
          );
        }
      } else if (step.if !== undefined) {
        errors.push(key + ": unauthorized conditional step: " + String(step.name ?? "unnamed"));
      }
      if (
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/checkout@") &&
        step.with?.["persist-credentials"] !== false
      ) {
        errors.push(key + ": checkout credentials must not persist.");
      }
    }
    // 조건부 필수 단계를 통째로 삭제하거나 중복 선언해도 검사에서 빠져나가면 안 됩니다.
    if (key === "process-format.yml:contracts") {
      for (const stepName of Object.keys(CONDITIONAL_STEPS)) {
        const occurrences = job.steps.filter((step) => step?.name === stepName).length;
        if (occurrences !== 1) {
          errors.push(key + ": required conditional step must appear exactly once: " + stepName);
        }
      }
    }
    const commands = job.steps
      .filter((step) => isObject(step) && step.if === undefined)
      .flatMap((step) => directCommands(step, key));
    for (const required of CHECK_COMMANDS[key] || []) {
      if (!hasCommand(commands, required)) {
        errors.push(key + ": required executable command missing: " + required);
      }
    }
    if (expected.job === "repository") {
      const checkout = job.steps.find(
        (s) => typeof s?.uses === "string" && s.uses.startsWith("actions/checkout@"),
      );
      if (checkout?.with?.["fetch-depth"] !== 0) {
        errors.push(key + ": full Git history checkout is required.");
      }
    }
  }

  for (const [file, work] of Object.entries(parsed)) {
    for (const [jobId, job] of Object.entries(work.jobs)) {
      const owner = REQUIRED_MAIN_STATUS_CHECKS.find(
        (check) => check.file === file && check.job === jobId,
      );
      if (owner) continue;
      const name = job?.name ?? jobId;
      const reviewedDynamic =
        (file === "mobile-eas-build.yml" &&
          jobId === "build" &&
          name === "${{ inputs.platform }} · ${{ inputs.profile }}") ||
        (file === "production-smoke.yml" &&
          jobId === "smoke" &&
          name ===
            "${{ inputs.fixture_alert && '알림 경로 합성 검증 (의도된 실패)' || 'Production 읽기 점검' }}");
      if (
        typeof name !== "string" ||
        (name.includes("${{") && !reviewedDynamic) ||
        REQUIRED_MAIN_STATUS_CHECKS.some((check) => check.context === name)
      ) {
        errors.push(file + ": unowned job name may duplicate a required check context: " + jobId);
      }
    }
  }

  for (const file of NON_REQUIRED_WORKFLOWS) {
    const work = parsed[file];
    if (!work) continue;
    if (file === "mobile-eas-build.yml") {
      const inputs = work.on.workflow_dispatch?.inputs;
      if (
        Object.keys(work.on).length !== 1 ||
        !isObject(inputs) ||
        JSON.stringify(inputs.platform?.options) !== JSON.stringify(["android", "ios"]) ||
        JSON.stringify(inputs.profile?.options) !== JSON.stringify(["preview", "production"]) ||
        work.jobs?.build?.if !== "github.ref == 'refs/heads/main'"
      ) {
        errors.push(file + ": EAS must retain reviewed manual-only inputs and main guard.");
      }
      continue;
    }
    if (file === "release-please.yml" && work.on.pull_request !== undefined) {
      errors.push(file + ": release automation must not run from a PR.");
    }
    if (
      file !== "release-please.yml" &&
      (!isObject(work.on.pull_request) || !Array.isArray(work.on.pull_request.paths))
    ) {
      errors.push(file + ": conditional PR workflow must retain a paths filter.");
    }
    if (
      file === "production-smoke.yml" &&
      work.jobs?.smoke?.if !== "github.event_name != 'pull_request'"
    ) {
      errors.push(file + ": production smoke must never run on PR code.");
    }
  }
  return errors;
}

// 오직 관리자 제공 스냅샷을 대조합니다. 실제 보호 설정을 읽었다고 주장하지 않습니다.
export function validateBranchProtection(protection) {
  const errors = [];
  const missingChecks = [];
  const unexpectedChecks = [];
  const policy = protection?.required_status_checks;
  if (!isObject(policy) || policy.strict !== true || !Array.isArray(policy.checks)) {
    errors.push("main 필수 체크 목록 및 strict=true 설정을 확인할 수 없습니다.");
  } else {
    const checks = policy.checks;
    for (const expected of REQUIRED_MAIN_STATUS_CHECKS) {
      if (!checks.some((c) => c?.context === expected.context && c?.app_id === expected.appId)) {
        missingChecks.push({ context: expected.context, appId: expected.appId });
        errors.push("필수 체크 누락 또는 App ID 불일치: " + expected.context);
      }
    }
    for (const actual of checks) {
      if (
        !REQUIRED_MAIN_STATUS_CHECKS.some(
          (x) => x.context === actual?.context && x.appId === actual?.app_id,
        )
      ) {
        unexpectedChecks.push({ context: actual?.context, appId: actual?.app_id });
        errors.push("승인되지 않은 필수 체크 등록: " + String(actual?.context));
      }
    }
  }
  if (protection?.enforce_admins?.enabled !== true) errors.push("관리자 보호 강제가 필요합니다.");
  if (protection?.allow_force_pushes?.enabled !== false)
    errors.push("강제 push 허용은 금지됩니다.");
  if (protection?.allow_deletions?.enabled !== false) errors.push("main 삭제 허용은 금지됩니다.");
  return { ok: errors.length === 0, errors, missingChecks, unexpectedChecks };
}
