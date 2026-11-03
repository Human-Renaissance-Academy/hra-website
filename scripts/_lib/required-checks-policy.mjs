/**
 * 역할: PR 필수 보안·품질 체크와 정기·운영 관측 워크플로의 경계를 검증하는 순수 정책 모듈
 * 사용 위치:
 *   - scripts/check-required-checks-config.mjs (CI 및 로컬 CLI 검증)
 *   - scripts/tests/required-checks-policy.test.mjs (단위·변이 회귀 테스트)
 *   - scripts/tests/repository-security-workflow.test.mjs (js-yaml 교차 검증)
 * 주요 기능:
 *   - main 병합 보호에 요구되는 정확한 check context 이름과 GitHub App ID 정본 정의
 *   - 외부 npm 패키지 없이 .github/workflows/*.yml의 트리거·skip·이름 충돌·오류 무시 우회 차단
 *   - 읽기 전용 GitHub branch protection 응답 JSON과 정본 설정의 정합성 대조
 */

/** GitHub Actions 기본 통합 앱 ID (GitHub 공식 고정값) */
export const GITHUB_ACTIONS_APP_ID = 15368;

/** Vercel GitHub 통합 앱 ID */
export const VERCEL_APP_ID = 8329;

/**
 * main 브랜치 병합 전에 반드시 성공해야 하는 필수 상태 검사 정본 목록.
 * - workflow가 null인 항목은 외부 GitHub App(Vercel)이 보고하는 상태 검사다.
 * - allowedJobIf가 null이면 job 수준 if 조건을 일절 허용하지 않는다(skipped 통과 우회 방지).
 */
export const REQUIRED_MAIN_STATUS_CHECKS = Object.freeze([
  Object.freeze({
    context: "Lint · Typecheck · Test · Build",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "ci.yml",
    jobId: "ci",
    allowedJobIf: null,
  }),
  Object.freeze({
    context: "PR 형식",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "process-format.yml",
    jobId: "pull-request",
    allowedJobIf: "github.event_name == 'pull_request'",
  }),
  Object.freeze({
    context: "형식·릴리스 계약 테스트",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "process-format.yml",
    jobId: "contracts",
    allowedJobIf: "github.event_name != 'issues'",
  }),
  Object.freeze({
    context: "추적 소스 · 도달 가능한 이력 · dependency 검토",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "repository-security.yml",
    jobId: "repository",
    allowedJobIf: null,
  }),
  Object.freeze({
    context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "repository-security.yml",
    jobId: "browser",
    allowedJobIf: null,
  }),
  Object.freeze({
    context: "Vercel",
    appId: VERCEL_APP_ID,
    workflow: null,
    jobId: null,
    allowedJobIf: null,
  }),
]);

/**
 * 전체 PR 필수 체크에 넣지 않고 별도 조건·정기·운영 관측으로 유지하는 워크플로 경계 정본.
 * - paths 필터가 있는 워크플로를 main 필수 체크로 등록하면 해당 경로를 건드리지 않은 PR이 무기한 대기한다.
 * - 운영 사이트를 호출하는 워크플로를 PR 필수 체크로 등록하면 운영 장애·변경이 PR 병합과 결합된다.
 */
export const NON_REQUIRED_WORKFLOWS = Object.freeze({
  "authentication-measurement.yml": Object.freeze({
    classification: "conditional-pr",
    requiresPullRequestPathsFilter: true,
    forbidsPullRequestTrigger: false,
  }),
  "expanded-e2e.yml": Object.freeze({
    classification: "scheduled-observation",
    requiresPullRequestPathsFilter: true,
    forbidsPullRequestTrigger: false,
  }),
  "production-smoke.yml": Object.freeze({
    classification: "operational-observation",
    requiresPullRequestPathsFilter: true,
    forbidsPullRequestTrigger: false,
  }),
  "release-please.yml": Object.freeze({
    classification: "post-merge-release",
    requiresPullRequestPathsFilter: false,
    forbidsPullRequestTrigger: true,
  }),
});

/** 필수 GitHub Actions 체크를 소유하는 워크플로 파일 집합 */
export const REQUIRED_WORKFLOW_FILES = Object.freeze(
  [...new Set(REQUIRED_MAIN_STATUS_CHECKS.map((item) => item.workflow).filter(Boolean))].sort(),
);

/** 저장소에 허용된 전체 워크플로 파일 집합 */
export const EXPECTED_WORKFLOW_FILES = Object.freeze(
  [...REQUIRED_WORKFLOW_FILES, ...Object.keys(NON_REQUIRED_WORKFLOWS)].sort(),
);

/** 양끝 따옴표가 감싸진 단일 스칼라 값을 정규화한다. */
function unquoteScalar(raw) {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  // 따옴표 밖의 인라인 주석 제거
  return trimmed.replace(/\s+#.*$/, "").trim();
}

/** 인라인 배열(`[a, b]`) 또는 하위 `- item` 목록에서 문자열 배열을 추출한다. */
function parseYamlStringList(inlineValue, childLines, itemIndent) {
  const inline = inlineValue.replace(/\s+#.*$/, "").trim();
  if (inline.startsWith("[") && inline.endsWith("]")) {
    const inner = inline.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => unquoteScalar(part));
  }
  if (inline.length > 0) {
    return [unquoteScalar(inline)];
  }
  const items = [];
  const prefix = `${" ".repeat(itemIndent)}- `;
  for (const line of childLines) {
    if (line.startsWith(prefix)) {
      items.push(unquoteScalar(line.slice(prefix.length)));
    }
  }
  return items;
}

/** 지정 들여쓰기 깊이의 하위 블록 줄만 슬라이스한다. */
function collectIndentedBlock(lines, startIndex, minIndent) {
  const collected = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      collected.push(line);
      continue;
    }
    const indent = line.match(/^ */)[0].length;
    if (indent < minIndent) break;
    collected.push(line);
  }
  return collected;
}

/**
 * 단일 GitHub Actions YAML 텍스트에서 트리거·동시성·작업·단계 요약 구조를 추출한다.
 * 탭 들여쓰기나 YAML anchor/alias(`&`, `*`, `<<:`)가 있으면 파서 우회를 막기 위해 오류로 기록한다.
 */
export function parseWorkflowSummary(filename, rawText) {
  const parseErrors = [];
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return {
      filename,
      parseErrors: [`${filename}: 비어 있거나 문자열이 아닌 워크플로 파일입니다.`],
      triggers: {},
      concurrency: null,
      jobs: {},
    };
  }

  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (line.includes("\t")) {
      parseErrors.push(`${filename}:${idx + 1}: 탭 들여쓰기는 허용하지 않습니다.`);
    }
    // 키 선언 줄에서 YAML anchor/merge 키 사용 차단 (정적 검사 우회 방지)
    if (/^\s*<<\s*:/.test(line) || /^\s*[A-Za-z0-9_-]+\s*:\s*[&*][A-Za-z0-9_-]+/.test(line)) {
      parseErrors.push(`${filename}:${idx + 1}: YAML anchor/alias/merge 문법은 허용하지 않습니다.`);
    }
  }

  // 1단계: 최상위(들여쓰기 0) 블록 분리
  const topBlocks = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;
    const [, key, rest] = match;
    if (topBlocks.has(key)) {
      parseErrors.push(`${filename}:${i + 1}: 중복된 최상위 키 '${key}'가 있습니다.`);
    }
    const blockLines = collectIndentedBlock(lines, i + 1, 2);
    topBlocks.set(key, { inline: rest.trim(), lines: blockLines });
  }

  // 2단계: on 트리거 블록 분석
  const triggers = {};
  const onBlock = topBlocks.get("on");
  if (!onBlock) {
    parseErrors.push(`${filename}: 최상위 'on:' 트리거 블록이 없습니다.`);
  } else if (onBlock.inline.length > 0) {
    // 인라인 `on: push` 또는 `on: [push, pull_request]` 형태도 방어적으로 파싱
    for (const ev of parseYamlStringList(onBlock.inline, [], 2)) {
      triggers[ev] = { branches: null, branchesIgnore: false, paths: false, pathsIgnore: false, types: null };
    }
  } else {
    for (let i = 0; i < onBlock.lines.length; i += 1) {
      const line = onBlock.lines[i];
      const evMatch = line.match(/^  ([A-Za-z0-9_-]+):(.*)$/);
      if (!evMatch) continue;
      const [, eventName, rest] = evMatch;
      if (Object.hasOwn(triggers, eventName)) {
        parseErrors.push(`${filename}: 중복된 트리거 '${eventName}'가 있습니다.`);
      }
      const evLines = collectIndentedBlock(onBlock.lines, i + 1, 4);
      const eventInfo = {
        inline: rest.trim(),
        branches: null,
        branchesIgnore: false,
        paths: false,
        pathsIgnore: false,
        types: null,
      };
      for (let j = 0; j < evLines.length; j += 1) {
        const subMatch = evLines[j].match(/^    ([A-Za-z0-9_-]+):(.*)$/);
        if (!subMatch) continue;
        const [, subKey, subRest] = subMatch;
        const subChildren = collectIndentedBlock(evLines, j + 1, 6);
        if (subKey === "branches") {
          eventInfo.branches = parseYamlStringList(subRest, subChildren, 6);
        } else if (subKey === "branches-ignore") {
          eventInfo.branchesIgnore = true;
        } else if (subKey === "paths") {
          eventInfo.paths = true;
        } else if (subKey === "paths-ignore") {
          eventInfo.pathsIgnore = true;
        } else if (subKey === "types") {
          eventInfo.types = parseYamlStringList(subRest, subChildren, 6);
        }
      }
      triggers[eventName] = eventInfo;
    }
  }

  // 3단계: 최상위 concurrency 블록 분석
  let concurrency = null;
  const concurrencyBlock = topBlocks.get("concurrency");
  if (concurrencyBlock) {
    concurrency = { group: null, cancelInProgress: null };
    for (const line of concurrencyBlock.lines) {
      const cMatch = line.match(/^  ([A-Za-z0-9_-]+):(.*)$/);
      if (!cMatch) continue;
      const [, cKey, cRest] = cMatch;
      if (cKey === "group") concurrency.group = unquoteScalar(cRest);
      if (cKey === "cancel-in-progress") concurrency.cancelInProgress = unquoteScalar(cRest);
    }
  }

  // 4단계: jobs 블록 분석 (job 이름·조건·matrix·재사용 호출·continue-on-error·단계)
  const jobs = {};
  const jobsBlock = topBlocks.get("jobs");
  if (!jobsBlock) {
    parseErrors.push(`${filename}: 최상위 'jobs:' 블록이 없습니다.`);
  } else {
    for (let i = 0; i < jobsBlock.lines.length; i += 1) {
      const line = jobsBlock.lines[i];
      const jobMatch = line.match(/^  ([A-Za-z0-9_-]+):(.*)$/);
      if (!jobMatch) continue;
      const [, jobId] = jobMatch;
      if (Object.hasOwn(jobs, jobId)) {
        parseErrors.push(`${filename}: 중복된 job ID '${jobId}'가 있습니다.`);
      }
      const jobLines = collectIndentedBlock(jobsBlock.lines, i + 1, 4);
      const jobInfo = {
        jobId,
        name: null,
        ifCondition: null,
        hasStrategy: false,
        hasReusableUses: false,
        hasContinueOnError: false,
        steps: [],
      };
      for (let j = 0; j < jobLines.length; j += 1) {
        const propMatch = jobLines[j].match(/^    ([A-Za-z0-9_-]+):(.*)$/);
        if (!propMatch) continue;
        const [, propKey, propRest] = propMatch;
        if (propKey === "name") {
          jobInfo.name = unquoteScalar(propRest);
        } else if (propKey === "if") {
          jobInfo.ifCondition = unquoteScalar(propRest);
        } else if (propKey === "strategy") {
          jobInfo.hasStrategy = true;
        } else if (propKey === "uses") {
          jobInfo.hasReusableUses = true;
        } else if (propKey === "continue-on-error") {
          jobInfo.hasContinueOnError = true;
        } else if (propKey === "steps") {
          const stepLines = collectIndentedBlock(jobLines, j + 1, 6);
          let currentStep = null;
          for (const sLine of stepLines) {
            const trimmed = sLine.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            if (/^ {6}-\s/.test(sLine)) {
              if (currentStep) jobInfo.steps.push(currentStep);
              currentStep = { name: null, ifCondition: null, hasContinueOnError: false, rawLines: [sLine] };
              const inlineProp = sLine.slice(8).match(/^([A-Za-z0-9_-]+):(.*)$/);
              if (inlineProp) {
                const [, sKey, sVal] = inlineProp;
                if (sKey === "name") currentStep.name = unquoteScalar(sVal);
                if (sKey === "if") currentStep.ifCondition = unquoteScalar(sVal);
                if (sKey === "continue-on-error") currentStep.hasContinueOnError = true;
              }
            } else if (currentStep) {
              currentStep.rawLines.push(sLine);
              const subStepProp = sLine.match(/^ {8}([A-Za-z0-9_-]+):(.*)$/);
              if (subStepProp) {
                const [, sKey, sVal] = subStepProp;
                if (sKey === "name") currentStep.name = unquoteScalar(sVal);
                if (sKey === "if") currentStep.ifCondition = unquoteScalar(sVal);
                if (sKey === "continue-on-error") currentStep.hasContinueOnError = true;
              }
            }
          }
          if (currentStep) jobInfo.steps.push(currentStep);
        }
      }
      jobs[jobId] = jobInfo;
    }
  }

  return { filename, parseErrors, triggers, concurrency, jobs };
}

/**
 * 저장소의 전체 `.github/workflows/*.yml` 맵(`{ [filename]: rawYaml }`)이
 * PR 필수 보안·품질 체크 경계와 정기·운영 관측 분리 원칙을 만족하는지 검증한다.
 */
export function validateWorkflowCheckBoundaries(workflowsByFilename) {
  const errors = [];
  if (!workflowsByFilename || typeof workflowsByFilename !== "object") {
    return ["워크플로 입력 맵이 올바르지 않습니다."];
  }

  const actualFiles = Object.keys(workflowsByFilename).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_WORKFLOW_FILES)) {
    errors.push(
      `워크플로 파일 목록이 정책 정본과 다릅니다: 실제=[${actualFiles.join(", ")}], 기대=[${EXPECTED_WORKFLOW_FILES.join(", ")}]`,
    );
  }

  const parsedByFile = new Map();
  for (const [filename, rawText] of Object.entries(workflowsByFilename)) {
    const parsed = parseWorkflowSummary(filename, rawText);
    parsedByFile.set(filename, parsed);
    errors.push(...parsed.parseErrors);
    if (Object.hasOwn(parsed.triggers, "pull_request_target")) {
      errors.push(`${filename}: 보안 경계상 'pull_request_target' 트리거는 금지됩니다.`);
    }
  }

  // 1. 필수 체크를 소유하는 워크플로의 pull_request 트리거 무결성 검사 (무기한 대기 방지)
  for (const workflowFile of REQUIRED_WORKFLOW_FILES) {
    const parsed = parsedByFile.get(workflowFile);
    if (!parsed) continue;
    const prTrigger = parsed.triggers.pull_request;
    if (!prTrigger) {
      errors.push(`${workflowFile}: 필수 PR 체크 워크플로에 'pull_request' 트리거가 없습니다.`);
      continue;
    }
    if (prTrigger.inline) {
      errors.push(`${workflowFile}: 'pull_request' 트리거는 main 브랜치를 명시하는 블록이어야 합니다.`);
    }
    if (Array.isArray(prTrigger.branches) && !prTrigger.branches.includes("main")) {
      errors.push(`${workflowFile}: 'pull_request.branches'에 'main'이 포함되어야 합니다.`);
    }
    if (prTrigger.branchesIgnore) {
      errors.push(`${workflowFile}: 'pull_request.branches-ignore'는 필수 체크 누락(무기한 대기)을 유발하므로 금지됩니다.`);
    }
    if (prTrigger.paths || prTrigger.pathsIgnore) {
      errors.push(`${workflowFile}: 'pull_request.paths' 또는 'paths-ignore'는 필수 체크 미생성(무기한 대기)을 유발하므로 금지됩니다.`);
    }
    if (Array.isArray(prTrigger.types)) {
      for (const requiredType of ["opened", "synchronize", "reopened"]) {
        if (!prTrigger.types.includes(requiredType)) {
          errors.push(`${workflowFile}: 'pull_request.types'에 '${requiredType}'가 누락되어 필수 체크가 갱신되지 않을 수 있습니다.`);
        }
      }
    }
  }

  // 2. 보안 워크플로의 예약 관측 공존 조건과 동시성 취소 금지 검사
  const securityWorkflow = parsedByFile.get("repository-security.yml");
  if (securityWorkflow) {
    for (const requiredTrigger of ["pull_request", "push", "schedule", "workflow_dispatch"]) {
      if (!Object.hasOwn(securityWorkflow.triggers, requiredTrigger)) {
        errors.push(`repository-security.yml: '${requiredTrigger}' 트리거가 유지되어야 합니다.`);
      }
    }
    if (securityWorkflow.concurrency?.cancelInProgress !== "false") {
      errors.push("repository-security.yml: 보안 검사가 취소 상태로 남지 않도록 'cancel-in-progress: false'를 유지해야 합니다.");
    }
  }

  // 3. 각 필수 GitHub Actions 체크의 정확한 이름·if 조건·matrix/오류무시 우회 차단 검사
  const requiredActionsChecks = REQUIRED_MAIN_STATUS_CHECKS.filter(
    (item) => item.appId === GITHUB_ACTIONS_APP_ID,
  );
  const requiredContexts = new Set(REQUIRED_MAIN_STATUS_CHECKS.map((item) => item.context));

  for (const check of requiredActionsChecks) {
    const parsed = parsedByFile.get(check.workflow);
    if (!parsed) {
      errors.push(`필수 체크 '${check.context}'의 소유 워크플로 '${check.workflow}'가 없습니다.`);
      continue;
    }
    const job = parsed.jobs[check.jobId];
    if (!job) {
      errors.push(`${check.workflow}: 필수 체크 '${check.context}'에 대응하는 job '${check.jobId}'가 없습니다.`);
      continue;
    }
    if (job.name !== check.context) {
      errors.push(
        `${check.workflow} (${check.jobId}): job 이름이 필수 체크 정본과 다릅니다. 실제=${JSON.stringify(job.name)}, 기대=${JSON.stringify(check.context)}`,
      );
    }
    if (typeof job.name === "string" && job.name.includes("${{")) {
      errors.push(`${check.workflow} (${check.jobId}): 필수 체크 이름에는 동적 표현식(\${{ }})을 사용할 수 없습니다.`);
    }
    if (job.hasStrategy) {
      errors.push(`${check.workflow} (${check.jobId}): 'strategy'(matrix)는 체크 이름에 접미사를 붙여 브랜치 보호 매칭을 깨뜨리므로 금지됩니다.`);
    }
    if (job.hasReusableUses) {
      errors.push(`${check.workflow} (${check.jobId}): 재사용 워크플로 호출('uses')은 체크 이름 접두사를 바꾸므로 금지됩니다.`);
    }
    if (job.ifCondition !== check.allowedJobIf) {
      errors.push(
        `${check.workflow} (${check.jobId}): 허용되지 않은 job 'if' 조건입니다(GitHub는 skipped 체크를 통과로 간주해 보안 게이트가 우회됨). 실제=${JSON.stringify(job.ifCondition)}, 기대=${JSON.stringify(check.allowedJobIf)}`,
      );
    }
    if (job.hasContinueOnError || job.steps.some((step) => step.hasContinueOnError)) {
      errors.push(`${check.workflow} (${check.jobId}): 필수 체크의 실패를 숨기는 'continue-on-error'는 금지됩니다.`);
    }
  }

  // 4. 다른 워크플로/작업이 필수 체크 이름을 중복 선언해 결과를 오염시키지 않는지 전역 유일성 검사
  for (const [filename, parsed] of parsedByFile.entries()) {
    for (const [jobId, job] of Object.entries(parsed.jobs)) {
      const effectiveName = job.name ?? jobId;
      const owner = requiredActionsChecks.find(
        (item) => item.workflow === filename && item.jobId === jobId,
      );
      if (!owner) {
        if (requiredContexts.has(effectiveName)) {
          errors.push(
            `${filename} (${jobId}): 비필수 작업이 필수 체크 이름 '${effectiveName}'을 중복 사용해 상태 검사를 혼동시킵니다.`,
          );
        }
        for (const reqContext of requiredContexts) {
          if (effectiveName.includes("${{") && effectiveName.includes(reqContext)) {
            errors.push(
              `${filename} (${jobId}): 동적 작업 이름에 필수 체크 문자열 '${reqContext}'을 포함할 수 없습니다.`,
            );
          }
        }
      }
    }
  }

  // 5. 보안 게이트 핵심 실행 명령이 단계별 if 조건으로 건너뛰어지지 않는지 검증
  if (securityWorkflow) {
    const repoJob = securityWorkflow.jobs.repository;
    const browserJob = securityWorkflow.jobs.browser;
    for (const requiredCmd of [
      "npm run verify:public-sources",
      "npm run verify:repository-secrets",
      "npm run verify:dependencies",
      "node scripts/check-required-checks-config.mjs",
    ]) {
      const step = repoJob?.steps.find((s) => s.rawLines.join("\n").includes(requiredCmd));
      if (!step) {
        errors.push(`repository-security.yml (repository): 필수 검증 명령 '${requiredCmd}'가 누락되었습니다.`);
      } else if (step.ifCondition !== null) {
        errors.push(`repository-security.yml (repository): '${requiredCmd}' 단계에 조건부 skip('if')을 둘 수 없습니다.`);
      }
    }
    for (const requiredCmd of [
      "node --test scripts/tests/csp-browser.test.mjs",
      "npm run verify:csp",
    ]) {
      const step = browserJob?.steps.find((s) => s.rawLines.join("\n").includes(requiredCmd));
      if (!step) {
        errors.push(`repository-security.yml (browser): 필수 검증 명령 '${requiredCmd}'가 누락되었습니다.`);
      } else if (step.ifCondition !== null) {
        errors.push(`repository-security.yml (browser): '${requiredCmd}' 단계에 조건부 skip('if')을 둘 수 없습니다.`);
      }
    }
  }

  // 6. 형식·릴리스 계약 테스트에도 본 경계 검증 명령이 연결되어 있는지 확인
  const processFormatWorkflow = parsedByFile.get("process-format.yml");
  if (processFormatWorkflow) {
    const contractsJob = processFormatWorkflow.jobs.contracts;
    for (const requiredCmd of [
      "node --test scripts/tests/required-checks-policy.test.mjs",
      "node scripts/check-required-checks-config.mjs",
    ]) {
      const step = contractsJob?.steps.find((s) => s.rawLines.join("\n").includes(requiredCmd));
      if (!step) {
        errors.push(`process-format.yml (contracts): '${requiredCmd}' 실행 단계가 누락되었습니다.`);
      } else if (step.ifCondition !== null) {
        errors.push(`process-format.yml (contracts): '${requiredCmd}' 단계에 조건부 skip('if')을 둘 수 없습니다.`);
      }
    }
  }

  // 7. 정기·운영 관측 및 경로 조건부 워크플로의 분리 경계 검증
  for (const [workflowFile, rule] of Object.entries(NON_REQUIRED_WORKFLOWS)) {
    const parsed = parsedByFile.get(workflowFile);
    if (!parsed) continue;
    if (rule.forbidsPullRequestTrigger && Object.hasOwn(parsed.triggers, "pull_request")) {
      errors.push(`${workflowFile}: PR 트리거를 두지 않는 운영·릴리스 워크플로입니다.`);
    }
    if (rule.requiresPullRequestPathsFilter && !parsed.triggers.pull_request?.paths) {
      errors.push(`${workflowFile}: 조건부 워크플로의 'pull_request.paths' 필터가 사라졌습니다. 전체 PR 실행 여부는 별도로 검토해야 합니다.`);
    }
  }

  const productionSmoke = parsedByFile.get("production-smoke.yml");
  if (productionSmoke) {
    const smokeJob = productionSmoke.jobs.smoke;
    if (!smokeJob || smokeJob.ifCondition !== "github.event_name != 'pull_request'") {
      errors.push("production-smoke.yml (smoke): PR에서 실제 운영 사이트를 호출하지 않도록 \"if: github.event_name != 'pull_request'\"를 유지해야 합니다.");
    }
  }

  return errors;
}

/**
 * GitHub REST API(`GET /repos/{owner}/{repo}/branches/main/protection`) 응답 JSON이
 * 정본 필수 체크 목록 및 브랜치 보호 기준(strict, enforce_admins, force push/delete 차단)과 일치하는지 검증한다.
 */
export function validateBranchProtection(protection) {
  const errors = [];
  const missingChecks = [];
  const unexpectedChecks = [];

  if (!protection || typeof protection !== "object" || Array.isArray(protection)) {
    return {
      ok: false,
      missingChecks: [...REQUIRED_MAIN_STATUS_CHECKS.map(({ context, appId }) => ({ context, appId }))],
      unexpectedChecks: [],
      errors: ["브랜치 보호 설정 응답이 올바른 JSON 객체가 아닙니다."],
    };
  }

  const rsc = protection.required_status_checks;
  if (!rsc || typeof rsc !== "object") {
    errors.push("main 브랜치 보호에 'required_status_checks'가 활성화되어 있지 않습니다.");
  } else {
    if (rsc.strict !== true) {
      errors.push("main 브랜치 보호의 'required_status_checks.strict'(최신 main 반영 필수)는 true여야 합니다.");
    }
    const rawChecks = Array.isArray(rsc.checks) ? rsc.checks : [];
    const seenKeys = new Set();
    for (const item of rawChecks) {
      const context = item?.context;
      const appId = item?.app_id ?? null;
      const key = `${context}::${appId}`;
      if (seenKeys.has(key)) {
        errors.push(`main 브랜치 보호에 중복된 필수 체크 항목이 있습니다: ${context} (app_id=${String(appId)})`);
      }
      seenKeys.add(key);

      const expected = REQUIRED_MAIN_STATUS_CHECKS.find((req) => req.context === context);
      if (!expected) {
        unexpectedChecks.push({ context: String(context), appId });
        errors.push(
          `main 브랜치 보호에 정본 외 체크가 등록되어 있습니다(경로 조건부·운영 체크 등록 시 PR이 무기한 대기할 수 있음): '${String(context)}' (app_id=${String(appId)})`,
        );
      } else if (appId !== expected.appId) {
        unexpectedChecks.push({ context: String(context), appId });
        errors.push(
          `필수 체크 '${context}'의 app_id가 정본과 다릅니다(출처 미고정 시 다른 통합이 상태를 위조할 수 있음): 실제=${String(appId)}, 기대=${expected.appId}`,
        );
      }
    }

    for (const expected of REQUIRED_MAIN_STATUS_CHECKS) {
      const matched = rawChecks.some(
        (item) => item?.context === expected.context && item?.app_id === expected.appId,
      );
      if (!matched) {
        missingChecks.push({ context: expected.context, appId: expected.appId });
        errors.push(
          `main 브랜치 보호에 필수 체크가 누락되었습니다: '${expected.context}' (app_id=${expected.appId})`,
        );
      }
    }
  }

  if (protection.enforce_admins?.enabled !== true) {
    errors.push("관리자 실수 병합을 막기 위해 'enforce_admins.enabled'는 true여야 합니다.");
  }
  if (protection.allow_force_pushes?.enabled !== false) {
    errors.push("main 브랜치의 'allow_force_pushes.enabled'는 false여야 합니다.");
  }
  if (protection.allow_deletions?.enabled !== false) {
    errors.push("main 브랜치의 'allow_deletions.enabled'는 false여야 합니다.");
  }

  return {
    ok: errors.length === 0,
    missingChecks,
    unexpectedChecks,
    errors,
  };
}
