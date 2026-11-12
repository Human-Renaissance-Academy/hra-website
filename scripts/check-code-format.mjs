import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, getFileInfo, resolveConfig } from "prettier";
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
  let head;
  if (mode === "--changed") {
    // runner의 공식 event JSON만 사용하고 별도 앱 환경변수는 추가하지 않습니다.
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) throw new Error("GitHub Actions 이벤트 파일 경로가 필요합니다.");
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const base = event.pull_request?.base?.sha ?? event.before;
    head = git("rev-parse", "HEAD").toString("utf8").trim();
    if (!isCommitSha(base) || !isCommitSha(head)) {
      throw new Error("GitHub 이벤트 또는 검증 HEAD에서 유효한 SHA를 찾지 못했습니다.");
    }
    files = parseGitPaths(git("diff", "--name-only", "-z", "--diff-filter=ACMR", base, head, "--"));
  } else {
    files = parseGitPaths(git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", "--"));
  }

  const invalid = [];
  let checked = 0;
  for (const file of files) {
    if (!isFormatTarget(file)) continue;
    const absolute = resolve(root, file);
    const info = await getFileInfo(absolute, {
      ignorePath: resolve(root, ".prettierignore"),
    });
    if (info.ignored || !info.inferredParser) continue;

    // --staged는 작업 트리가 아니라 Git index의 실제 커밋 대상 바이트를 검사합니다.
    const source = git("show", mode === "--staged" ? ":" + file : head + ":" + file).toString(
      "utf8",
    );
    const config = (await resolveConfig(absolute)) ?? {};
    checked++;
    if (!(await check(source, { ...config, filepath: absolute }))) {
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
  console.log("변경 소스 포맷 검사 통과 (" + checked + "개 검사, " + files.length + "개 변경 파일)");
}

main().catch((error) => {
  // diff에 실패한 경우 검사를 건너뛰지 않고 CI/커밋을 실패 처리합니다.
  console.error("변경 소스 포맷 검증에 실패했습니다:", error.message);
  process.exitCode = 1;
});
