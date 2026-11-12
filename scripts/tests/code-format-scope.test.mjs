import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCommitSha, isFormatTarget, parseGitPaths } from "../_lib/format-scope.mjs";

describe("변경 파일 포맷 검사 범위", () => {
  it("NUL 분리로 공백과 개행이 포함된 Git 파일명을 보존한다", () => {
    assert.deepEqual(parseGitPaths(Buffer.from("src/a b.ts\0src/a\nb.tsx\0")), [
      "src/a b.ts",
      "src/a\nb.tsx",
    ]);
    assert.deepEqual(parseGitPaths(Buffer.alloc(0)), []);
    assert.throws(() => parseGitPaths(Buffer.from("src/a.ts\n")), /NUL/);
  });

  it("소스 확장자만 대상으로 삼고 경로 이탈·lockfile은 거부한다", () => {
    for (const file of ["src/a.ts", "src/a.tsx", "scripts/check.mjs", "src/a.cts", "src/a.jsx"]) {
      assert.equal(isFormatTarget(file), true, file);
    }
    for (const file of [
      "../secrets.ts",
      "/tmp/x.ts",
      "src/../x.ts",
      "src//x.ts",
      "src\\x.ts",
      "package-lock.json",
      "scripts/sql/migration.sql",
    ]) {
      assert.equal(isFormatTarget(file), false, file);
    }
  });

  it("비교할 SHA가 없거나 잘못되면 fail-closed한다", () => {
    assert.equal(isCommitSha("a".repeat(40)), true);
    assert.equal(isCommitSha("a".repeat(64)), true);
    for (const sha of [undefined, "", "0".repeat(39), "z".repeat(40), "HEAD;rm -rf /"]) {
      assert.equal(isCommitSha(sha), false);
    }
  });
});


const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function gitFixture(directory, ...args) {
  const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function makeGitFixture() {
  const directory = mkdtempSync(join(tmpdir(), "hra-format-test-"));
  mkdirSync(join(directory, "scripts/_lib"), { recursive: true });
  mkdirSync(join(directory, "src"), { recursive: true });
  for (const path of [
    "scripts/check-code-format.mjs",
    "scripts/_lib/format-scope.mjs",
    ".prettierrc.json",
    ".prettierignore",
  ]) {
    copyFileSync(join(repositoryRoot, path), join(directory, path));
  }
  // 실행 대상 CLI의 패키지 해석만 원래 npm ci 결과를 사용하고 Git index는 격리합니다.
  symlinkSync(join(repositoryRoot, "node_modules"), join(directory, "node_modules"), "dir");
  writeFileSync(join(directory, "src/example.ts"), "export const n = 0;\n");
  gitFixture(directory, "init", "-q");
  gitFixture(directory, "add", "--", ".prettierrc.json", ".prettierignore", "src/example.ts");
  gitFixture(
    directory,
    "-c",
    "user.name=Format Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-q",
    "-m",
    "fixture",
  );
  return directory;
}

function runStaged(directory) {
  return spawnSync(process.execPath, ["scripts/check-code-format.mjs", "--staged"], {
    cwd: directory,
    encoding: "utf8",
  });
}

describe("실제 Git index와 작업 트리의 포맷 검사", () => {
  it("스테이징 내용이 정상이면 작업 트리의 나쁜 포맷에 영향받지 않는다", () => {
    const directory = makeGitFixture();
    try {
      writeFileSync(join(directory, "src/example.ts"), "export const n = 1;\n");
      gitFixture(directory, "add", "--", "src/example.ts");
      writeFileSync(join(directory, "src/example.ts"), "export  const n=1\n");
      const result = runStaged(directory);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1개 검사/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("스테이징 내용이 잘못되면 작업 트리가 올바르더라도 차단한다", () => {
    const directory = makeGitFixture();
    try {
      writeFileSync(join(directory, "src/example.ts"), "export  const n=1\n");
      gitFixture(directory, "add", "--", "src/example.ts");
      writeFileSync(join(directory, "src/example.ts"), "export const n = 1;\n");
      const result = runStaged(directory);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /포맷 오류/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("미스테이징 ignore 규칙으로 위반 소스를 숨길 수 없다", () => {
    const directory = makeGitFixture();
    try {
      writeFileSync(join(directory, "src/example.ts"), "export  const n=1\n");
      gitFixture(directory, "add", "--", "src/example.ts");
      const ignorePath = join(directory, ".prettierignore");
      writeFileSync(ignorePath, "src/example.ts\n");
      assert.equal(runStaged(directory).status, 1);
      gitFixture(directory, "add", "--", ".prettierignore");
      assert.equal(runStaged(directory).status, 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("무시 대상과 Git 실패를 각각 통과·차단한다", () => {
    const directory = makeGitFixture();
    try {
      mkdirSync(join(directory, "apps/mobile"), { recursive: true });
      writeFileSync(join(directory, "apps/mobile/bad.ts"), "export  const n=1\n");
      gitFixture(directory, "add", "--", "apps/mobile/bad.ts");
      const ignored = runStaged(directory);
      assert.equal(ignored.status, 0, ignored.stderr);
      assert.match(ignored.stdout, /0개 검사/);

      rmSync(join(directory, ".git"), { recursive: true, force: true });
      const failed = runStaged(directory);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /검증에 실패/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
