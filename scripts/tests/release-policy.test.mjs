/** 네트워크·npm 의존성 없이 PR 형식과 릴리스 정책을 검증한다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  COMMIT_TYPES, RELEASE_BRANCH, RELEASE_FILES, RELEASE_TITLE_PATTERN,
  validatePullRequestTitle, classifyPullRequest, validateReleaseFiles,
} from "../_lib/release-policy.mjs";

const repository = "yeongseon/hra-website";
const repo = { full_name: repository };
const files = RELEASE_FILES.map((filename) => ({ filename, status: "modified" }));

// 별도 YAML 의존성 없이 현재 workflow의 명시적 권한 블록과 checkout 단계를 검사합니다.
// workflow나 권한을 추가할 때는 아래 허용 목록과 실제 YAML 검증을 함께 검토해야 합니다.
const workflowPermissions = {
  "ci.yml": [{ contents: "read" }],
  "authentication-measurement.yml": [{ contents: "read" }],
  "repository-security.yml": [{ contents: "read" }],
  "expanded-e2e.yml": [{ contents: "read" }],
  "production-smoke.yml": [{ contents: "read" }],
  "mobile.yml": [{ contents: "read" }],
  "mobile-eas-build.yml": [{ contents: "read" }],
  "mobile-server-e2e.yml": [{ contents: "read" }],
  "process-format.yml": [
    { contents: "read" },
    { contents: "read", issues: "write" },
    { contents: "read", "pull-requests": "read" },
    { contents: "read" },
    { contents: "read", issues: "read", "pull-requests": "read" },
  ],
  "release-please.yml": [
    { contents: "read" },
    { contents: "write", issues: "write", "pull-requests": "write" },
  ],
};

/** 이름이 있는 단계의 uses도 동일하게 검사해 가변 태그가 검사를 우회하지 못하게 합니다. */
function assertPinnedActions(workflow) {
  const actions = [...workflow.matchAll(/^\s*(?:- )?uses: ([^\s#]+)/gm)].map((match) => match[1]);
  assert.ok(actions.length > 0);
  for (const action of actions) {
    assert.match(action, /^(?:actions\/(?:checkout|setup-node|upload-artifact)|googleapis\/release-please-action)@[a-f0-9]{40}$/);
  }
}

test("이름이 있는 Action 단계도 고정 SHA만 허용하고 가변 태그·새 저장소를 거부한다", () => {
  // 정상 단계가 함께 있어 Action 목록의 비어 있음 검사만으로는 누락을 발견할 수 없는 사례입니다.
  const namedStep = (reference) => `steps:\n  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n  - name: 노드 준비\n    uses: ${reference}\n`;
  const sha = "49933ea5288caeca8642d1e84afbd3f7d6820020";
  assert.doesNotThrow(() => assertPinnedActions(namedStep(`actions/setup-node@${sha}`)));
  assert.throws(() => assertPinnedActions(namedStep("actions/setup-node@v4")), assert.AssertionError);
  assert.throws(() => assertPinnedActions(namedStep(`unreviewed/setup-node@${sha}`)), assert.AssertionError);
});

test("새 workflow도 Action·권한 정책 검토 대상에 포함한다", () => {
  const names = readdirSync(new URL("../../.github/workflows/", import.meta.url))
    .filter((name) => /\.ya?ml$/.test(name)).sort();
  assert.deepEqual(names, Object.keys(workflowPermissions).sort());
});
for (const [name, expectedPermissions] of Object.entries(workflowPermissions)) {
  const workflow = readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");
  test(`${name}: 기존 신뢰된 Action을 전체 commit SHA로 고정한다`, () => {
    assertPinnedActions(workflow);
    assert.doesNotMatch(workflow, /pull_request_target/);
  });
  test(`${name}: 읽기 기본 권한과 기존 필요한 쓰기 예외만 허용한다`, () => {
    assert.match(workflow, /^permissions:\n  contents: read\n/m);
    const blocks = [...workflow.matchAll(/^( *)permissions:\n((?:\1  [a-z-]+: [a-z]+\n)+)/gm)];
    assert.equal(blocks.length, [...workflow.matchAll(/^\s*permissions:/gm)].length);
    const permissions = blocks.map((match) => Object.fromEntries(match[2].trim().split("\n")
      .map((line) => line.trim().split(": "))));
    assert.deepEqual(permissions, expectedPermissions);
  });
  test(`${name}: checkout 인증을 후속 저장소 명령에 남기지 않는다`, () => {
    const checkouts = [...workflow.matchAll(/^ {6}- uses: actions\/checkout@[^\n]+\n((?:^ {8,}[^\n]*\n)*)/gm)];
    assert.equal(checkouts.length, [...workflow.matchAll(/uses: actions\/checkout@/g)].length);
    for (const checkout of checkouts) assert.match(checkout[1], /^ {10}persist-credentials: false$/m);
  });
}

test("릴리스 workflow는 명시적으로 활성화하고 별도 토큰만 사용한다", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/release-please.yml", import.meta.url), "utf8");
  assert.match(workflow, /vars\.RELEASE_PLEASE_ENABLED == 'true'/);
  assert.match(workflow, /token: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \}\}/);
  assert.match(workflow, /if \[ -z "\$RELEASE_PLEASE_TOKEN" \]; then/);
  assert.doesNotMatch(workflow, /github\.token/);
});
function releasePr() {
  return {
    title: "chore(release): release 0.1.1", body: "release-please generated release notes",
    user: { login: "github-actions[bot]" }, labels: [{ name: "autorelease: pending" }],
    head: { ref: RELEASE_BRANCH, repo }, base: { ref: "main", repo }, changed_files: files.length,
  };
}
function fixture(version = "0.1.0") {
  return {
    config: JSON.parse(readFileSync(new URL("../../release-please-config.json", import.meta.url), "utf8")),
    manifest: { ".": version },
    packageJson: { name: "hra-website", version, private: true },
    lockfile: { name: "hra-website", version, lockfileVersion: 3, packages: { "": { name: "hra-website", version } } },
  };
}

for (const type of COMMIT_TYPES) {
  test(`PR type ${type}: 선택 scope와 ! 허용`, () => {
    for (const title of [`${type}: 한국어 설명`, `${type}(auth): English description`, `${type}(academic/attendance)!: 권한 계약 변경`]) {
      assert.deepEqual(validatePullRequestTitle(title), []);
    }
  });
}
for (const title of [undefined, null, "", "Fix: 대문자", "update: 임의 type", "feat: ", "feat:  두 칸", "feat(): 빈 scope", "feat(Auth): 대문자 scope", "feat : 띄어쓰기", "feat: 앞\nfix: 뒤", " feat: 앞 공백", "feat: 끝 공백 ", "[P1] fix: 제목", "feat: \t공백"]) {
  test(`잘못된 PR 제목 거부: ${JSON.stringify(title)}`, () => assert.ok(validatePullRequestTitle(title).length > 0));
}
test("기존 열린 docs PR은 일반 PR으로 분류하며 제목을 유지한다", () => {
  const pr = { ...releasePr(), title: "docs: 출결 운영 인력 구성·배정 단위·관리 주체 확인 사실 반영", user: { login: "yeongseon" }, labels: [], head: { ref: "docs/academic-class-staffing-20261013", repo } };
  assert.deepEqual(classifyPullRequest(pr, { repository, files }), { kind: "standard", errors: [] });
});
test("검증된 release-please PR만 생성형 본문을 허용한다", () => {
  assert.deepEqual(classifyPullRequest(releasePr(), { repository, files }), { kind: "release-please", errors: [] });
});
const rejectedReleaseCases = {
  "작성자만 다른 PR": (pr) => { pr.user.login = "contributor"; },
  "라벨만 붙인 PR": (pr) => { pr.head.ref = "feature/test"; },
  "fork PR": (pr) => { pr.head.repo = { full_name: "other/hra-website" }; },
  "base repository 불일치": (pr) => { pr.base.repo = { full_name: "other/hra-website" }; },
  "잘못된 base": (pr) => { pr.base.ref = "development"; },
  "비슷한 브랜치": (pr) => { pr.head.ref = `${RELEASE_BRANCH}-fake`; },
  "pending 라벨 없음": (pr) => { pr.labels = []; },
  "empty body": (pr) => { pr.body = " "; },
  "헤드 저장소가 사라짐": (pr) => { pr.head.repo = null; },
  "제목 버전 v 접두어": (pr) => { pr.title = "chore(release): release v0.1.1"; },
  "잘못된 SemVer": (pr) => { pr.title = "chore(release): release 01.2.3"; },
  "파일 수 응답 불일치": (pr) => { pr.changed_files = 5; },
};
for (const [name, change] of Object.entries(rejectedReleaseCases)) {
  test(`릴리스 예외 거부: ${name}`, () => {
    const pr = releasePr(); change(pr);
    const result = classifyPullRequest(pr, { repository, files });
    assert.equal(result.kind, "standard"); assert.ok(result.errors.length > 0);
  });
}
for (const invalidFiles of [
  [], files.slice(0, 3),
  [...files, { filename: "src/lib/auth.ts", status: "modified" }],
  [...files.slice(0, 3), { filename: "package.json", status: "modified" }],
  files.map((file, index) => index === 0 ? { ...file, status: "removed" } : file),
  files.map((file, index) => index === 0 ? { ...file, status: "renamed" } : file),
]) {
  test(`릴리스 범위 외/불완전 파일 거부: ${JSON.stringify(invalidFiles)}`, () => {
    const pr = releasePr(); pr.changed_files = invalidFiles.length;
    assert.ok(classifyPullRequest(pr, { repository, files: invalidFiles }).errors.length > 0);
  });
}
test("커스텀 릴리스 작성자는 명시적 설정 때만 허용한다", () => {
  const pr = releasePr(); pr.user.login = "hra-release[bot]";
  assert.ok(classifyPullRequest(pr, { repository, files }).errors.length > 0);
  assert.equal(classifyPullRequest(pr, { repository, files, releaseAuthor: "hra-release[bot]" }).kind, "release-please");
});
test("봇 이름에 bot이라는 문자열이 있다는 이유로 면제하지 않는다", () => {
  const pr = releasePr(); pr.title = "fix: 수정"; pr.user.login = "arbitrary[bot]"; pr.labels = []; pr.head.ref = "feature/example";
  assert.equal(classifyPullRequest(pr, { repository, files }).kind, "standard");
});
test("Dependabot 본문 예외에도 제목 규칙 적용", () => {
  const pr = releasePr(); pr.title = "chore(deps): 의존성 갱신"; pr.user.login = "dependabot[bot]"; pr.labels = []; pr.head.ref = "dependabot/npm_and_yarn/example";
  assert.deepEqual(classifyPullRequest(pr, { repository, files }), { kind: "dependabot", errors: [] });
  pr.title = "Bump example";
  assert.ok(classifyPullRequest(pr, { repository, files }).errors.length > 0);
  pr.user.login = "github-actions[bot]";
  assert.equal(classifyPullRequest(pr, { repository, files }).kind, "standard");
});
for (const version of ["0.1.0", "0.1.1", "0.2.0", "1.0.0", "10.20.30"]) {
  test(`릴리스 이후에도 버전 정합성 검사 통과: ${version}`, () => assert.deepEqual(validateReleaseFiles(fixture(version)), []));
}
const configFailures = {
  "private 해제": (f) => { f.packageJson.private = false; },
  "manifest 버전 불일치": (f) => { f.manifest["."] = "0.0.0"; },
  "lock 상위 버전 불일치": (f) => { f.lockfile.version = "0.0.0"; },
  "lock 루트 버전 불일치": (f) => { f.lockfile.packages[""].version = "0.0.0"; },
  "manifest 다중 패키지": (f) => { f.manifest.extra = "0.1.0"; },
  "릴리스 type 오타": (f) => { f.config.packages["."]["release-type"] = "simple"; },
  "version-title 어긋남": (f) => { f.config["group-pull-request-title-pattern"] = "chore: release main"; },
  "component 태그": (f) => { f.config["include-component-in-tag"] = true; },
  "분할 release PR": (f) => { f.config["separate-pull-requests"] = true; },
  "강제 버전 잔존": (f) => { f.config.packages["."]["release-as"] = "1.0.0"; },
  "불완전 bootstrap SHA": (f) => { f.config["bootstrap-sha"] = "main"; },
  "changelog type 누락": (f) => { f.config.packages["."]["changelog-sections"].pop(); },
  "문서만으로 릴리스": (f) => { f.config.packages["."]["changelog-sections"].find((s) => s.type === "docs").hidden = false; },
};
for (const [name, change] of Object.entries(configFailures)) {
  test(`릴리스 정합성 오류: ${name}`, () => { const f = fixture(); change(f); assert.ok(validateReleaseFiles(f).length > 0); });
}
test("첫 릴리스 후 bootstrap-sha를 제거할 수 있다", () => {
  const f = fixture("0.2.0"); delete f.config["bootstrap-sha"];
  assert.deepEqual(validateReleaseFiles(f), []);
});
test("릴리스 workflow는 고정 action SHA를 사용하며 자동 병합·npm 배포를 하지 않는다", () => {
  const text = readFileSync(new URL("../../.github/workflows/release-please.yml", import.meta.url), "utf8");
  assert.match(text, /uses: googleapis\/release-please-action@[a-f0-9]{40}/);
  assert.match(text, /cancel-in-progress: false/);
  assert.match(text, /target-branch: main/);
  assert.doesNotMatch(text, /run:.*npm publish|gh pr merge|pull_request_target/);
});
test("PR 메타데이터와 변경된 규칙의 테스트를 구분하고 봇 전체 skip을 제거한다", () => {
  const text = readFileSync(new URL("../../.github/workflows/process-format.yml", import.meta.url), "utf8");
  assert.match(text, /ref: \$\{\{ github.event.pull_request.base.sha \}\}/);
  assert.match(text, /ready_for_review, labeled, unlabeled/);
  assert.match(text, /node --test scripts\/tests\/release-policy.test.mjs/);
  assert.doesNotMatch(text, /user.login != 'dependabot\[bot\]'|pull_request_target/);
});
test("릴리스 제목 상수와 설정의 template 일치", () => {
  assert.equal(fixture().config.packages["."]["pull-request-title-pattern"], RELEASE_TITLE_PATTERN);
});
