/** #408: 실행 가능한 PR 검사 이름·트리거와 보안 게이트의 최소 구조를 검사합니다.
 * 실제 main 보호 설정과 Vercel Git 연동은 이 파일로 변경되지 않습니다.
 * YAML 문법은 기존 의존성 js-yaml JSON_SCHEMA를 사용하며 자체 파서를 만들지 않습니다.
 */
import yaml from "js-yaml";

export const GITHUB_ACTIONS_APP_ID = 15368;
export const VERCEL_APP_ID = 8329;

// 2026-11-03에 제안된 목표 설정입니다. 실제 GitHub 관리 화면의 현재 값이 아닙니다.
export const REQUIRED_MAIN_STATUS_CHECKS = Object.freeze([
  { context: "Lint · Typecheck · Test · Build", appId: GITHUB_ACTIONS_APP_ID, file: "ci.yml", job: "ci" },
  { context: "PR 형식", appId: GITHUB_ACTIONS_APP_ID, file: "process-format.yml", job: "pull-request" },
  { context: "형식·릴리스 계약 테스트", appId: GITHUB_ACTIONS_APP_ID, file: "process-format.yml", job: "contracts" },
  { context: "추적 소스 · 도달 가능한 이력 · dependency 검토", appId: GITHUB_ACTIONS_APP_ID, file: "repository-security.yml", job: "repository" },
  { context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK", appId: GITHUB_ACTIONS_APP_ID, file: "repository-security.yml", job: "browser" },
  { context: "Vercel", appId: VERCEL_APP_ID, file: null, job: null },
]);

export const NON_REQUIRED_WORKFLOWS = Object.freeze([
  "authentication-measurement.yml",
  "expanded-e2e.yml",
  "mobile-server-e2e.yml",
  "mobile.yml",
  "production-smoke.yml",
  "release-please.yml",
]);
export const EXPECTED_WORKFLOW_FILES = Object.freeze([
  "ci.yml",
  "process-format.yml",
  "repository-security.yml",
  ...NON_REQUIRED_WORKFLOWS,
].sort());

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const CHECK_COMMANDS = {
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
  "process-format.yml:pull-request": "github.event_name == 'pull_request'",
  "process-format.yml:contracts": "github.event_name != 'issues'",
};
const CONDITIONAL_STEPS = {
  "OpenAPI 기존 계약 추가 전용 검사": {
    command: "node scripts/check-openapi-compat.mjs --base-sha",
    condition: "github.event_name == 'push' || github.event_name == 'pull_request'",
  },
  "OpenAPI 현재 문서·Route 검사": {
    command: "node scripts/check-openapi-compat.mjs --self",
    condition: "github.event_name == 'workflow_dispatch'",
  },
  "새 커밋 메시지 검사": {
    commands: ["node scripts/check-commit-messages.mjs --history", 'node scripts/check-commit-messages.mjs "$HISTORY_MODE" "$BASE_SHA" "$HEAD_SHA"'],
    condition: "github.event_name == 'push' || github.event_name == 'pull_request'",
  },
};

// 단계 이름, 주석, 여러 줄 문자열의 인용문이 아니라 실제 실행 줄에 있는지를 확인합니다.
function activeLines(steps) {
  return steps.flatMap((step) => typeof step.run === "string" && step.if === undefined
    ? step.run.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
    : []);
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
    for (const event of ["pull_request", "push"]) {
      const trigger = work.on[event];
      if (!isObject(trigger) || !Array.isArray(trigger.branches) ||
          trigger.branches.length !== 1 || trigger.branches[0] !== "main" ||
          ["paths", "paths-ignore", "branches-ignore"].some((k) => k in trigger)) {
        errors.push(file + ": " + event + " must run for every main change without path filters.");
      }
    }
    // 별도 types 선언이 없으면 GitHub 기본 opened/synchronize/reopened가 실행됩니다.
    // 명시된 이벤트 목록으로 default 이벤트를 축소하면 보안 필수 체크가 사라집니다.
    const eventTypes = work.on.pull_request?.types;
    const requiredEvents = file === "process-format.yml"
      ? ["opened", "edited", "reopened", "synchronize", "ready_for_review", "labeled", "unlabeled"]
      : ["opened", "reopened", "synchronize"];
    if ((file === "process-format.yml" && !Array.isArray(eventTypes)) ||
        (eventTypes !== undefined && (!Array.isArray(eventTypes) ||
          requiredEvents.some((event) => !eventTypes.includes(event))))) {
      errors.push(file + ": required PR activity types are missing.");
    }
    if (work.on.pull_request_target !== undefined) {
      errors.push(file + ": pull_request_target is not allowed.");
    }
    if (work.permissions?.contents !== "read") {
      errors.push(file + ": workflow requires read-only default content permission.");
    }
  }

  for (const expected of REQUIRED_MAIN_STATUS_CHECKS) {
    if (!expected.file) continue;
    const work = parsed[expected.file];
    const key = expected.file + ":" + expected.job;
    const job = work?.jobs?.[expected.job];
    if (!isObject(job) || job.name !== expected.context || !Array.isArray(job.steps)) {
      errors.push(key + ": required job or name/steps missing.");
      continue;
    }
    if (job.if !== JOB_IF[key] || job.needs !== undefined || job.strategy !== undefined ||
        job["continue-on-error"] !== undefined || job.uses !== undefined) {
      errors.push(key + ": job if/needs/strategy/error policy could skip the required check.");
    }
    if (expected.job === "pull-request" && job.concurrency?.group !==
        "process-format-pr-${{ github.event.pull_request.number }}") {
      errors.push(key + ": unexpected concurrency group.");
    }
    for (const step of job.steps) {
      if (!isObject(step) || step["continue-on-error"] !== undefined) {
        errors.push(key + ": invalid or fail-open step.");
        continue;
      }
      if (step.if !== undefined) {
        const run = typeof step.run === "string" ? step.run.replace(/\s+/g, " ").trim() : "";
        const allowed = CONDITIONAL_STEPS[step.name];
        const acceptedCommands = allowed?.commands ?? (allowed ? [allowed.command] : []);
        const commandMatched = acceptedCommands.some((command) => run.includes(command));
        // 새 env 기반 커밋 검사는 PR 범위를 계산하는 --pr-history 계약도 유지해야 합니다.
        // YAML의 step 수준 설정 객체이며 프로세스 환경변수를 읽지 않습니다.
        const stepEnvironment = Object.entries(step).find(([key]) => key === "env")?.[1];
        const validHistoryEnv = !run.includes("$HISTORY_MODE") ||
          (String(stepEnvironment?.HISTORY_MODE).includes("--pr-history") &&
           String(stepEnvironment?.HISTORY_MODE).includes("--history") &&
           typeof stepEnvironment?.BASE_SHA === "string" &&
           typeof stepEnvironment?.HEAD_SHA === "string");
        if (key !== "process-format.yml:contracts" ||
            !allowed || step.if !== allowed.condition || !commandMatched || !validHistoryEnv) {
          errors.push(key + ": unauthorized conditional step or executable command: " + String(step.name ?? "unnamed"));
        }
      }
      if (typeof step.uses === "string" && step.uses.startsWith("actions/checkout@") &&
          step.with?.["persist-credentials"] !== false) {
        errors.push(key + ": checkout credentials must not persist.");
      }
    }
    const commands = activeLines(job.steps);
    for (const required of CHECK_COMMANDS[key] || []) {
      const found = required === "npm run test:e2e -- tests/e2e/ci-smoke.spec.ts"
        ? commands.some((line) => line === required)
        : required.startsWith("scripts/tests/")
          ? commands.some((line) => line.startsWith("node --test ") && (" " + line + " ").includes(" " + required + " "))
          : commands.some((line) => line.startsWith(required));
      if (!found) {
        errors.push(key + ": required executable command missing: " + required);
      }
    }
    if (expected.job === "repository") {
      const checkout = job.steps.find((s) => typeof s?.uses === "string" &&
        s.uses.startsWith("actions/checkout@"));
      if (checkout?.with?.["fetch-depth"] !== 0) {
        errors.push(key + ": full Git history checkout is required.");
      }
    }
  }

  for (const file of NON_REQUIRED_WORKFLOWS) {
    const work = parsed[file];
    if (!work) continue;
    if (file === "release-please.yml" && work.on.pull_request !== undefined) {
      errors.push(file + ": release automation must not run from a PR.");
    }
    if (file !== "release-please.yml" &&
        (!isObject(work.on.pull_request) || !Array.isArray(work.on.pull_request.paths))) {
      errors.push(file + ": conditional PR workflow must retain a paths filter.");
    }
    if (file === "production-smoke.yml" && work.jobs?.smoke?.if !==
        "github.event_name != 'pull_request'") {
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
      if (!REQUIRED_MAIN_STATUS_CHECKS.some((x) =>
          x.context === actual?.context && x.appId === actual?.app_id)) {
        unexpectedChecks.push({ context: actual?.context, appId: actual?.app_id });
        errors.push("승인되지 않은 필수 체크 등록: " + String(actual?.context));
      }
    }
  }
  if (protection?.enforce_admins?.enabled !== true) errors.push("관리자 보호 강제가 필요합니다.");
  if (protection?.allow_force_pushes?.enabled !== false) errors.push("강제 push 허용은 금지됩니다.");
  if (protection?.allow_deletions?.enabled !== false) errors.push("main 삭제 허용은 금지됩니다.");
  return { ok: errors.length === 0, errors, missingChecks, unexpectedChecks };
}
