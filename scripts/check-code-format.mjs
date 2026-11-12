import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, format, getFileInfo } from "prettier";
import { isCommitSha, isFormatTarget, parseGitPaths } from "./_lib/format-scope.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  const mode = process.argv[2];
  if (!["--staged", "--changed"].includes(mode) || process.argv.length !== 3) {
    throw new Error("사용법: node scripts/check-code-format.mjs --staged|--changed");
  }

  let files;
  let revision = ":";
  if (mode === "--changed") {
    // GitHub 이벤트와 커밋을 검증하고 작업 트리가 아닌 HEAD를 사용합니다.
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error("GitHub Actions 이벤트 파일 경로가 필요합니다.");
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const base = event.pull_request?.base?.sha ?? event.before;
    const head = git("rev-parse", "HEAD").toString("utf8").trim();
    if (!isCommitSha(base) || !isCommitSha(head)) {
      throw new Error("GitHub 이벤트 또는 검증 HEAD에서 유효한 SHA를 찾지 못했습니다.");
    }
    revision = head + ":";
    files = parseGitPaths(git("diff", "--name-only", "-z", "--diff-filter=ACMR", base, head, "--"));
  } else {
    files = parseGitPaths(git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", "--"));
  }

  // 설정과 ignore 규칙도 소스와 동일한 Git revision에서 읽습니다.
  // 가상 루트에 ignore 파일을 두어 실제 작업 트리의 미스테이징 설정을 보지 않습니다.
  const temporary = mkdtempSync(join(tmpdir(), "hra-format-snapshot-"));
  try {
    const config = JSON.parse(git("show", revision + ".prettierrc.json").toString("utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("Prettier 설정이 올바른 JSON 객체가 아닙니다.");
    }
    const ignorePath = join(temporary, ".prettierignore");
    writeFileSync(ignorePath, git("show", revision + ".prettierignore"), { mode: 0o600 });

    const invalid = [];
    let checked = 0;
    for (const file of files) {
      if (!isFormatTarget(file)) continue;
      const virtualFile = resolve(temporary, file);
      const info = await getFileInfo(virtualFile, { ignorePath, resolveConfig: false });
      if (info.ignored || !info.inferredParser) continue;

      // 변경 소스도 staged index 또는 검증 HEAD의 실제 바이트만 사용합니다.
      const source = git("show", revision + file).toString("utf8");
      checked++;
      if (!(await check(source, { ...config, filepath: virtualFile }))) {
        if (file === "scripts/tests/dependency-policy.test.mjs") {
          // 임시 CI 진단: 공개 회귀 테스트 파일의 포맷 결과만 분할해 출력합니다.
          const formatted = await format(source, { ...config, filepath: virtualFile });
          const encoded = Buffer.from(formatted).toString("base64");
          const chunkSize = 2048;
          const count = Math.ceil(encoded.length / chunkSize);
          for (let index = 0; index < count; index++) {
            console.error("FORMAT_DEP_PART " + index + " " + count + " " + encoded.slice(index * chunkSize, (index + 1) * chunkSize));
          }
        }
        invalid.push(file);
      }
    }

    if (invalid.length) {
      console.error("포맷 오류 " + invalid.length + "개 (검사 " + checked + "개):");
      for (const file of invalid) {
        console.error("  - " + file);
      }
      console.error("수정: npm run format:write -- <파일> 후 git add 로 다시 스테이징하세요.");
      process.exitCode = 1;
      return;
    }
    console.log(
      "변경 소스 포맷 검사 통과 (" + checked + "개 검사, " + files.length + "개 변경 파일)",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Git diff/show·설정·Prettier 오류는 건너뛰지 않고 커밋과 CI를 차단합니다.
  console.error("변경 소스 포맷 검증에 실패했습니다:", error.message);
  process.exitCode = 1;
});
