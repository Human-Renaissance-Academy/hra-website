/**
 * 기존 이슈 본문/라벨과 PR 제목/본문을 하나의 실행기에서 검사한다.
 * 기본: 열린 이슈. --pull-requests: 열린 PR. --all: 둘 다(읽기 전용).
 * --event만 이슈 안내 댓글을 갱신한다. API 입력을 셸 문자열에 끼워 넣지 않는다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { validateIssue, validatePullRequest } from "./_lib/process-format.mjs";
import { classifyPullRequest } from "./_lib/release-policy.mjs";

const MARKER = "<!-- process-format-check -->";
const releaseAuthor = process.env.RELEASE_PLEASE_BOT_LOGIN?.trim() || "github-actions[bot]";
// 변경 파일이 수백 개인 PR 의 `--paginate --slurp` 응답은 기본 maxBuffer(1MB)를 넘는다(ENOBUFS).
// 검사기가 파일 이름·상태를 판정하므로 요청을 줄이지 않고 한도를 넉넉히 올린다.
const GH_MAX_BUFFER = 64 * 1024 * 1024;
function gh(args, input) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: GH_MAX_BUFFER, stdio: ["pipe", "pipe", "inherit"] });
  } catch (error) {
    // 출력 초과로 잘린 응답을 통과시키지 않고(fail-closed) 원인을 한국어로 알린다.
    if (error?.code === "ENOBUFS") {
      throw new Error(`gh 응답이 출력 버퍼 한도(${GH_MAX_BUFFER / 1024 / 1024}MB)를 초과하여 검사를 중단합니다.`);
    }
    throw error;
  }
}
function api(path) {
  return JSON.parse(gh(["api", path]));
}
function pages(path) {
  const result = JSON.parse(gh(["api", "--paginate", "--slurp", path]));
  if (!Array.isArray(result) || !result.every(Array.isArray)) throw new Error("페이지 응답 형식이 다릅니다.");
  return result.flat();
}
function repository() {
  return process.env.GITHUB_REPOSITORY || gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
}
function issueErrors(issue) {
  return validateIssue({ title: issue.title, body: issue.body, labels: (issue.labels ?? []).map((label) => label.name) });
}
function report(kind, number, errors) {
  console.log(`${errors.length ? "✗" : "✓"} ${kind} #${number}`);
  for (const error of errors) console.log(`  - ${error}`);
  return errors.length > 0 ? 1 : 0;
}

// PR 작성자·브랜치·파일은 이벤트에 들어온 문자열 대신 현재 GitHub 메타데이터로 확인한다.
function pullRequestErrors(repo, number) {
  const pr = api(`repos/${repo}/pulls/${number}`);
  const files = pages(`repos/${repo}/pulls/${number}/files?per_page=100`);
  const current = api(`repos/${repo}/pulls/${number}`);
  if (current.head.sha !== pr.head.sha || current.changed_files !== pr.changed_files) {
    return ["검사 중 PR head가 변경되었습니다. 최신 실행으로 다시 검사하세요."];
  }
  const result = classifyPullRequest(current, { repository: repo, files, releaseAuthor });
  // 생성형 본문 예외는 제목 검사를 생략하지 않으며 앱 CI의 통과 여부와도 무관하다.
  if (result.kind === "standard") result.errors.push(...validatePullRequest({ body: current.body }));
  else console.log(`생성형 PR 본문 확인: ${result.kind}`);
  return result.errors;
}
function checkAllOpenIssues(repo) {
  const issues = pages(`repos/${repo}/issues?state=open&per_page=100`).filter((issue) => !issue.pull_request);
  let failed = 0;
  for (const issue of issues.sort((a, b) => a.number - b.number)) failed += report("이슈", issue.number, issueErrors(issue));
  console.log(`열린 이슈 ${issues.length}건 중 ${failed}건 위반`);
  return failed;
}
function checkAllOpenPullRequests(repo) {
  const prs = pages(`repos/${repo}/pulls?state=open&per_page=100`);
  let failed = 0;
  for (const pr of prs.sort((a, b) => a.number - b.number)) failed += report("PR", pr.number, pullRequestErrors(repo, pr.number));
  console.log(`열린 PR ${prs.length}건 중 ${failed}건 위반`);
  return failed;
}
function findMarkerComment(repo, number) {
  // 같은 표식을 붙인 사람의 댓글을 봇 댓글로 오인하여 수정하지 않는다.
  const comments = pages(`repos/${repo}/issues/${number}/comments?per_page=100`);
  return comments.find((comment) => comment.user?.login === "github-actions[bot]" &&
    typeof comment.body === "string" && comment.body.includes(MARKER))?.id ?? null;
}
function upsertComment(repo, number, commentId, body) {
  const path = commentId ? `repos/${repo}/issues/comments/${commentId}` : `repos/${repo}/issues/${number}/comments`;
  gh(["api", "-X", commentId ? "PATCH" : "POST", path, "--input", "-"], JSON.stringify({ body }));
}
function checkEvent(repo) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (event.pull_request) return report("PR", event.pull_request.number, pullRequestErrors(repo, event.pull_request.number));
  if (!event.issue || event.issue.pull_request) return 0;
  const issue = api(`repos/${repo}/issues/${event.issue.number}`);
  const errors = issueErrors(issue);
  const id = findMarkerComment(repo, issue.number);
  if (errors.length) {
    upsertComment(repo, issue.number, id, `${MARKER}\n이 이슈는 저장소 형식과 다릅니다. 수정하면 이 댓글이 갱신됩니다.\n\n` +
      errors.map((error) => `- ${error}`).join("\n") +
      "\n\n라벨 권한이 없다면 관리자가 지정합니다. 안내: `docs/contributing/workflow.md`");
  } else if (id) upsertComment(repo, issue.number, id, `${MARKER}\n이슈 형식 확인 통과.`);
  return report("이슈", issue.number, errors);
}

try {
  const repo = repository();
  const args = process.argv.slice(2);
  const allowed = ["--event", "--all", "--pull-requests"];
  if (args.some((arg) => !allowed.includes(arg)) || args.length > 1) throw new Error("인자는 --event, --all, --pull-requests 중 하나만 사용합니다.");
  const failed = args.includes("--event") ? checkEvent(repo) :
    args.includes("--all") ? checkAllOpenIssues(repo) + checkAllOpenPullRequests(repo) :
    args.includes("--pull-requests") ? checkAllOpenPullRequests(repo) : checkAllOpenIssues(repo);
  process.exitCode = failed > 0 ? 1 : 0;
} catch (error) {
  console.error("형식 검사를 완료하지 못했습니다:", error instanceof Error ? error.message : "알 수 없는 오류");
  process.exitCode = 1;
}
