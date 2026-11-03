import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateSubject } from "../check-commit-messages.mjs";

// ---- 이력 검사 회귀: 임시 git 저장소로 PR/push 범위를 검증한다 ----
const script = fileURLToPath(new URL("../check-commit-messages.mjs", import.meta.url));

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "commit-check-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  const commit = (subject) => {
    git("commit", "-q", "--allow-empty", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  const run = (...args) => spawnSync("node", [script, ...args], { cwd: dir, encoding: "utf8" });
  return { dir, git, commit, run };
}

test("뒤처진 PR: --pr-history는 merge-base 이후 PR 커밋만 검사해 통과한다", () => {
  const r = makeRepo();
  try {
    r.commit("legacy bad subject");
    r.git("checkout", "-q", "-b", "pr");
    const head = r.commit("feat: PR 커밋");
    r.git("checkout", "-q", "main");
    const base = r.commit("fix: main 새 커밋");
    const result = r.run("--pr-history", base, head);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /검사한 커밋: 1,/);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("뒤처진 PR: 형식 위반 PR 커밋은 계속 실패한다", () => {
  const r = makeRepo();
  try {
    r.commit("legacy bad subject");
    r.git("checkout", "-q", "-b", "pr");
    r.commit("feat: 정상 커밋");
    const head = r.commit("나쁜 제목");
    r.git("checkout", "-q", "main");
    const base = r.commit("fix: main 새 커밋");
    const result = r.run("--pr-history", base, head);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /나쁜 제목/);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("push 강제 업데이트: --history는 전체 이력을 검사해 실패한다", () => {
  const r = makeRepo();
  try {
    r.commit("legacy bad subject");
    r.git("checkout", "-q", "-b", "other");
    const base = r.commit("feat: 이전 HEAD");
    r.git("checkout", "-q", "main");
    const head = r.commit("fix: 새 HEAD");
    const result = r.run("--history", base, head);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /강제 업데이트: 전체 이력 검사/);
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

test("정상 fast-forward: --history와 --pr-history 모두 base..head만 검사한다", () => {
  const r = makeRepo();
  try {
    r.commit("legacy bad subject");
    const base = r.commit("feat: 기준");
    const head = r.commit("fix: 추가");
    for (const mode of ["--history", "--pr-history"]) {
      const result = r.run(mode, base, head);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /검사한 커밋: 1,/);
    }
  } finally { rmSync(r.dir, { recursive: true, force: true }); }
});

for (const message of [
  "feat: 새 페이지 추가",
  "fix(auth): 권한 오류 수정",
  "fix(db)!: 위험한 DB 명령 차단",
  "chore(deps-dev): bump tool",
  "Merge pull request #1 from yeongseon/fix/example",
]) {
  test("허용: " + message, () => assert.equal(validateSubject(message), null));
}
for (const message of [
  "기본 CI 검사 추가", "update stuff", "fix: ", "feat(auth):", "fix(Auth): 수정",
]) {
  test("거부: " + message, () => assert.ok(validateSubject(message)));
}
