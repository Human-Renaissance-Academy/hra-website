/**
 * 배포 환경변수 계약의 정적 검사입니다. 앱을 import하거나 실제 환경 파일을 읽지 않습니다.
 * TypeScript AST로 이름과 접근 형태를 수집하고 예시·메타데이터·생성 문서의 일치를 검증합니다.
 */
import ts from "typescript";

export const referencePath = "docs/developer/environment-inventory.md";
export const sourceRoots = ["src", "scripts", "tests/support", "tests/e2e"];
export const configPaths = ["next.config.ts", "drizzle.config.ts", "playwright.config.ts", "vitest.config.mts"];

/** 공백·주석만 무시하고 문자열 내용과 토큰은 그대로 비교합니다. 예외 범위를 넓히지 않습니다. */
function signature(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push([token, scanner.getTokenText()]);
  }
  return JSON.stringify(tokens);
}

/** 점 표기와 문자열 인덱스 표기만 정적으로 판별합니다. 별칭·계산식은 별도 검토 대상입니다. */
function isEnvironment(node) {
  return (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
    node.expression.text === "process" && node.name.text === "env") ||
    (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === "process" && ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === "env");
}

/** 입력은 경로/소스 문자열뿐입니다. 수집 결과에도 환경변수의 실제 값은 포함하지 않습니다. */
export function collectEnvironmentReferences(sources, dynamicAccess = []) {
  const references = new Map();
  const errors = [];
  const seenExceptions = new Set();
  const add = (name, path) => {
    if (!references.has(name)) references.set(name, new Set());
    references.get(name).add(path);
  };
  for (const { path, text } of sources) {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    if (file.parseDiagnostics.length) errors.push(`${path}: 소스를 파싱할 수 없습니다.`);
    const fail = (node, reason) => errors.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${reason}`);
    const allowDynamic = (node) => {
      for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
        const key = signature(ancestor.getText(file));
        const index = dynamicAccess.findIndex((entry) => entry.path === path && signature(entry.expression) === key);
        if (index >= 0) {
          seenExceptions.add(index);
          for (const name of dynamicAccess[index].names) add(name, path);
          return true;
        }
      }
      return false;
    };
    const visit = (node) => {
      if (isEnvironment(node)) {
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) add(parent.name.text, path);
        else if (ts.isElementAccessExpression(parent) && parent.expression === node &&
          ts.isStringLiteralLike(parent.argumentExpression)) add(parent.argumentExpression.text, path);
        else if (!allowDynamic(node)) fail(node, "검토되지 않은 동적 환경 접근·전체 환경 전달입니다.");
      }
      // process 자체를 전달하거나 별칭으로 보관하면 이후 env 접근을 추적할 수 없으므로 차단합니다.
      if (ts.isIdentifier(node) && node.text === "process" &&
        !((ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node) &&
        !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
        fail(node, "process 별칭·전체 객체 전달은 허용하지 않습니다.");
      }
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "process" && !ts.isStringLiteralLike(node.argumentExpression)) {
        fail(node, "계산식으로 process 속성을 선택할 수 없습니다.");
      }
      if (ts.isImportDeclaration(node) && ["process", "node:process"].includes(node.moduleSpecifier.text)) {
        fail(node, "process 모듈 별칭 대신 검사 가능한 전역 process.env를 사용하세요.");
      }
      if ((ts.isCallExpression(node) && node.arguments.some((argument) =>
        ts.isStringLiteralLike(argument) && ["process", "node:process"].includes(argument.text)) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === "require")) ||
        (ts.isExportDeclaration(node) && node.moduleSpecifier && ["process", "node:process"].includes(node.moduleSpecifier.text))) {
        fail(node, "동적 import·require·재수출로 process를 우회할 수 없습니다.");
      }
      if (!isEnvironment(node) && ((ts.isPropertyAccessExpression(node) && node.name.text === "env") ||
        (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "env"))) {
        fail(node, "검사할 수 없는 수신 객체의 env 속성입니다. 전역 process.env만 사용하세요.");
      }
      if (ts.isPropertyAccessExpression(node) && node.name.text === "process" &&
        ["globalThis", "global", "window"].includes(node.expression.getText(file))) {
        fail(node, "전역 객체를 통한 process 접근은 허용하지 않습니다.");
      }
      if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === "process" && ["globalThis", "global", "window"].includes(node.expression.getText(file))) {
        fail(node, "전역 객체의 인덱스로 process에 접근할 수 없습니다.");
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  dynamicAccess.forEach((entry, index) => {
    if (!seenExceptions.has(index)) errors.push(`${entry.path}: 사용하지 않는 동적 접근 예외입니다.`);
  });
  return { references, errors };
}

/** 예시 파일의 값은 정해진 합성 값과만 비교하며 오류에 값 자체를 출력하지 않습니다. */
export function validateEnvironmentContract({ inventory, sources, example, document, crons }) {
  const errors = [];
  const categories = ["application", "sdk", "legacy", "operator", "platform", "qa", "tooling", "system"];
  const entries = inventory.variables;
  if (!Array.isArray(entries) || !Array.isArray(inventory.dynamicAccess)) return ["환경 목록 형식이 올바르지 않습니다."];
  const names = entries.map((entry) => entry.name);
  if (new Set(names).size !== names.length) errors.push("환경 목록 이름이 중복되었습니다.");
  for (const entry of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(entry.name) || !categories.includes(entry.category) ||
      typeof entry.secret !== "boolean" || !Array.isArray(entry.environments) || !entry.environments.length ||
      entry.environments.some((environment) => typeof environment !== "string" || !environment.trim()) ||
      [entry.purpose, entry.requiredWhen, entry.missing, entry.isolation].some((value) => typeof value !== "string" || !value.trim()) ||
      !["active", "commented", "omitted"].includes(entry.example?.mode) ||
      typeof entry.example?.value !== "string" ||
      ((entry.implicit || entry.category === "sdk") && (typeof entry.owner !== "string" || !entry.owner.trim())) ||
      (entry.implicit && !["AUTH_SECRET", "AUTH_TRUST_HOST", "NEXTAUTH_URL", "NEXTAUTH_SECRET", "BLOB_READ_WRITE_TOKEN"].includes(entry.name))) {
      errors.push(`${entry.name}: 필수 메타데이터가 누락되었거나 잘못되었습니다.`);
    }
    if ((entry.secret || /(?:_BLOB_HOST|_ID)$/.test(entry.name) ||
      ["AUTH_URL", "AUTH_TRUST_HOST", "ADMIN_EMAIL", "ADMIN_NAME"].includes(entry.name)) && entry.example?.value && entry.name !== "DATABASE_URL") {
      errors.push(`${entry.name}: 비밀값·비공개 호스트·계정 ID의 예시는 비워야 합니다.`);
    }
    if (/(?:_ENABLED|_EMAIL_SCOPE)$/.test(entry.name) && entry.example?.value !== "false") {
      errors.push(`${entry.name}: 예시 기능 gate는 false여야 합니다.`);
    }
    if ((entry.name === "DATABASE_URL" && entry.example?.value !== "postgresql://user:password@ep-example.us-east-1.aws.neon.tech/hra?sslmode=require") ||
      (entry.name === "NEXT_PUBLIC_APP_URL" && entry.example?.value !== "http://localhost:3000") ||
      (entry.name === "HRA_CONTENT_WRITES_STOPPED" && entry.example?.value !== "")) {
      errors.push(`${entry.name}: 승인된 합성·비활성 예시만 허용합니다.`);
    }
  }
  for (const exception of inventory.dynamicAccess) {
    if (![exception.path, exception.expression, exception.reason].every((value) => typeof value === "string" && value.trim()) ||
      !Array.isArray(exception.names) || exception.names.some((name) => !names.includes(name))) {
      errors.push("동적 접근 예외의 근거·이름이 올바르지 않습니다.");
    }
  }
  if (errors.length) return errors;
  const collected = collectEnvironmentReferences(sources, inventory.dynamicAccess);
  errors.push(...collected.errors);
  for (const name of collected.references.keys()) if (!names.includes(name)) errors.push(`${name}: 선언되지 않은 환경변수입니다.`);
  for (const entry of entries) {
    if (!entry.implicit && !collected.references.has(entry.name)) errors.push(`${entry.name}: 소스에서 제거된 환경변수입니다.`);
  }
  const declarations = new Map();
  for (const line of example.split(/\r?\n/)) {
    const match = /^(# )?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      if (line.trim() && !line.startsWith("#")) errors.push("예시 파일에 해석할 수 없는 선언이 있습니다.");
      continue;
    }
    const [, comment, name, value] = match;
    if (declarations.has(name)) errors.push(`${name}: 예시 선언이 중복되었습니다.`);
    declarations.set(name, { mode: comment ? "commented" : "active", value });
  }
  for (const name of declarations.keys()) if (!names.includes(name)) errors.push(`${name}: 선언되지 않은 예시 항목입니다.`);
  for (const entry of entries) {
    const actual = declarations.get(entry.name);
    if (entry.example.mode === "omitted" ? actual : !actual || actual.mode !== entry.example.mode || actual.value !== entry.example.value) {
      errors.push(`${entry.name}: 예시 항목이 안전한 선언과 다릅니다.`);
    }
  }
  if (JSON.stringify(crons) !== JSON.stringify([{ path: "/api/cron/cleanup-rate-limits", schedule: "0 3 * * *" }])) {
    errors.push("승인된 요청 제한 정리 일정만 등록해야 합니다. 학사 Cron은 별도 결정입니다.");
  }
  if (document !== renderEnvironmentReference(inventory)) errors.push("생성 환경변수 문서가 정본 메타데이터와 다릅니다.");
  return errors;
}

/** 공개 문서에는 설정 이름·정책·합성 예시만 사용하며 실제 자격정보를 조회하지 않습니다. */
export function renderEnvironmentReference(inventory) {
  const labels = { application: "앱 설정", sdk: "명시적으로 지원하는 SDK 설정", legacy: "기존 선택 코드", operator: "일회성 운영 명령", platform: "플랫폼 제공 값", qa: "격리 QA 입력", tooling: "개발·CI 도구", system: "허용한 시스템 전달 값" };
  const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = [
    "# 환경변수 계약 목록", "",
    "> 생성 정본: `scripts/_lib/environment-inventory.mjs`. 직접 수정하지 말고 `node scripts/check-environment-contract.mjs --write-reference`로 갱신합니다.", "",
    "이 문서는 #282의 저장소 정적 계약입니다. 실제 Vercel·Neon·Blob 설정이나 환경 분리 완료를 증명하지 않습니다. 배포 절차는 [배포 안내](../DEPLOYMENT.md)를 따릅니다.", "",
    "Production·Preview·Development는 DB·공개/비공개 Blob·OAuth·세션 비밀값을 서로 공유하지 않습니다. Preview에서 Production 값을 상속하지 않으며, 필요한 격리 자원이 없으면 기능을 끄거나 검증을 중단합니다. 이는 적용할 정책이며 실제 연결을 자동 검증했다는 뜻은 아닙니다.", "",
    "## 동작을 해석할 때", "",
    "- 보호 자료는 `RESOURCE_PRIVATE_BLOB_ENABLED`가 true가 아니면 기존 공개 저장소를 선택합니다. true인 상태에서 private 호스트·토큰이 없거나 잘못되면 업로드를 거부하고 공개 저장소로 되돌리지 않습니다. 기존 공개 파일 이전은 별도 #268입니다.",
    "- 학사 제출은 항상 명시한 Private Blob만 사용합니다. 업로드는 학사·업로드 gate가 모두 true여야 합니다. 정리는 사용자 기능과 독립된 cleanup gate로 실행하며 실제 삭제에는 별도 delete gate가 필요합니다. 기본은 비활성·dry-run입니다.",
    "- 사이트 메타데이터 주소는 `src/lib/site-url.ts`가 정합니다. VERCEL_ENV=production이면 VERCEL_PROJECT_PRODUCTION_URL → 고정 운영 주소, 다른 VERCEL_ENV이면 VERCEL_URL → NEXT_PUBLIC_APP_URL/localhost, Vercel 밖이면 production 실행은 고정 운영 주소, 개발은 NEXT_PUBLIC_APP_URL/localhost입니다. 검색 색인은 VERCEL_ENV=production에서만 허용합니다([색인 정책](seo-indexing-policy.md)).",
    "- `vercel.json`의 유일한 일정은 `/api/cron/cleanup-rate-limits`, `0 3 * * *` (03:00 UTC/12:00 KST)입니다. 두 cleanup API는 CRON_SECRET 누락 시 503, 인증 실패 시 401입니다. 학사 cleanup 예약은 승인 전 자동 등록하지 않습니다.",
    "- 웹 OAuth callback은 환경별 `/api/auth/callback/google`·`/api/auth/callback/kakao`입니다. 향후 Mobile deep link·토큰 세션은 별도 설계이며 현재 웹 callback 설정이 모바일 인증 구현을 뜻하지 않습니다.",
    "- 인증 URL 선택은 위 metadataBase 주소 선택과 별도입니다. Auth.js는 AUTH_URL ?? NEXTAUTH_URL로 origin/basePath를 선택합니다. canonical 값의 빈 문자열도 nullish가 아니므로 호환 별칭을 막습니다. 새 설정은 AUTH_URL·AUTH_SECRET을 사용하며 NEXTAUTH_URL·NEXTAUTH_SECRET은 기존 호환 입력으로 구분합니다.",
    "- Auth.js의 trustHost 기본값은 !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production')입니다. 먼저 선택된 비어 있지 않은 문자열은 false라는 문자열도 true이며, 먼저 선택된 빈 문자열은 false입니다. 미설정과 빈 문자열은 다르므로 예시를 임의로 false 문자열로 채우지 않습니다.",
    "- Auth.js의 redirect proxy·secret rotation이나 Blob의 OIDC/store ID 등 모든 SDK 옵션을 지원하거나 열거하는 계약은 아닙니다. 새 옵션을 도입하려면 목록·문서·검증을 함께 변경합니다. 공급자 내부의 임의 환경변수까지 정적으로 전수 검사했다고 주장하지 않습니다.",
    "- 저장소는 `.nvmrc`와 `package.json`에 Node 24를 지정하며 앱 CI는 `.nvmrc`를 읽습니다. 앱 CI의 checkout/setup-node Action은 SHA로 고정하고 작업에는 저장소 읽기 권한만 부여합니다. 이는 저장소 설정의 확인이며 실제 Vercel 실행 버전이나 배포 성공을 증명하지 않습니다.",
    "- `scripts/verify-auth-proxy-http.mjs`와 `scripts/verify-markdown-boundary.mjs`의 여섯 시스템 값 복사는 각각 파일 경로와 전체 식이 일치할 때만 예외로 허용합니다. 새 키·동적 접근은 계약 검사에서 거부합니다. 이 정적 검사는 QA 실행기의 런타임 격리나 작업 디렉터리의 `.env` 파일 부재까지 증명하지 않습니다.", "",
  ];
  for (const [category, label] of Object.entries(labels)) {
    lines.push(`## ${label}`, "", "| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const entry of inventory.variables.filter((variable) => variable.category === category).sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`| \`${entry.name}\` | ${cell(entry.purpose)} | ${cell(entry.environments.join(" / "))}; ${cell(entry.isolation)} | ${entry.secret ? "예" : "아니요"} | ${cell(entry.requiredWhen)} | ${cell(entry.missing)} | ${entry.example.mode === "active" ? "앱 예시" : entry.example.mode === "commented" ? "주석 예시·실행 시에만 지정" : "앱 예시에 넣지 않음"} |`);
    }
    lines.push("");
  }
  lines.push("## 동적 접근의 제한된 예외", "", "전체 환경 전달은 일반 허용하지 않습니다. 아래 경로의 정확한 토큰 구조만 예외로 검사하며, 공백·주석 외의 변경은 재검토합니다. 이는 범용 데이터 흐름 분석기가 아닙니다. 환경 객체를 받는 기존 QA 어댑터의 libpq 값은 격리 실행기가 만드는 내부 입력이며 운영 환경변수로 승격하지 않습니다.", "", "| 경로 | 검토한 이유 | 수집할 이름 |", "| --- | --- | --- |");
  for (const entry of inventory.dynamicAccess) lines.push(`| \`${entry.path}\` | ${cell(entry.reason)} | ${entry.names.length ? entry.names.map((name) => `\`${name}\``).join(", ") : "새 설정 이름을 만들지 않는 전달"} |`);
  lines.push("", "## 검사 범위와 한계", "", "검사는 src, scripts, tests/support, tests/e2e와 명시한 루트 설정 파일의 JS/TS/TSX를 AST로 읽습니다. 단위 테스트의 변조 fixture, 의존성 내부, 실제 .env 및 외부 비밀 저장소를 읽지 않습니다. 운영 스크립트도 목록에 포함하지만 실행하지 않습니다. 새 계산식·별칭·환경 객체 전달은 실패하며 근거 있는 정확한 예외만 추가합니다. 이름 분류와 필수 조건·누락 동작의 의미는 코드 리뷰로 확인합니다.", "", "`node scripts/check-environment-contract.mjs`는 실제 값이나 예시의 잘못된 값을 오류에 출력하지 않습니다. 앱 CI에서 npm ci 이후 실행하며 설치 없는 PR/릴리스 정책 job의 계약은 유지합니다. 기존 문서 전체 정비나 #282의 실제 운영 확인까지 완료 처리하지 않습니다.", "");
  return lines.join("\n");
}
