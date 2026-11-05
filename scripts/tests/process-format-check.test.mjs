/**
 * check-process-format.mjs 의 gh 호출 회귀 테스트.
 * 가짜 gh 를 PATH 맨 앞에 두어 1MB 를 넘는 응답(대형 PR 변경 파일 목록)을 재현한다.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = new URL("../check-process-format.mjs", import.meta.url).pathname;
const BODY = "## 관련 이슈\n\nCloses #1\n\n## 변경 내용\n\n- 변경\n\n## 검증 결과\n\n- 통과\n\n## 배포 영향과 리뷰\n\n- 없음\n";

// filesBytes 만큼의 파일 목록 페이지를 내놓는 가짜 gh 로 검사기를 실행한다.
function run(filesBytes) {
  const dir = mkdtempSync(join(tmpdir(), "fake-gh-"));
  try {
    const pr = { title: "fix(ci): 형식 검사", body: BODY, changed_files: 1, labels: [],
      head: { sha: "abc", ref: "fix/x", repo: { full_name: "o/r" } }, base: { ref: "main", repo: { full_name: "o/r" } },
      user: { login: "someone" } };
    const gh = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--paginate")) {
  process.stdout.write(JSON.stringify([[{ filename: "a.txt", status: "added", pad: "x".repeat(${filesBytes}) }]]));
} else process.stdout.write(${JSON.stringify(JSON.stringify(pr))});
`;
    writeFileSync(join(dir, "gh"), gh);
    chmodSync(join(dir, "gh"), 0o755);
    const event = join(dir, "event.json");
    writeFileSync(event, JSON.stringify({ pull_request: { number: 7 } }));
    return spawnSync(process.execPath, [SCRIPT, "--event"], {
      encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
      // 전체 환경을 넘기지 않고(환경변수 계약), 검사기 실행에 필요한 값만 명시적으로 전달한다.
      env: { PATH: `${dir}:${process.env.PATH}`, GITHUB_REPOSITORY: "o/r", GITHUB_EVENT_PATH: event },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("1MB 를 넘는 gh 응답도 ENOBUFS 없이 검사한다", () => {
  const result = run(2 * 1024 * 1024);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /✓ PR #7/);
});

test("버퍼 한도를 넘는 gh 응답은 한국어 오류로 실패하고 통과하지 않는다", () => {
  const result = run(70 * 1024 * 1024);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /출력 버퍼 한도/);
  assert.doesNotMatch(result.stdout, /✓/);
});
