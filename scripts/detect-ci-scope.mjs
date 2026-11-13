/**
 * 웹 CI의 읽기 전용 변경 범위 판별 (#281/#284).
 * PR에서 모든 변경이 모바일/기여 문서 영역일 때만 대형 Web/DB 검증을 생략합니다.
 * 모든 경계 오류, 미확인 파일, push/main은 fail-closed로 전체 검사합니다.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{40}$/;

function isIndependentPath(path) {
  // 자동 생성된 환경 계약은 문서 변경만으로도 기존 검사와 어긋날 수 있습니다.
  if (path === "docs/developer/environment-inventory.md") return false;
  if (path.startsWith("docs/")) return /\.(?:md|mdx|png|jpe?g|webp|svg)$/.test(path);
  // 네이티브 앱 소스만 독립적으로 검증합니다. 모바일 워크플로 자체는 보안 경계이므로 Web CI도 유지합니다.
  if (path.startsWith("apps/mobile/")) return true;
  return (
    path.startsWith(".github/ISSUE_TEMPLATE/") ||
    path === ".github/PULL_REQUEST_TEMPLATE.md" ||
    path === "README.md" ||
    path === "AGENTS.md" ||
    path === "mkdocs.yml"
  );
}

function validPath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length < 4096 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path.includes("\n") &&
    !path.includes("\r") &&
    !path.includes("\uFFFD") &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

/** 알 수 없는 파일이나 Git 범위 오류는 절대 생략하지 않습니다. */
export function classifyWebCiPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 1000)
    return { web: true, reason: "unknown-or-empty" };
  if (paths.some((path) => !validPath(path))) return { web: true, reason: "unsafe-path" };
  if (paths.some((path) => !isIndependentPath(path))) return { web: true, reason: "web-or-shared" };
  return { web: false, reason: "mobile-or-docs-only" };
}

/**
 * 변경 없는 main push와 단순 단일 커밋 ref, shallow 오류는 전체 Web CI로 처리합니다.
 * GitHub PR merge ref의 첫 번째 부모가 현재 base이므로 이 부모에서 merge HEAD까지 비교합니다.
 */
export function resolveCiScope({ event, parents, files }) {
  if (event !== "pull_request") return { web: true, reason: "push-or-unknown-event" };
  if (!Array.isArray(parents) || parents.length !== 2 || parents.some((sha) => !SHA.test(sha)))
    return { web: true, reason: "merge-parent-unavailable" };
  return classifyWebCiPaths(files);
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function readPrChanges() {
  const commit = git(["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(/\s+/);
  if (commit.length !== 3 || commit.some((sha) => !SHA.test(sha))) return null;
  const out = git(["diff", "--name-only", "--no-renames", "-z", commit[1], commit[0], "--"]);
  if (out.length > 1024 * 1024 || !out.endsWith("\0")) return null;
  return { parents: commit.slice(1), files: out.slice(0, -1).split("\0") };
}

function run() {
  const [event, outputPath] = process.argv.slice(2);
  if (!outputPath || typeof outputPath !== "string") throw new Error("CI_SCOPE_OUTPUT_MISSING");
  let result = { web: true, reason: "unable-to-read-merge" };
  try {
    const changes = event === "pull_request" ? readPrChanges() : null;
    if (changes) result = resolveCiScope({ event, parents: changes.parents, files: changes.files });
    else if (event !== "pull_request") result = resolveCiScope({ event, parents: [], files: [] });
  } catch {
    // Git 실패 시 전체 웹 CI를 유지하며 신뢰할 수 없는 파일 경로를 출력하지 않습니다.
  }
  appendFileSync(outputPath, "web=" + (result.web ? "true" : "false") + "\n");
  console.log("WEB_CI_SCOPE=" + (result.web ? "full" : "independent") + " REASON=" + result.reason);
  if (!result.web) console.log("Full Web/DB CI skipped for an isolated mobile/documentation PR.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
