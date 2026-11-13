/**
 * 웹 CI 범위 판별과 포맷 게이트 보존을 검증하는 독립 회귀 테스트입니다.
 * 문서·모바일 전용 변경에서도 필수 검사가 남는지 확인합니다.
 */
import { load } from "js-yaml";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { classifyWebCiPaths, resolveCiScope } from "../detect-ci-scope.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const pr = (files) => resolveCiScope({ event: "pull_request", parents: [shaA, shaB], files });

test("모바일만 바꾼 PR은 무거운 Web CI를 생략한다", () => {
  assert.deepEqual(pr(["apps/mobile/app.config.ts", "apps/mobile/tests/auth.test.ts"]), {
    web: false,
    reason: "mobile-or-docs-only",
  });
});

test("문서/기여 안내만 바꾼 PR은 Web CI를 생략한다", () => {
  assert.equal(pr(["README.md", "docs/developer/mobile-app.md", "docs/한글-안내.md"]).web, false);
  assert.equal(pr(["AGENTS.md", "mkdocs.yml", ".github/ISSUE_TEMPLATE/config.yml"]).web, false);
});

test("모바일 workflow 자체의 권한·트리거 변경은 웹 계약/보안 검증도 수행한다", () => {
  assert.equal(
    pr([".github/workflows/mobile.yml", ".github/workflows/mobile-eas-build.yml"]).web,
    true,
  );
});

test("생성 환경변수 계약과 비문서 데이터 파일은 전체 CI를 유지한다", () => {
  assert.equal(pr(["docs/developer/environment-inventory.md"]).web, true);
  assert.equal(pr(["docs/developer/site-route-audit-results.json"]).web, true);
  assert.equal(pr(["docs/scripts/unsafe.mjs"]).web, true);
  assert.equal(pr(["docs/developer/site-route-audit.md"]).web, false);
});

test("Web/공용 API 계약/설정/보안/웹 워크플로 변경은 전체 CI를 계속 실행한다", () => {
  for (const path of [
    "src/app/page.tsx",
    "packages/contracts/openapi.json",
    "scripts/verify-production-smoke.mjs",
    ".github/workflows/ci.yml",
    ".github/workflows/repository-security.yml",
    ".github/workflows/production-smoke.yml",
    ".env.example",
    "package.json",
    "package-lock.json",
    "vercel.json",
    "tests/unit/something.test.ts",
    "content/lessons.md",
  ]) {
    assert.deepEqual(pr(["apps/mobile/app.config.ts", path]), {
      web: true,
      reason: "web-or-shared",
    });
  }
});

test("교차 변경과 알 수 없는 새 파일은 절대 생략하지 않는다", () => {
  assert.equal(pr(["docs/readme.md", "src/lib/db/schema.ts"]).web, true);
  assert.equal(pr(["new-package/file.ts"]).web, true);
  assert.equal(pr([".github/workflows/new.yml"]).web, true);
});

test("빈 변경, 너무 많은 파일, 잘못된 경로는 fail closed", () => {
  assert.equal(pr([]).web, true);
  assert.equal(classifyWebCiPaths(new Array(1001).fill("docs/a.md")).web, true);
  for (const path of [
    "",
    "/docs/a",
    "docs/../src/x.ts",
    "docs//foo.md",
    "docs/a\nb.md",
    "docs/a\rb.md",
    "apps\\mobile\\file.ts",
    "docs/\uFFFD.md",
  ]) {
    assert.equal(pr([path]).web, true, path);
  }
});

test("push/main, 잘못된 merge 부모, pull_request가 아닌 이벤트는 무조건 전체 CI", () => {
  assert.deepEqual(resolveCiScope({ event: "push", parents: [shaA, shaB], files: ["README.md"] }), {
    web: true,
    reason: "push-or-unknown-event",
  });
  assert.equal(
    resolveCiScope({ event: "workflow_dispatch", parents: [shaA, shaB], files: ["README.md"] }).web,
    true,
  );
  for (const parents of [[], [shaA], [shaA, "bad"], [shaA, shaB, shaA]]) {
    assert.equal(
      resolveCiScope({ event: "pull_request", parents, files: ["README.md"] }).web,
      true,
    );
  }
});

test("Git 범위를 모를 때 CLI는 전체 Web CI를 요청하고 비밀/경로를 출력하지 않는다", () => {
  const temp = mkdtempSync(join(tmpdir(), "hra-ci-scope-"));
  try {
    const output = join(temp, "github-output");
    const cli = new URL("../detect-ci-scope.mjs", import.meta.url);
    const result = spawnSync(process.execPath, [cli.pathname, "pull_request", output], {
      cwd: temp,
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
    assert.equal(readFileSync(output, "utf8"), "web=true\n");
    assert.match(result.stdout, /WEB_CI_SCOPE=full/);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes(temp), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

// 전체 웹 CI를 생략해도 포맷 계약과 실제 변경 소스 검사는 범위 판별에 선행해야 합니다.
test("독립 PR에서도 포맷 게이트를 실행하고 실패 시 전체 CI로 복귀한다", () => {
  const workflow = load(
    readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.scope.steps;
  assert.equal(steps[0].with["fetch-depth"], 0);
  assert.equal(steps[0].with["persist-credentials"], false);
  const formatIndex = steps.findIndex((step) => step.run?.includes("npm run format:check"));
  const detectIndex = steps.findIndex((step) => step.id === "detect");
  assert.ok(formatIndex >= 0 && formatIndex < detectIndex);
  assert.match(steps[formatIndex].run, /node --test scripts\/tests\/code-format-scope.test.mjs/);
  assert.equal(steps[formatIndex]["continue-on-error"], undefined);
  assert.equal(steps[formatIndex].if, undefined);
  assert.ok(steps.slice(0, formatIndex).some((step) => step.run === "npm ci"));
  assert.match(workflow.jobs.ci.if, /always\(\)/);
  assert.match(workflow.jobs.ci.if, /needs.scope.result != 'success'/);
  assert.ok(workflow.jobs.ci.steps.some((step) => step.run?.includes("npm run format:check")));
});
