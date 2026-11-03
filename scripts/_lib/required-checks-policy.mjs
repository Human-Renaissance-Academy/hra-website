/**
 * 역할: PR 필수 보안·품질 체크와 정기·운영 관측 워크플로의 경계를 검증하는 순수 정책 모듈
 * 사용 위치:
 *   - scripts/check-required-checks-config.mjs (CI 및 로컬 CLI 검증)
 *   - scripts/tests/required-checks-policy.test.mjs (단위·변이 회귀 테스트)
 *   - scripts/tests/repository-security-workflow.test.mjs (js-yaml 교차 검증)
 * 주요 기능:
 *   - main 병합 보호에 요구되는 정확한 check context 이름과 GitHub App ID 정본 정의
 *   - 외부 npm 패키지 없이 .github/workflows/*.yml 전체의 트리거·skip·needs·이름 충돌·오류 무시·문법 변칙 우회 차단(fail-closed)
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
 * - allowedStepIfs에 없는 단계별 if 조건은 전면 차단한다.
 * - requiredRunSnippets는 주석을 제거한 실제 step.run 본문에서 무조건부(step.if === null)로 확인되어야 한다.
 */
export const REQUIRED_MAIN_STATUS_CHECKS = Object.freeze([
  Object.freeze({
    context: "Lint · Typecheck · Test · Build",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "ci.yml",
    jobId: "ci",
    allowedJobIf: null,
    allowedJobConcurrencyGroup: null,
    allowedStepIfs: Object.freeze([]),
    requiredRunSnippets: Object.freeze([
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
      "npm run verify:auth-proxy",
      "npm run test:academic-g1",
      "npm run test:e2e -- tests/e2e/ci-smoke.spec.ts",
    ]),
  }),
  Object.freeze({
    context: "PR 형식",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "process-format.yml",
    jobId: "pull-request",
    allowedJobIf: "github.event_name == 'pull_request'",
    allowedJobConcurrencyGroup: "process-format-pr-${{ github.event.pull_request.number }}",
    allowedStepIfs: Object.freeze([]),
    requiredRunSnippets: Object.freeze(["node scripts/check-process-format.mjs --event"]),
  }),
  Object.freeze({
    context: "형식·릴리스 계약 테스트",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "process-format.yml",
    jobId: "contracts",
    allowedJobIf: "github.event_name != 'issues'",
    allowedJobConcurrencyGroup: null,
    allowedStepIfs: Object.freeze([
      Object.freeze({
        ifCondition: "github.event_name == 'push' || github.event_name == 'pull_request'",
        runSnippet: 'node scripts/check-openapi-compat.mjs --base-sha "$BASE_SHA"',
      }),
      Object.freeze({
        ifCondition: "github.event_name == 'workflow_dispatch'",
        runSnippet: "node scripts/check-openapi-compat.mjs --self",
      }),
      Object.freeze({
        ifCondition: "github.event_name == 'push' || github.event_name == 'pull_request'",
        runSnippet: "node scripts/check-commit-messages.mjs --history",
      }),
    ]),
    requiredRunSnippets: Object.freeze([
      "node --test scripts/tests/release-policy.test.mjs",
      "node scripts/check-release-config.mjs",
      "node --test scripts/tests/required-checks-policy.test.mjs",
      "node scripts/check-required-checks-config.mjs",
      "node --test scripts/tests/commit-messages.test.mjs",
      "node --test scripts/tests/openapi-append-only.test.mjs scripts/tests/openapi-cli.test.mjs",
    ]),
  }),
  Object.freeze({
    context: "추적 소스 · 도달 가능한 이력 · dependency 검토",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "repository-security.yml",
    jobId: "repository",
    allowedJobIf: null,
    allowedJobConcurrencyGroup: null,
    allowedStepIfs: Object.freeze([]),
    requiredRunSnippets: Object.freeze([
      "scripts/tests/secret-scan.test.mjs",
      "scripts/tests/dependency-policy.test.mjs",
      "scripts/tests/repository-security-workflow.test.mjs",
      "scripts/tests/required-checks-policy.test.mjs",
      "node scripts/check-required-checks-config.mjs",
      "npm run verify:public-sources",
      "npm run verify:repository-secrets",
      "npm run verify:dependencies",
    ]),
  }),
  Object.freeze({
    context: "실제 production CSP · 에디터 · 인쇄 · Blob SDK",
    appId: GITHUB_ACTIONS_APP_ID,
    workflow: "repository-security.yml",
    jobId: "browser",
    allowedJobIf: null,
    allowedJobConcurrencyGroup: null,
    allowedStepIfs: Object.freeze([]),
    requiredRunSnippets: Object.freeze([
      "node --test scripts/tests/csp-browser.test.mjs",
      "npm run verify:csp",
    ]),
  }),
  Object.freeze({
    context: "Vercel",
    appId: VERCEL_APP_ID,
    workflow: null,
    jobId: null,
    allowedJobIf: null,
    allowedJobConcurrencyGroup: null,
    allowedStepIfs: Object.freeze([]),
    requiredRunSnippets: Object.freeze([]),
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

/** 허용된 최상위·작업·단계 키 목록 (알 수 없는 키나 따옴표 키는 fail-closed 차단) */
const ALLOWED_TOP_KEYS = new Set(["name", "run-name", "on", "permissions", "concurrency", "jobs"]);
const ALLOWED_PR_SUBKEYS = new Set(["branches", "branches-ignore", "paths", "paths-ignore", "types"]);
const ALLOWED_JOB_KEYS = new Set([
  "name",
  "if",
  "needs",
  "runs-on",
  "timeout-minutes",
  "permissions",
  "concurrency",
  "env",
  "strategy",
  "uses",
  "with",
  "secrets",
  "outputs",
  "services",
  "container",
  "defaults",
  "environment",
  "continue-on-error",
  "steps",
]);
const ALLOWED_STEP_KEYS = new Set([
  "name",
  "id",
  "if",
  "uses",
  "run",
  "with",
  "env",
  "shell",
  "working-directory",
  "timeout-minutes",
  "continue-on-error",
]);

/** 양끝 따옴표가 감싸진 단일 스칼라 값을 정규화한다. */
function unquoteScalar(raw) {
  const withoutComment = stripTrailingComment(raw).trim();
  if (
    withoutComment.length >= 2 &&
    withoutComment.startsWith('"') &&
    withoutComment.endsWith('"')
  ) {
    return withoutComment.slice(1, -1);
  }
  if (
    withoutComment.length >= 2 &&
    withoutComment.startsWith("'") &&
    withoutComment.endsWith("'")
  ) {
    return withoutComment.slice(1, -1).replace(/''/g, "'");
  }
  return withoutComment;
}

/** 따옴표 밖의 인라인 `#` 주석만 안전하게 제거한다. */
function stripTrailingComment(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && raw[i - 1] !== "\\") {
      inDouble = !inDouble;
    } else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

/** YAML 멀티라인 블록 지시자(`|`, `>`, `|-`, `>-` 등)인지 판별한다. */
function isBlockScalarHeader(value) {
  return /^[|>][+-]?\d*$/.test(stripTrailingComment(value).trim());
}

/** `${{ ... }}` 표현식을 제거한 구조 문자열에 flow 매핑(`{`, `}`)이 섞였는지 확인한다. */
function hasFlowBracesOutsideExpressions(raw) {
  const cleaned = stripTrailingComment(raw).replace(/\$\{\{[\s\S]*?\}\}/g, "");
  // 따옴표 안의 중괄호는 제외
  const unquoted = cleaned.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "");
  return /[{}]/.test(unquoted);
}

/**
 * 인라인 배열(`[a, b]`) 또는 정확한 들여쓰기의 `- item` 목록에서 문자열 배열을 추출한다.
 * 허용되지 않은 들여쓰기·빈 항목·비표준 줄이 섞이면 parseErrors에 기록해 우회를 막는다.
 */
function parseStrictStringList(filename, contextLabel, inlineValue, childLines, itemIndent, parseErrors) {
  const inline = stripTrailingComment(inlineValue).trim();
  if (inline.length > 0) {
    for (const child of childLines) {
      const trimmed = child.text.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        parseErrors.push(`${filename}:${child.lineNo}: '${contextLabel}' 인라인 값 아래에 하위 줄을 둘 수 없습니다.`);
      }
    }
    if (inline.startsWith("[") && inline.endsWith("]")) {
      const inner = inline.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((part) => unquoteScalar(part));
    }
    if (hasFlowBracesOutsideExpressions(inline) || isBlockScalarHeader(inline)) {
      parseErrors.push(`${filename}: '${contextLabel}'에 허용되지 않은 복합/멀티라인 스칼라가 있습니다.`);
      return [];
    }
    return [unquoteScalar(inline)];
  }

  const items = [];
  const itemRe = new RegExp(`^ {${itemIndent}}- (\\S.*)$`);
  for (const child of childLines) {
    const trimmed = child.text.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = child.text.match(itemRe);
    if (!match || hasFlowBracesOutsideExpressions(match[1])) {
      parseErrors.push(
        `${filename}:${child.lineNo}: '${contextLabel}' 목록 항목은 공백 ${itemIndent}칸과 '- 값' 형식이어야 합니다.`,
      );
      continue;
    }
    items.push(unquoteScalar(match[1]));
  }
  if (items.length === 0) {
    parseErrors.push(`${filename}: '${contextLabel}' 목록이 비어 있습니다.`);
  }
  return items;
}

/** 지정 최소 들여쓰기 이상의 연속 하위 블록(`{ lineNo, text }[]`)과 다음 인덱스를 반환한다. */
function sliceIndentedBlock(indexedLines, startIndex, minIndent) {
  const collected = [];
  let cursor = startIndex;
  while (cursor < indexedLines.length) {
    const entry = indexedLines[cursor];
    const trimmed = entry.text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      collected.push(entry);
      cursor += 1;
      continue;
    }
    const indent = entry.text.match(/^ */)[0].length;
    if (indent < minIndent) break;
    collected.push(entry);
    cursor += 1;
  }
  return { block: collected, nextIndex: cursor };
}

/** 멀티라인 `run:` 본문 줄에서 공통 들여쓰기를 제거해 단일 문자열로 결합한다. */
function extractBlockScalarText(blockEntries, minContentIndent) {
  const contentLines = [];
  let baseIndent = null;
  for (const entry of blockEntries) {
    if (entry.text.trim().length === 0) {
      contentLines.push("");
      continue;
    }
    const indent = entry.text.match(/^ */)[0].length;
    if (indent < minContentIndent) break;
    if (baseIndent === null || indent < baseIndent) baseIndent = indent;
    contentLines.push(entry.text);
  }
  if (baseIndent === null) return "";
  return contentLines.map((line) => (line ? line.slice(baseIndent) : "")).join("\n").trim();
}

/** `concurrency:` 하위 블록을 엄격히 파싱한다. */
function parseConcurrencyBlock(filename, inlineValue, blockEntries, keyIndent, parseErrors) {
  if (stripTrailingComment(inlineValue).trim().length > 0) {
    parseErrors.push(`${filename}: 'concurrency'에는 인라인 값을 사용할 수 없습니다.`);
  }
  const result = { group: null, cancelInProgress: null };
  const propRe = new RegExp(`^ {${keyIndent}}([A-Za-z0-9_-]+):(.*)$`);
  for (const entry of blockEntries) {
    const trimmed = entry.text.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = entry.text.match(propRe);
    if (!match) {
      parseErrors.push(`${filename}:${entry.lineNo}: 'concurrency' 블록에 비표준 들여쓰기 또는 따옴표 키가 있습니다.`);
      continue;
    }
    const [, cKey, cRest] = match;
    if (cKey !== "group" && cKey !== "cancel-in-progress") {
      parseErrors.push(`${filename}:${entry.lineNo}: 알 수 없는 concurrency 속성 '${cKey}'입니다.`);
      continue;
    }
    const val = unquoteScalar(cRest);
    if (!val || isBlockScalarHeader(cRest) || hasFlowBracesOutsideExpressions(cRest)) {
      parseErrors.push(`${filename}:${entry.lineNo}: 'concurrency.${cKey}'는 단일 스칼라 값이어야 합니다.`);
      continue;
    }
    if (cKey === "group") result.group = val;
    if (cKey === "cancel-in-progress") result.cancelInProgress = val;
  }
  return result;
}

/**
 * 단일 GitHub Actions YAML 텍스트에서 트리거·동시성·작업·단계 요약 구조를 fail-closed로 추출한다.
 * 따옴표 키, 비표준 들여쓰기, 탭, YAML anchor/alias/merge, flow 매핑 등 정적 분석 우회 문법은 모두 parseErrors로 차단한다.
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

  const indexedLines = rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((text, index) => ({ lineNo: index + 1, text }));

  for (const entry of indexedLines) {
    const trimmed = entry.text.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (entry.text.includes("\t")) {
      parseErrors.push(`${filename}:${entry.lineNo}: 탭 들여쓰기는 허용하지 않습니다.`);
    }
    // YAML anchor(&), alias(*), merge key(<<:) 전면 차단
    if (
      /^\s*<<\s*:/.test(entry.text) ||
      /(?:^|:\s+|-\s+)[&*][A-Za-z0-9_-]+/.test(stripTrailingComment(entry.text))
    ) {
      parseErrors.push(`${filename}:${entry.lineNo}: YAML anchor/alias/merge 문법은 허용하지 않습니다.`);
    }
  }

  // 1단계: 최상위(들여쓰기 0) 블록을 빠짐없이 스캔 (인식되지 않는 줄 즉시 오류 기록)
  const topBlocks = new Map();
  let cursor = 0;
  while (cursor < indexedLines.length) {
    const entry = indexedLines[cursor];
    const trimmed = entry.text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      cursor += 1;
      continue;
    }
    const match = entry.text.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) {
      parseErrors.push(
        `${filename}:${entry.lineNo}: 최상위 키는 들여쓰기 0의 따옴표 없는 식별자여야 합니다.`,
      );
      cursor += 1;
      continue;
    }
    const [, key, rest] = match;
    if (!ALLOWED_TOP_KEYS.has(key)) {
      parseErrors.push(`${filename}:${entry.lineNo}: 허용되지 않은 최상위 키 '${key}'입니다.`);
    }
    if (topBlocks.has(key)) {
      parseErrors.push(`${filename}:${entry.lineNo}: 중복된 최상위 키 '${key}'가 있습니다.`);
    }
    const { block, nextIndex } = sliceIndentedBlock(indexedLines, cursor + 1, 2);
    topBlocks.set(key, { lineNo: entry.lineNo, inline: stripTrailingComment(rest).trim(), lines: block });
    cursor = nextIndex;
  }

  // 2단계: on 트리거 블록 엄격 분석
  const triggers = {};
  const onBlock = topBlocks.get("on");
  if (!onBlock) {
    parseErrors.push(`${filename}: 최상위 'on:' 트리거 블록이 없습니다.`);
  } else if (onBlock.inline.length > 0) {
    parseErrors.push(`${filename}:${onBlock.lineNo}: 'on:' 트리거는 인라인 축약 대신 명시적 하위 블록으로 작성해야 합니다.`);
  } else {
    let i = 0;
    while (i < onBlock.lines.length) {
      const entry = onBlock.lines[i];
      const trimmed = entry.text.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      const evMatch = entry.text.match(/^  ([A-Za-z0-9_-]+):(.*)$/);
      if (!evMatch) {
        parseErrors.push(
          `${filename}:${entry.lineNo}: 'on' 하위 이벤트 키는 공백 2칸과 따옴표 없는 이름이어야 합니다.`,
        );
        i += 1;
        continue;
      }
      const [, eventName, rest] = evMatch;
      const inlineRest = stripTrailingComment(rest).trim();
      if (inlineRest.length > 0) {
        parseErrors.push(
          `${filename}:${entry.lineNo}: 'on.${eventName}'에는 인라인 값('${inlineRest}')을 둘 수 없습니다.`,
        );
      }
      if (Object.hasOwn(triggers, eventName)) {
        parseErrors.push(`${filename}:${entry.lineNo}: 중복된 트리거 '${eventName}'가 있습니다.`);
      }
      const { block: evLines, nextIndex } = sliceIndentedBlock(onBlock.lines, i + 1, 4);
      const eventInfo = {
        branches: null,
        branchesIgnore: false,
        paths: false,
        pathsIgnore: false,
        types: null,
      };

      if (eventName === "pull_request") {
        let j = 0;
        while (j < evLines.length) {
          const subEntry = evLines[j];
          const subTrimmed = subEntry.text.trim();
          if (!subTrimmed || subTrimmed.startsWith("#")) {
            j += 1;
            continue;
          }
          const subMatch = subEntry.text.match(/^    ([A-Za-z0-9_-]+):(.*)$/);
          if (!subMatch) {
            parseErrors.push(
              `${filename}:${subEntry.lineNo}: 'on.pull_request' 하위 키는 공백 4칸과 따옴표 없는 이름이어야 합니다.`,
            );
            j += 1;
            continue;
          }
          const [, subKey, subRest] = subMatch;
          if (!ALLOWED_PR_SUBKEYS.has(subKey)) {
            parseErrors.push(
              `${filename}:${subEntry.lineNo}: 'on.pull_request'에 허용되지 않은 하위 키 '${subKey}'가 있습니다.`,
            );
          }
          const { block: subChildren, nextIndex: subNext } = sliceIndentedBlock(evLines, j + 1, 6);
          const parsedList = parseStrictStringList(
            filename,
            `on.pull_request.${subKey}`,
            subRest,
            subChildren,
            6,
            parseErrors,
          );
          if (subKey === "branches") eventInfo.branches = parsedList;
          if (subKey === "branches-ignore") eventInfo.branchesIgnore = true;
          if (subKey === "paths") eventInfo.paths = true;
          if (subKey === "paths-ignore") eventInfo.pathsIgnore = true;
          if (subKey === "types") eventInfo.types = parsedList;
          j = subNext;
        }
      }

      triggers[eventName] = eventInfo;
      i = nextIndex;
    }
  }

  // 3단계: 최상위 concurrency 블록 엄격 분석
  let concurrency = null;
  const concurrencyBlock = topBlocks.get("concurrency");
  if (concurrencyBlock) {
    concurrency = parseConcurrencyBlock(
      filename,
      concurrencyBlock.inline,
      concurrencyBlock.lines,
      2,
      parseErrors,
    );
  }

  // 4단계: jobs 블록 엄격 분석 (인식되지 않는 줄·따옴표 키·비표준 들여쓰기 전면 차단)
  const jobs = {};
  const jobsBlock = topBlocks.get("jobs");
  if (!jobsBlock) {
    parseErrors.push(`${filename}: 최상위 'jobs:' 블록이 없습니다.`);
  } else if (jobsBlock.inline.length > 0) {
    parseErrors.push(`${filename}:${jobsBlock.lineNo}: 'jobs:'에는 인라인 값을 둘 수 없습니다.`);
  } else {
    let i = 0;
    while (i < jobsBlock.lines.length) {
      const entry = jobsBlock.lines[i];
      const trimmed = entry.text.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        i += 1;
        continue;
      }
      const jobMatch = entry.text.match(/^  ([A-Za-z0-9_-]+):(.*)$/);
      if (!jobMatch) {
        parseErrors.push(
          `${filename}:${entry.lineNo}: 'jobs' 하위 작업 ID는 공백 2칸과 따옴표 없는 식별자여야 합니다.`,
        );
        i += 1;
        continue;
      }
      const [, jobId, jobRest] = jobMatch;
      if (stripTrailingComment(jobRest).trim().length > 0) {
        parseErrors.push(`${filename}:${entry.lineNo}: job '${jobId}' 선언 줄에는 인라인 값을 둘 수 없습니다.`);
      }
      if (Object.hasOwn(jobs, jobId)) {
        parseErrors.push(`${filename}:${entry.lineNo}: 중복된 job ID '${jobId}'가 있습니다.`);
      }

      const { block: jobLines, nextIndex: jobNext } = sliceIndentedBlock(jobsBlock.lines, i + 1, 4);
      const seenJobProps = new Set();
      const jobInfo = {
        jobId,
        name: null,
        ifCondition: null,
        hasNeeds: false,
        hasStrategy: false,
        hasReusableUses: false,
        hasContinueOnError: false,
        concurrency: null,
        steps: [],
      };

      let j = 0;
      while (j < jobLines.length) {
        const propEntry = jobLines[j];
        const propTrimmed = propEntry.text.trim();
        if (!propTrimmed || propTrimmed.startsWith("#")) {
          j += 1;
          continue;
        }
        const propMatch = propEntry.text.match(/^    ([A-Za-z0-9_-]+):(.*)$/);
        if (!propMatch) {
          parseErrors.push(
            `${filename}:${propEntry.lineNo}: job '${jobId}' 속성은 공백 4칸과 따옴표 없는 키여야 합니다.`,
          );
          j += 1;
          continue;
        }
        const [, propKey, propRest] = propMatch;
        if (!ALLOWED_JOB_KEYS.has(propKey)) {
          parseErrors.push(
            `${filename}:${propEntry.lineNo}: job '${jobId}'에 허용되지 않은 속성 '${propKey}'가 있습니다.`,
          );
        }
        if (seenJobProps.has(propKey)) {
          parseErrors.push(
            `${filename}:${propEntry.lineNo}: job '${jobId}'에 중복된 속성 '${propKey}'가 있습니다.`,
          );
        }
        seenJobProps.add(propKey);

        const { block: propChildren, nextIndex: propNext } = sliceIndentedBlock(jobLines, j + 1, 6);
        const nonCommentChildren = propChildren.filter(
          (line) => line.text.trim() && !line.text.trim().startsWith("#"),
        );

        if (propKey === "name" || propKey === "if") {
          const scalar = unquoteScalar(propRest);
          if (
            !scalar ||
            isBlockScalarHeader(propRest) ||
            hasFlowBracesOutsideExpressions(propRest) ||
            nonCommentChildren.length > 0
          ) {
            parseErrors.push(
              `${filename}:${propEntry.lineNo}: job '${jobId}.${propKey}'는 단일 줄 스칼라여야 합니다.`,
            );
          } else if (propKey === "name") {
            jobInfo.name = scalar;
          } else {
            jobInfo.ifCondition = scalar;
          }
        } else if (propKey === "needs") {
          jobInfo.hasNeeds = true;
        } else if (propKey === "strategy") {
          jobInfo.hasStrategy = true;
        } else if (propKey === "uses") {
          jobInfo.hasReusableUses = true;
        } else if (propKey === "continue-on-error") {
          jobInfo.hasContinueOnError = true;
        } else if (propKey === "concurrency") {
          jobInfo.concurrency = parseConcurrencyBlock(
            filename,
            propRest,
            propChildren,
            6,
            parseErrors,
          );
        } else if (propKey === "steps") {
          if (stripTrailingComment(propRest).trim().length > 0) {
            parseErrors.push(
              `${filename}:${propEntry.lineNo}: job '${jobId}.steps'에는 인라인 값을 둘 수 없습니다.`,
            );
          }
          jobInfo.steps = parseStepsBlock(filename, jobId, propChildren, parseErrors);
        }

        j = propNext;
      }

      jobs[jobId] = jobInfo;
      i = jobNext;
    }
  }

  return { filename, parseErrors, triggers, concurrency, jobs };
}

/**
 * `steps:` 하위 줄을 엄격하게 파싱한다.
 * - 각 step 시작 줄은 반드시 `      - <따옴표 없는 키>:`(공백 6칸 + `- ` + 식별자)여야 한다.
 * - 각 step의 후속 속성 줄은 반드시 `        <따옴표 없는 키>:`(공백 8칸 + 식별자)여야 한다.
 * - `run` 멀티라인 블록과 `with`/`env` 하위 매핑 외의 모든 비표준 들여쓰기·따옴표 키는 즉시 parseErrors로 차단한다.
 */
function parseStepsBlock(filename, jobId, stepEntries, parseErrors) {
  const steps = [];
  let cursor = 0;

  while (cursor < stepEntries.length) {
    const entry = stepEntries[cursor];
    const trimmed = entry.text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      cursor += 1;
      continue;
    }
    const headerMatch = entry.text.match(/^ {6}- ([A-Za-z0-9_-]+):(.*)$/);
    if (!headerMatch) {
      parseErrors.push(
        `${filename}:${entry.lineNo}: job '${jobId}'의 step 항목은 공백 6칸과 '- <키>:' 형식이어야 합니다(따옴표 키·추가 공백 금지).`,
      );
      cursor += 1;
      continue;
    }

    // 다음 공백 6칸 `- ` 시작 전까지를 현재 step 범위로 분리
    let stepEnd = cursor + 1;
    while (stepEnd < stepEntries.length) {
      const candidate = stepEntries[stepEnd];
      const cTrimmed = candidate.text.trim();
      if (!cTrimmed || cTrimmed.startsWith("#")) {
        stepEnd += 1;
        continue;
      }
      const indent = candidate.text.match(/^ */)[0].length;
      if (indent < 6) {
        parseErrors.push(`${filename}:${candidate.lineNo}: step 블록 내부 들여쓰기가 6칸 미만입니다.`);
        break;
      }
      if (indent === 6) {
        if (/^ {6}- /.test(candidate.text)) break;
        parseErrors.push(
          `${filename}:${candidate.lineNo}: 공백 6칸 줄은 새 step('- <키>:')만 허용됩니다.`,
        );
      }
      stepEnd += 1;
    }

    const currentSlice = stepEntries.slice(cursor, stepEnd);
    const seenStepKeys = new Set();
    const stepInfo = {
      name: null,
      ifCondition: null,
      hasContinueOnError: false,
      run: null,
    };

    let sIdx = 0;
    while (sIdx < currentSlice.length) {
      const sEntry = currentSlice[sIdx];
      const sTrimmed = sEntry.text.trim();
      if (!sTrimmed || sTrimmed.startsWith("#")) {
        sIdx += 1;
        continue;
      }

      let propKey;
      let propRest;
      let childMinIndent;
      if (sIdx === 0) {
        const [, firstKey, firstRest] = sEntry.text.match(/^ {6}- ([A-Za-z0-9_-]+):(.*)$/);
        propKey = firstKey;
        propRest = firstRest;
        childMinIndent = 10;
      } else {
        const subMatch = sEntry.text.match(/^ {8}([A-Za-z0-9_-]+):(.*)$/);
        if (!subMatch) {
          parseErrors.push(
            `${filename}:${sEntry.lineNo}: job '${jobId}'의 step 속성은 공백 8칸과 따옴표 없는 키여야 합니다.`,
          );
          sIdx += 1;
          continue;
        }
        [, propKey, propRest] = subMatch;
        childMinIndent = 10;
      }

      if (!ALLOWED_STEP_KEYS.has(propKey)) {
        parseErrors.push(
          `${filename}:${sEntry.lineNo}: job '${jobId}' step에 허용되지 않은 키 '${propKey}'가 있습니다.`,
        );
      }
      if (seenStepKeys.has(propKey)) {
        parseErrors.push(
          `${filename}:${sEntry.lineNo}: job '${jobId}' step에 중복된 키 '${propKey}'가 있습니다.`,
        );
      }
      seenStepKeys.add(propKey);

      const { block: propChildren, nextIndex: nextSIdx } = sliceIndentedBlock(
        currentSlice,
        sIdx + 1,
        childMinIndent,
      );
      const nonCommentChildren = propChildren.filter(
        (line) => line.text.trim() && !line.text.trim().startsWith("#"),
      );

      if (propKey === "run") {
        if (isBlockScalarHeader(propRest)) {
          stepInfo.run = extractBlockScalarText(propChildren, childMinIndent);
        } else {
          const inlineRun = unquoteScalar(propRest);
          if (!inlineRun || nonCommentChildren.length > 0) {
            parseErrors.push(
              `${filename}:${sEntry.lineNo}: job '${jobId}'의 단일 줄 'run' 아래에 하위 줄이 있거나 명령이 비어 있습니다.`,
            );
          } else {
            stepInfo.run = inlineRun;
          }
        }
      } else if (propKey === "with" || propKey === "env") {
        if (stripTrailingComment(propRest).trim().length > 0) {
          parseErrors.push(
            `${filename}:${sEntry.lineNo}: step '${propKey}'에는 인라인 매핑을 둘 수 없습니다.`,
          );
        }
        for (const child of nonCommentChildren) {
          if (!/^ {10}[A-Za-z0-9_-]+:/.test(child.text)) {
            parseErrors.push(
              `${filename}:${child.lineNo}: step '${propKey}' 하위 항목은 공백 10칸과 따옴표 없는 키여야 합니다.`,
            );
          }
        }
      } else {
        const scalar = unquoteScalar(propRest);
        if (
          !scalar ||
          isBlockScalarHeader(propRest) ||
          hasFlowBracesOutsideExpressions(propRest) ||
          nonCommentChildren.length > 0
        ) {
          parseErrors.push(
            `${filename}:${sEntry.lineNo}: step '${propKey}'는 단일 줄 스칼라여야 합니다.`,
          );
        } else if (propKey === "name") {
          stepInfo.name = scalar;
        } else if (propKey === "if") {
          stepInfo.ifCondition = scalar;
        } else if (propKey === "continue-on-error") {
          stepInfo.hasContinueOnError = true;
        }
      }

      sIdx = nextSIdx;
    }

    steps.push(stepInfo);
    cursor = stepEnd;
  }

  return steps;
}

/** 셸 주석 줄을 제거한 실제 실행 명령 텍스트를 반환한다 (`# npm run ...` 주석 위장 방지). */
function executableRunLines(runText) {
  if (typeof runText !== "string") return "";
  return runText
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    })
    .join("\n");
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
    if (!Array.isArray(prTrigger.branches) || !prTrigger.branches.includes("main")) {
      errors.push(`${workflowFile}: 'pull_request.branches'에 'main'이 명시적으로 포함되어야 합니다.`);
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

  // 3. 각 필수 GitHub Actions 체크의 정확한 이름·if/needs/step-if/run/오류무시 우회 차단 검사
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
    if (job.hasNeeds) {
      errors.push(
        `${check.workflow} (${check.jobId}): 선행 job skip에 따른 전이 'skipped' 통과 우회를 막기 위해 필수 job에는 'needs'를 둘 수 없습니다.`,
      );
    }
    if (job.hasStrategy) {
      errors.push(`${check.workflow} (${check.jobId}): 'strategy'(matrix)는 체크 이름에 접미사를 붙여 브랜치 보호 매칭을 깨뜨리므로 금지됩니다.`);
    }
    if (job.hasReusableUses) {
      errors.push(`${check.workflow} (${check.jobId}): 재사용 워크플로 호출('uses')은 체크 이름 접두사를 바꾸므로 금지됩니다.`);
    }
    if (job.ifCondition !== check.allowedJobIf) {
      errors.push(
        `${check.workflow} (${check.jobId}): 허용되지 않은 job 'if' 조건입니다(GitHub는 skipped 체크를 통과로 간주해 게이트가 우회됨). 실제=${JSON.stringify(job.ifCondition)}, 기대=${JSON.stringify(check.allowedJobIf)}`,
      );
    }
    if (check.allowedJobConcurrencyGroup === null) {
      if (job.concurrency !== null) {
        errors.push(
          `${check.workflow} (${check.jobId}): 허용되지 않은 job 수준 'concurrency' 설정(취소 우회 위험)이 있습니다.`,
        );
      }
    } else if (job.concurrency?.group !== check.allowedJobConcurrencyGroup) {
      errors.push(
        `${check.workflow} (${check.jobId}): job 'concurrency.group'이 정본과 다릅니다.`,
      );
    }
    if (job.hasContinueOnError || job.steps.some((step) => step.hasContinueOnError)) {
      errors.push(`${check.workflow} (${check.jobId}): 필수 체크의 실패를 숨기는 'continue-on-error'는 금지됩니다.`);
    }

    // 허용된 (if 조건, run 본문) 쌍 외의 단계별 if 전면 차단 및 필수 조건부 단계 존재 확인
    for (const step of job.steps) {
      if (step.ifCondition === null) continue;
      const runBody = executableRunLines(step.run);
      const allowedRule = check.allowedStepIfs.find(
        (rule) => rule.ifCondition === step.ifCondition && runBody.includes(rule.runSnippet),
      );
      if (!allowedRule) {
        errors.push(
          `${check.workflow} (${check.jobId}): 허용되지 않은 step 'if' 조건('${step.ifCondition}')입니다.`,
        );
      }
    }
    for (const rule of check.allowedStepIfs) {
      const exists = job.steps.some(
        (step) =>
          step.ifCondition === rule.ifCondition &&
          executableRunLines(step.run).includes(rule.runSnippet),
      );
      if (!exists) {
        errors.push(
          `${check.workflow} (${check.jobId}): 조건부 필수 단계('${rule.runSnippet}', if='${rule.ifCondition}')가 누락되었거나 변경되었습니다.`,
        );
      }
    }

    // 핵심 검증 명령이 step.name이나 주석이 아닌 실제 무조건부(step.if === null) step.run에 존재하는지 검사
    for (const requiredSnippet of check.requiredRunSnippets) {
      const matchedStep = job.steps.find(
        (step) =>
          step.ifCondition === null &&
          executableRunLines(step.run).includes(requiredSnippet),
      );
      if (!matchedStep) {
        errors.push(
          `${check.workflow} (${check.jobId}): 조건 없는 실제 실행 단계('run')에서 필수 명령 '${requiredSnippet}'를 찾지 못했습니다.`,
        );
      }
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

  // 5. 정기·운영 관측 및 경로 조건부 워크플로의 분리 경계 검증
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
