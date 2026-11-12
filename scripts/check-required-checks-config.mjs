/**
 * 역할: 저장소 워크플로의 PR 필수 보안·품질 체크 경계와(선택 시) GitHub 브랜치 보호 스냅샷을 검증하는 읽기 전용 CLI
 * 사용 위치:
 *   - .github/workflows/ci.yml (기존 main 필수 웹 CI)
 *   - .github/workflows/repository-security.yml (저장소 보안 게이트)
 *   - 운영자의 main 브랜치 보호 설정 점검 (`--protection-file <JSON 경로>`)
 * 주요 기능:
 *   - 기존 설치 의존성 js-yaml JSON_SCHEMA, 네트워크·비밀값 없이 `.github/workflows/*.yml` 전체의 필수 체크 생성·우회 차단 불변식 검사
 *   - `--protection-file`이 명시된 경우에만 실제 GitHub 관리자 스냅샷을 목표 6개 체크와 대조
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateBranchProtection,
  validateWorkflowCheckBoundaries,
} from "./_lib/required-checks-policy.mjs";

/** CLI 인수를 파싱하며 허용되지 않은 플래그는 즉시 거부한다. */
function parseArgs(argv) {
  let protectionFile = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--protection-file") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--protection-file 뒤에 JSON 파일 경로를 지정해야 합니다.");
      }
      protectionFile = resolve(process.cwd(), value);
      i += 1;
    } else {
      throw new Error(`알 수 없는 인수입니다: ${arg}`);
    }
  }
  return { protectionFile };
}

try {
  const { protectionFile } = parseArgs(process.argv.slice(2));
  const workflowsDir = new URL("../.github/workflows/", import.meta.url);
  const filenames = readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  const workflowsByFilename = Object.fromEntries(
    filenames.map((name) => [name, readFileSync(new URL(name, workflowsDir), "utf8")]),
  );

  const errors = validateWorkflowCheckBoundaries(workflowsByFilename);

  if (protectionFile) {
    const protectionJson = JSON.parse(readFileSync(protectionFile, "utf8"));
    const protectionResult = validateBranchProtection(protectionJson);
    errors.push(...protectionResult.errors);
  }

  for (const error of errors) console.error(error);
  console.log(
    errors.length
      ? "필수 체크·브랜치 보호 경계 검사 실패"
      : protectionFile
        ? "워크플로 필수 체크 경계 및 main 브랜치 보호 설정 검사 통과"
        : "워크플로 필수 체크·관측 분리 경계 검사 통과",
  );
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  console.error(
    "필수 체크 설정을 검사하지 못했습니다:",
    error instanceof Error ? error.message : "알 수 없는 오류",
  );
  process.exitCode = 1;
}
