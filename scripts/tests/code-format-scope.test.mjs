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
