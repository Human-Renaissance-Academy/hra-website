import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  validateEasConfig,
  validateEasBuild,
  validateEasRemoteBuild,
} from "../check-eas-config.mjs";

const config = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8"));
const inputs = Object.freeze({
  EXPO_PROJECT_ID: "123e4567-e89b-42d3-a456-426614174000",
  EXPO_PUBLIC_API_BASE_URL: "https://api.testing.invalid",
  HRA_ANDROID_APPLICATION_ID: "org.hra.testapp",
  HRA_IOS_BUNDLE_IDENTIFIER: "org.hra.testapp",
  HRA_MOBILE_PRODUCTION_RELEASE_ENABLED: "true",
});
const evaluate = (overrides = {}, platform = "android", profile = "preview") =>
  validateEasBuild({ config, platform, profile, variables: { ...inputs, ...overrides } });

test("Preview/Production을 분리하고 자동 제출 없는 버전 관리 계약", () => {
  assert.deepEqual(validateEasConfig(config), []);
  assert.equal(config.build.preview.distribution, "internal");
  assert.equal(config.build.production.distribution, "store");
  assert.equal(config.build.production.autoIncrement, true);
  assert.equal(config.cli.appVersionSource, "remote");
});
test("계정 승인 없는 임의 릴리스 프로필·자동 제출·inline 환경값은 거부", () => {
  const extra = structuredClone(config);
  extra.build.staging = { distribution: "store" };
  assert.ok(validateEasConfig(extra).includes("EAS_PROFILE_SET_INVALID"));
  const submission = structuredClone(config);
  submission.submit = { production: {} };
  assert.ok(validateEasConfig(submission).includes("EAS_AUTOMATIC_SUBMISSION_NOT_APPROVED"));
  const secrets = structuredClone(config);
  secrets.build.production.env = { EXPO_TOKEN: "synthetic-token" };
  assert.ok(validateEasConfig(secrets).includes("EAS_INLINE_ENVIRONMENT_NOT_APPROVED"));
});
test("원격 버전 자동 증가·clean Git 강제를 약화시키지 않는다", () => {
  const clone = structuredClone(config);
  clone.cli.appVersionSource = "local";
  clone.cli.requireCommit = false;
  clone.build.production.autoIncrement = false;
  assert.deepEqual(validateEasConfig(clone).sort(), [
    "EAS_CLI_POLICY",
    "EAS_PRODUCTION_PROFILE_INVALID",
  ]);
});
test("승인된 Preview Android 설정만 허용", () => {
  assert.deepEqual(evaluate(), []);
});
test("EAS 프로젝트 UUID 미설정·손상은 출시 불가", () => {
  for (const value of ["", "not-linked", "123e4567-e89b-42d3-a456-426614174000?"]) {
    assert.ok(evaluate({ EXPO_PROJECT_ID: value }).includes("EAS_PROJECT_NOT_LINKED"));
  }
});
test("API 기준 URL이 누락·평문·인증정보·쿼리·로컬호스트인 경우 거부", () => {
  for (const value of [
    "",
    "http://api.testing.invalid",
    "https://user:pass@api.testing.invalid",
    "https://api.testing.invalid/?token=secret",
    "https://localhost",
    "ftp://api.testing.invalid",
  ]) {
    assert.ok(evaluate({ EXPO_PUBLIC_API_BASE_URL: value }).includes("EAS_HTTPS_API_REQUIRED"));
  }
});
test("Android 초기 임시 패키지명과 임의 식별자는 차단", () => {
  for (const value of ["", "com.hra.mobile", "ORG.HRA.App", "com.invalid"]) {
    assert.ok(
      evaluate({ HRA_ANDROID_APPLICATION_ID: value }).includes("EAS_ANDROID_PACKAGE_NOT_APPROVED"),
    );
  }
});
test("iOS 식별자를 Android와 독립 확인", () => {
  assert.deepEqual(evaluate({}, "ios"), []);
  assert.ok(
    evaluate({ HRA_IOS_BUNDLE_IDENTIFIER: "" }, "ios").includes("EAS_IOS_BUNDLE_NOT_APPROVED"),
  );
  assert.ok(
    evaluate({ HRA_IOS_BUNDLE_IDENTIFIER: "com.hra.mobile" }, "ios").includes(
      "EAS_IOS_BUNDLE_NOT_APPROVED",
    ),
  );
});
test("Production 빌드는 별도 승인 게이트가 필요하며 Preview는 영향이 없다", () => {
  assert.ok(
    evaluate({ HRA_MOBILE_PRODUCTION_RELEASE_ENABLED: "" }, "android", "production").includes(
      "EAS_PRODUCTION_APPROVAL_MISSING",
    ),
  );
  assert.deepEqual(evaluate({ HRA_MOBILE_PRODUCTION_RELEASE_ENABLED: "" }), []);
  assert.deepEqual(evaluate({}, "android", "production"), []);
});
test("선택지 변경과 미상 빌드는 거부", () => {
  assert.ok(evaluate({}, "all", "production").includes("EAS_BUILD_SELECTION_INVALID"));
  assert.ok(evaluate({}, "android", "other").includes("EAS_BUILD_SELECTION_INVALID"));
});
test("CLI 환경 입력 실패는 비밀값이나 URL을 출력하지 않는다", () => {
  const env = {
    PATH: process.env.PATH,
    EXPO_PUBLIC_API_BASE_URL: "https://user:secret@private.invalid/?token=secret",
  };
  const out = spawnSync(
    process.execPath,
    ["scripts/check-eas-config.mjs", "--release", "android", "production"],
    {
      cwd: new URL("../../", import.meta.url),
      env,
      encoding: "utf8",
    },
  );
  assert.equal(out.status, 1);
  assert.equal(out.stdout, "");
  assert.match(out.stderr, /EAS_PROJECT_NOT_LINKED/);
  assert.equal(out.stderr.includes("private.invalid"), false);
  assert.equal(out.stderr.includes("secret"), false);
});

test("GitHub 보호 환경과 Expo 클라우드 환경 값이 모두 일치해야 원격 빌드 허용", () => {
  assert.deepEqual(
    validateEasRemoteBuild({
      config,
      platform: "android",
      profile: "preview",
      expected: inputs,
      remote: { ...inputs },
    }),
    [],
  );
  assert.deepEqual(
    validateEasRemoteBuild({
      config,
      platform: "ios",
      profile: "production",
      expected: inputs,
      remote: { ...inputs },
    }),
    [],
  );
});

test("Expo 환경의 API origin, 프로젝트 UUID, 플랫폼 식별자 차이는 고정 오류 코드만 반환", () => {
  for (const field of [
    "EXPO_PUBLIC_API_BASE_URL",
    "EXPO_PROJECT_ID",
    "HRA_ANDROID_APPLICATION_ID",
  ]) {
    const remote = {
      ...inputs,
      [field]:
        field === "EXPO_PUBLIC_API_BASE_URL"
          ? "https://different.invalid"
          : field === "EXPO_PROJECT_ID"
            ? "223e4567-e89b-42d3-a456-426614174000"
            : "org.other.app",
    };
    const failures = validateEasRemoteBuild({
      config,
      platform: "android",
      profile: "production",
      expected: inputs,
      remote,
    });
    assert.ok(failures.includes("EAS_REMOTE_ENVIRONMENT_MISMATCH"), field);
    assert.equal(JSON.stringify(failures).includes("different.invalid"), false);
    assert.equal(JSON.stringify(failures).includes("org.other.app"), false);
  }
});

test("GitHub 환경이 남아 있거나 Expo 빌더에 선택 플랫폼 필드가 없다면 원격 검증 차단", () => {
  const missing = { ...inputs };
  delete missing.EXPO_PUBLIC_API_BASE_URL;
  assert.ok(
    validateEasRemoteBuild({
      config,
      platform: "ios",
      profile: "preview",
      expected: inputs,
      remote: missing,
    }).includes("EAS_REMOTE_ENVIRONMENT_MISMATCH"),
  );
  assert.ok(
    validateEasRemoteBuild({
      config,
      platform: "android",
      profile: "preview",
      expected: { ...inputs, EXPO_PROJECT_ID: "" },
      remote: inputs,
    }).includes("EAS_REMOTE_ENVIRONMENT_MISMATCH"),
  );
});

test("EAS --remote CLI 오류는 원격 URL·토큰을 출력하지 않고 실패 코드만 남긴다", () => {
  const env = {
    PATH: process.env.PATH,
    HRA_EAS_PROFILE: "preview",
    HRA_EXPECTED_EXPO_PROJECT_ID: inputs.EXPO_PROJECT_ID,
    HRA_EXPECTED_EXPO_PUBLIC_API_BASE_URL: inputs.EXPO_PUBLIC_API_BASE_URL,
    HRA_EXPECTED_HRA_ANDROID_APPLICATION_ID: inputs.HRA_ANDROID_APPLICATION_ID,
    EXPO_PUBLIC_API_BASE_URL: "https://api.remote-sensitive.invalid",
  };
  const out = spawnSync(
    process.execPath,
    ["scripts/check-eas-config.mjs", "--remote", "android", "preview"],
    {
      cwd: new URL("../../", import.meta.url),
      env,
      encoding: "utf8",
    },
  );
  assert.equal(out.status, 1);
  assert.match(out.stderr, /EAS_REMOTE_ENVIRONMENT_MISMATCH/);
  assert.equal(out.stderr.includes("remote-sensitive.invalid"), false);
  assert.equal(out.stderr.includes(inputs.EXPO_PROJECT_ID), false);
});

test("수동 빌드 workflow는 main, environment 보호, 검증 후 EAS 실행만 허용", () => {
  const workflow = readFileSync(
    new URL("../../../../.github/workflows/mobile-eas-build.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s{2}(?:pull_request|push|schedule):/m);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: mobile-\$\{\{ inputs\.profile \}\}/);
  assert.match(workflow, /EXPO_TOKEN: \$\{\{ secrets\.EXPO_TOKEN \}\}/);
  // npm ci / lint / test에는 액세스 토큰이 유출되지 않도록 실제 빌드 단계의 env로만 한정합니다.
  const buildStep = workflow.indexOf("- name: EAS 빌드 실행");
  const tokenEntry = workflow.indexOf("EXPO_TOKEN: ");
  assert.ok(buildStep > 0 && tokenEntry > buildStep);
  assert.equal(workflow.slice(0, buildStep).includes("EXPO_TOKEN:"), false);
  assert.match(
    workflow,
    /HRA_MOBILE_PRODUCTION_RELEASE_ENABLED: \$\{\{ vars\.HRA_MOBILE_PRODUCTION_RELEASE_ENABLED \}\}/,
  );
  assert.match(workflow, /node scripts\/check-eas-config\.mjs --release/);
  assert.match(workflow, /npm run api:check/);
  assert.match(workflow, /npm run doctor/);
  assert.match(
    workflow,
    /eas env:exec "\$HRA_EAS_PROFILE" "node scripts\/check-eas-config\.mjs --remote/,
  );
  assert.match(
    workflow,
    /unset EXPO_PUBLIC_API_BASE_URL HRA_ANDROID_APPLICATION_ID HRA_IOS_BUNDLE_IDENTIFIER/,
  );
  assert.match(workflow, /HRA_EXPECTED_EXPO_PUBLIC_API_BASE_URL/);
  assert.match(workflow, /EXPO_PROJECT_ID는 CLI가 원격 환경을 조회할 프로젝트/);
  assert.ok(workflow.indexOf("eas env:exec") < workflow.indexOf("eas build --non-interactive"));
  assert.match(workflow, /eas build --non-interactive/);
  assert.doesNotMatch(workflow, /--auto-submit|eas submit|eas update/);
  assert.match(workflow, /cancel-in-progress: false/);
});
