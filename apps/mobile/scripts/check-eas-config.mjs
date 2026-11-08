/**
 * EAS 설정의 닫힌 검사와 출시에 필요한 공개 환경 입력 검증.
 * 실제 Expo 계정·서명키·시크릿을 조회하지 않고 실패에는 고정 코드만 출력합니다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const appId = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;

export function validateEasConfig(config) {
  const errors = [];
  if (!isObject(config) || !isObject(config.cli) || !isObject(config.build)) return ['EAS_CONFIGURATION_MISSING'];
  if (config.cli.appVersionSource !== 'remote' || config.cli.requireCommit !== true ||
    typeof config.cli.version !== 'string' || !/^>=\d+\.\d+\.\d+$/.test(config.cli.version)) errors.push('EAS_CLI_POLICY');
  if (config.submit !== undefined) errors.push('EAS_AUTOMATIC_SUBMISSION_NOT_APPROVED');
  if (Object.keys(config.build).sort().join(',') !== 'preview,production') errors.push('EAS_PROFILE_SET_INVALID');
  const preview = config.build.preview;
  const production = config.build.production;
  if (!isObject(preview) || preview.environment !== 'preview' || preview.distribution !== 'internal' ||
    !isObject(preview.android) || preview.android.buildType !== 'apk' || preview.autoIncrement === true)
    errors.push('EAS_PREVIEW_PROFILE_INVALID');
  if (!isObject(production) || production.environment !== 'production' || production.distribution !== 'store' ||
    production.autoIncrement !== true || production.autoSubmit === true)
    errors.push('EAS_PRODUCTION_PROFILE_INVALID');
  for (const profile of [preview, production]) {
    if (isObject(profile) && (isObject(profile.env) || profile.channel || profile.credentialsSource))
      errors.push('EAS_INLINE_ENVIRONMENT_NOT_APPROVED');
  }
  return [...new Set(errors)];
}

export function validateEasBuild({ config, profile, platform, variables }) {
  const errors = validateEasConfig(config);
  if (!['preview', 'production'].includes(profile) || !['android', 'ios'].includes(platform))
    return [...errors, 'EAS_BUILD_SELECTION_INVALID'];
  if (!variables || !uuid.test(variables.EXPO_PROJECT_ID || '')) errors.push('EAS_PROJECT_NOT_LINKED');

  const value = variables?.EXPO_PUBLIC_API_BASE_URL;
  let origin;
  try { origin = new URL(value); } catch { /* 거부할 공개 URL의 실제 값을 출력하지 않습니다. */ }
  if (!origin || origin.protocol !== 'https:' || !origin.hostname || origin.username ||
    origin.password || origin.search || origin.hash ||
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(origin.hostname) ||
    origin.hostname.endsWith('.localhost')) errors.push('EAS_HTTPS_API_REQUIRED');

  if (platform === 'android') {
    const identifier = variables.HRA_ANDROID_APPLICATION_ID || '';
    if (!appId.test(identifier) || identifier === 'com.hra.mobile')
      errors.push('EAS_ANDROID_PACKAGE_NOT_APPROVED');
  } else {
    const identifier = variables.HRA_IOS_BUNDLE_IDENTIFIER || '';
    if (!appId.test(identifier) || identifier === 'com.hra.mobile')
      errors.push('EAS_IOS_BUNDLE_NOT_APPROVED');
  }

  if (profile === 'production' && variables.HRA_MOBILE_PRODUCTION_RELEASE_ENABLED !== 'true')
    errors.push('EAS_PRODUCTION_APPROVAL_MISSING');
  return [...new Set(errors)];
}

/**
 * EAS cloud builder에 적용되는 환경 값의 별도 정합성 확인.
 * GitHub-hosted runner의 동일 이름 환경 변수는 workflow가 제거한 채 호출해야 합니다.
 * expected/remote 값 자체를 반환하거나 기록하지 않고 고정 실패 코드만 사용합니다.
 */
export function validateEasRemoteBuild({ config, profile, platform, expected, remote }) {
  const errors = validateEasBuild({ config, profile, platform, variables: remote });
  const required = ['EXPO_PROJECT_ID', 'EXPO_PUBLIC_API_BASE_URL',
    platform === 'android' ? 'HRA_ANDROID_APPLICATION_ID' : 'HRA_IOS_BUNDLE_IDENTIFIER'];
  if (required.some(name => typeof expected?.[name] !== 'string' || !expected[name] ||
      typeof remote?.[name] !== 'string' || remote[name] !== expected[name])) {
    errors.push('EAS_REMOTE_ENVIRONMENT_MISMATCH');
  }
  return [...new Set(errors)];
}

function run() {
  const args = process.argv.slice(2);
  const config = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  let errors;
  if (args.length === 1 && args[0] === '--config') errors = validateEasConfig(config);
  else if (args.length === 3 && args[0] === '--release') {
    errors = validateEasBuild({ config, platform: args[1], profile: args[2], variables: process.env });
  } else if (args.length === 3 && args[0] === '--remote') {
    const expected = Object.fromEntries([
      'EXPO_PROJECT_ID', 'EXPO_PUBLIC_API_BASE_URL',
      'HRA_ANDROID_APPLICATION_ID', 'HRA_IOS_BUNDLE_IDENTIFIER',
    ].map(name => [name, process.env['HRA_EXPECTED_' + name]]));
    errors = validateEasRemoteBuild({
      config, platform: args[1], profile: args[2], expected, remote: process.env,
    });
  } else errors = ['EAS_ARGUMENTS_INVALID'];
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else console.log('EAS_CONFIGURATION_SAFE');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); }
  catch { console.error('EAS_CONFIGURATION_INVALID'); process.exitCode = 1; }
}
