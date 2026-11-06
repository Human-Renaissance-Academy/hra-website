/** audit 네트워크/형식 실패와 새 advisory·설치 경로·만료·P1의 차단을 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dependencyDiagnosticLines, dependencySnapshot, lockRegistryViolations, verifyDependencyPolicy } from '../_lib/dependency-policy.mjs';
const policy = JSON.parse(readFileSync(new URL('../../security/dependency-triage.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
// 실제 원장의 독립 nodes/via 집합으로 npm 응답을 복원한다. 공격 조건 설명은 응답 metadata와 분리한다.
const audit = { auditReportVersion: 2, vulnerabilities: Object.fromEntries(policy.packages.map(pkg => [pkg.name, { name: pkg.name, severity: pkg.severity, range: pkg.range, nodes: pkg.nodes.map(node => node.path), via: pkg.via.map(v => v.source ? { ...v, url: 'https://github.com/advisories/' + v.id } : v.dependency) }])) };
test('현재 정확한 집합은 package 수와 advisory 수를 구분한다', () => { assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-05'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 }); });
for (const [name, change] of [
  ['새 advisory', a => a.vulnerabilities.esbuild.via[0].source++],
  ['영향 범위 변경', a => a.vulnerabilities.esbuild.via[0].range += ' || 99.0.0'],
  ['심각도 변경', a => a.vulnerabilities.esbuild.severity = 'critical'],
  ['설치 경로 누락', a => a.vulnerabilities.esbuild.nodes.pop()],
  ['패키지 누락', a => delete a.vulnerabilities.esbuild],
  ['통신 오류 응답', a => a.error = { code: 'ENETWORK', summary: 'sensitive sentinel' }],
  ['잘못된 via', a => a.vulnerabilities.esbuild.via = [null]],
]) test(name + ' 차단', () => { const input = structuredClone(audit); change(input); assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-05'), /DEPENDENCY_/); });
for (const [name, change] of [
  ['미분류', p => p.assessments.pop()], ['P1', p => p.assessments[0].priority = 'P1'],
  ['owner 누락', p => p.assessments[0].owner = ''], ['설명 누락', p => p.assessments[0].assessment = ''],
  ['중복 검토', p => p.assessments[0] = p.assessments[1]],
]) test(name + ' 원장 차단', () => { const input = structuredClone(policy); change(input); assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-05'), /DEPENDENCY_/); });
// 가장 이른 재검토 기한(2026-11-26) 다음 날부터는 실제 원장 전체가 만료로 차단된다.
test('검토 기한 만료 차단', () => assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-27'), /DEPENDENCY_TRIAGE_INVALID/));
test('lock 설치 버전 변경 차단', () => { const input = structuredClone(lock); input.packages['node_modules/@esbuild-kit/core-utils/node_modules/esbuild'].version = '99.0.0'; assert.throws(() => verifyDependencyPolicy(audit, input, policy, '2026-11-05'), /DEPENDENCY_TRIAGE_CHANGED/); });
test('깨진 audit는 정상 0건이 아니다', () => { for (const input of [null, {}, { auditReportVersion: 2, vulnerabilities: [] }]) assert.throws(() => dependencySnapshot(input, lock), /DEPENDENCY_REPORT_INVALID/); });

// 감사 응답의 제목·영향 범위는 원문에 민감한 문자열이 섞일 수 있으므로 진단에는 식별자만 남긴다.
function capturePolicyError(inputAudit, inputLock = lock) {
  try { verifyDependencyPolicy(inputAudit, inputLock, policy, '2026-11-05'); }
  catch (error) { return error; }
  assert.fail('변경된 감사 결과가 차단되지 않았다');
}

test('신규 권고는 패키지·권고 ID·source로만 진단하며 차단한다', () => {
  const input = structuredClone(audit);
  input.vulnerabilities.esbuild.via.push({ source: 999999, url: 'https://github.com/advisories/GHSA-test-1234', severity: 'high', range: '<99', title: 'SENSITIVE_SENTINEL' });
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{ kind: 'ADVISORY_ONLY_IN_AUDIT', package: 'esbuild', id: 'GHSA-test-1234', source: 999999 }]);
  assert.doesNotMatch(JSON.stringify(error.diagnostics), /SENSITIVE_SENTINEL|<99/);
  assert.deepEqual(dependencyDiagnosticLines(error), [
    'DEPENDENCY_TRIAGE_CHANGED',
    'DEPENDENCY_CHANGE {"kind":"ADVISORY_ONLY_IN_AUDIT","package":"esbuild","id":"GHSA-test-1234","source":999999}',
  ]);
});

// 현재 원장의 패키지는 권고가 하나뿐이므로, 원장에만 권고를 하나 더 둬 audit에서 사라진 권고를 재현한다.
test('권고 제거는 철회로 단정하지 않고 원장에만 남은 ID를 진단한다', () => {
  const input = structuredClone(policy);
  const removed = { source: 999997, id: 'GHSA-test-5678', severity: 'moderate', range: '<99', title: 'SENSITIVE_SENTINEL' };
  input.packages.find(item => item.name === 'esbuild').via.push(removed);
  let error;
  try { verifyDependencyPolicy(audit, lock, input, '2026-11-05'); }
  catch (caught) { error = caught; }
  assert.equal(error?.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{ kind: 'ADVISORY_ONLY_IN_POLICY', package: 'esbuild', id: removed.id, source: removed.source }]);
});

test('권고 메타데이터와 설치 버전 변경은 원문 없이 위치만 진단한다', () => {
  const input = structuredClone(audit);
  input.vulnerabilities.esbuild.via[0].title = 'SENSITIVE_SENTINEL';
  const changedAdvisory = capturePolicyError(input);
  assert.deepEqual(changedAdvisory.diagnostics, [{ kind: 'ADVISORY_METADATA_CHANGED', package: 'esbuild', id: input.vulnerabilities.esbuild.via[0].id, source: input.vulnerabilities.esbuild.via[0].source }]);
  assert.doesNotMatch(JSON.stringify(changedAdvisory.diagnostics), /SENSITIVE_SENTINEL/);
  const changedLock = structuredClone(lock);
  changedLock.packages['node_modules/@esbuild-kit/core-utils/node_modules/esbuild'].version = '99.0.0';
  const changedNode = capturePolicyError(audit, changedLock);
  assert.deepEqual(changedNode.diagnostics, [{ kind: 'NODE_METADATA_CHANGED', package: 'esbuild', path: 'node_modules/@esbuild-kit/core-utils/node_modules/esbuild' }]);
  assert.doesNotMatch(JSON.stringify(changedNode.diagnostics), /99\.0\.0/);
});

test('새 설치 경로는 경로만 진단하고 실제 lock 일치 검사를 유지한다', () => {
  const input = structuredClone(audit);
  const inputLock = structuredClone(lock);
  input.vulnerabilities.esbuild.nodes.push('node_modules/fixture-esbuild');
  inputLock.packages['node_modules/fixture-esbuild'] = { version: '99.0.0', dev: true };
  const error = capturePolicyError(input, inputLock);
  assert.deepEqual(error.diagnostics, [{ kind: 'NODE_ONLY_IN_AUDIT', package: 'esbuild', path: 'node_modules/fixture-esbuild' }]);
  assert.doesNotMatch(JSON.stringify(error.diagnostics), /99\.0\.0/);
  assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-05'), /DEPENDENCY_LOCK_MISMATCH/);
});

test('변경이 20건을 넘으면 생략 건수를 남기면서 차단한다', () => {
  const input = structuredClone(audit);
  for (let index = 0; index < 21; index++) input.vulnerabilities.esbuild.via.push({
    source: 900000 + index,
    url: `https://github.com/advisories/GHSA-extra-${index}`,
    severity: 'high', range: '<99', title: 'SENSITIVE_SENTINEL',
  });
  const error = capturePolicyError(input);
  assert.equal(error.diagnostics.length, 21);
  assert.deepEqual(error.diagnostics.at(-1), { kind: 'MORE_CHANGES', count: 1 });
  assert.doesNotMatch(dependencyDiagnosticLines(error).join('\n'), /SENSITIVE_SENTINEL|<99/);
});

test('오류 감사 보고서는 원문이나 진단을 내보내지 않고 차단한다', () => {
  const input = structuredClone(audit);
  input.error = { summary: 'SENSITIVE_SENTINEL' };
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_REPORT_INVALID');
  assert.equal(error.diagnostics, undefined);
  assert.doesNotMatch(String(error), /SENSITIVE_SENTINEL/);
  assert.deepEqual(dependencyDiagnosticLines(error), ['DEPENDENCY_REPORT_INVALID']);
  assert.deepEqual(dependencyDiagnosticLines(new Error('SENSITIVE_SENTINEL')), ['DEPENDENCY_CHECK_FAILED']);
});

test('손상된 원장은 원문 없이 실패 차단한다', () => {
  const input = structuredClone(policy);
  input.packages[0].via = [null];
  let error;
  try { verifyDependencyPolicy(audit, lock, input, '2026-11-05'); }
  catch (caught) { error = caught; }
  assert.equal(error?.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(dependencyDiagnosticLines(error), ['DEPENDENCY_TRIAGE_CHANGED']);
});

test('v2 원장은 26개 권고별 판단과 4개 공유 사용 맥락을 유지한다', () => {
  assert.equal(policy.schemaVersion, 2);
  assert.equal(policy.assessments.length, 26);
  assert.equal(policy.contexts.length, 4);
  assert.equal(new Set(policy.assessments.map(item => item.contextId)).size, 4);
  assert.deepEqual(policy.contexts.map(context => policy.assessments.filter(item => item.contextId === context.id).length).sort((a, b) => a - b), [3, 4, 4, 15]);
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-05'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 });
});

for (const [name, change] of [
  ['공유 맥락 누락', p => p.contexts.pop()],
  ['공유 맥락 ID 중복', p => p.contexts[1].id = p.contexts[0].id],
  ['공유 판단문 중복', p => { for (const field of ['usedApi', 'callLocations', 'assessment', 'residualAssumptions']) p.contexts[1][field] = p.contexts[0][field]; }],
  ['미사용 공유 맥락', p => p.contexts.push({ ...p.contexts[0], id: 'unused-context' })],
  ['잘못된 공유 맥락 ID', p => p.contexts[0].id = 'private@example.invalid'],
  ['공유 판단문 누락', p => p.contexts[0].assessment = ''],
  ['없는 공유 맥락 참조', p => p.assessments[0].contextId = 'missing-context'],
  ['권고별 항목 손상', p => p.assessments[0] = null],
  ['권고별 공격 조건 누락', p => p.assessments[0].attackCondition = ''],
  ['예전 중복 필드 재도입', p => p.assessments[0].usedApi = 'SENSITIVE_SENTINEL'],
]) test(name + ' 차단', () => {
  const input = structuredClone(policy);
  change(input);
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-05'), /DEPENDENCY_/);
});

test('구 schema v1은 새 검토 원장으로 자동 승인하지 않는다', () => {
  const input = structuredClone(policy);
  input.schemaVersion = 1;
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-05'), /DEPENDENCY_TRIAGE_CHANGED/);
});

test('동일 GHSA의 다른 source ID는 각각 진단하고 차단한다', () => {
  const input = structuredClone(audit);
  const duplicate = { ...input.vulnerabilities.esbuild.via[0], source: 999998 };
  input.vulnerabilities.esbuild.via.push(duplicate);
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{
    kind: 'ADVISORY_ONLY_IN_AUDIT', package: 'esbuild', id: duplicate.id, source: 999998,
  }]);
  assert.doesNotMatch(dependencyDiagnosticLines(error).join('\n'), /title|range|version/);
});

// 수정 버전으로 대체한 YAML의 임시 예외는 다시 나타나지 않습니다. shadcn CLI 평가는 2026-11-04(UTC) 재검토에서
// 공식 패치가 여전히 없지만 shadcn을 devDependencies로 옮겨 dev=true 개발 도구 경로가 됐으므로 4주 주기(2026-12-02)를 따릅니다.
test('패치된 YAML 설치본은 임시 평가·공유 맥락 없이 확인한다', () => {
  assert.equal(policy.packages.some(item => item.name === 'js-yaml'), false);
  assert.deepEqual(policy.assessments.filter(item => item.key.startsWith('js-yaml:')), []);
  assert.deepEqual(policy.contexts.filter(item => ['yaml-parser-cli', 'yaml-omap'].includes(item.id)), []);
  const cliAssessments = policy.assessments.filter(item => item.contextId === 'shadcn-registry-cli');
  assert.equal(cliAssessments.length, 4);
  assert.ok(cliAssessments.every(item => item.reviewedOn === '2026-11-04' && item.reviewBy === '2026-12-02'));
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-05'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 });
});

// 2026-11-04(KST) 재검토: lock 범위 안 수정본으로 해소한 권고는 원장에서 제거하고, 남은 평가는 일괄 연장 없이
// 사용면 위험에 따라 기한을 다르게 둡니다. reviewedOn은 게이트 기준 시계인 UTC 날짜(2026-11-03)입니다.
test('수정본으로 해소한 권고는 제거하고 남은 평가는 위험별 기한을 둔다', () => {
  for (const name of ['brace-expansion', 'source-map-js', 'vite']) assert.equal(policy.packages.some(item => item.name === name), false);
  assert.deepEqual(policy.assessments.filter(item => /^(brace-expansion|source-map-js|vite):/.test(item.key) || item.key === 'esbuild:1120680'), []);
  assert.deepEqual(policy.contexts.filter(item => ['tooling-brace-expansion', 'vitest-vite'].includes(item.id)), []);
  // 2026-11-04(UTC)에 다시 검토한 shadcn CLI 평가와 2026-11-05(UTC) 권고 범위 정정 후 다시 검토한
  // tooling-minimatch-glob 평가만 검토일이 바뀌고, 나머지는 2026-11-03 검토일을 유지한다.
  const reviewedOn = { 'shadcn-registry-cli': '2026-11-04', 'tooling-minimatch-glob': '2026-11-05' };
  assert.ok(policy.assessments.every(item => item.reviewedOn === (reviewedOn[item.contextId] ?? '2026-11-03')));
  // dev=false이거나 수정본이 있는데 적용되지 못한 사용면은 2주, dev=false CLI DoS는 3주, 개발 도구 전용은 4주다.
  // shadcn-registry-cli는 dev=true가 되어 검토일(2026-11-04)부터 4주를 넘지 않는 2026-12-02다.
  const deadlines = { 'shadcn-registry-cli': '2026-12-02', 'shadcn-ts-morph-glob': '2026-11-26', 'build-esbuild': '2026-12-03', 'tooling-minimatch-glob': '2026-12-03' };
  assert.deepEqual(Object.keys(deadlines).sort(), policy.contexts.map(item => item.id).sort());
  assert.ok(policy.assessments.every(item => item.reviewBy === deadlines[item.contextId]));
  // 기존 기한 다음 날(2026-11-06)에도 통과하고, 가장 이른 기한 다음 날부터는 다시 차단한다.
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-06'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 });
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-26'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 });
  assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-27'), /DEPENDENCY_TRIAGE_INVALID/);
});

// 2026-11-04(UTC) 재검토: @tailwindcss/typography 0.5.20이 6.0.10으로 정확히 고정한 postcss-selector-parser를
// 범위 지정 overrides로 수정본 6.1.5에 올려 GHSA-rj75-hqrm-r3gf 평가 2건과 build-css-source-map 맥락을 제거한다.
test('typography의 postcss-selector-parser는 수정본으로 고정하고 해소된 평가를 남기지 않는다', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.deepEqual(manifest.overrides, { '@tailwindcss/typography': { 'postcss-selector-parser': '^6.1.5' } });
  assert.equal(lock.packages['node_modules/@tailwindcss/typography'].dependencies['postcss-selector-parser'], '6.0.10');
  assert.equal(lock.packages['node_modules/postcss-selector-parser'].version, '6.1.5');
  for (const name of ['postcss-selector-parser', '@tailwindcss/typography']) assert.equal(policy.packages.some(item => item.name === name), false);
  assert.deepEqual(policy.assessments.filter(item => /^(postcss-selector-parser|@tailwindcss\/typography):/.test(item.key)), []);
  assert.deepEqual(policy.contexts.filter(item => item.id === 'build-css-source-map'), []);
});

// shadcn-registry-cli의 4주 기한은 shadcn이 devDependencies이고 deepmerge 경로가 dev=true라는 전제에만 기댄다.
// shadcn을 dependencies로 되돌리면 이 테스트와 audit 스냅샷(development)이 함께 실패해 재분류를 강제한다.
test('shadcn CLI 경로는 개발 의존성으로만 설치되어 개발 도구 기한을 따른다', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(manifest.dependencies.shadcn, undefined);
  assert.equal(manifest.devDependencies.shadcn, '^4.22.1');
  for (const path of ['node_modules/shadcn', 'node_modules/@shadcn/registry', 'node_modules/deepmerge']) assert.equal(lock.packages[path].dev, true);
  assert.deepEqual(policy.packages.find(item => item.name === 'deepmerge').nodes.map(node => node.development), [true]);
  assert.ok(policy.assessments.filter(item => item.contextId === 'shadcn-registry-cli').every(item => item.reviewBy <= '2026-12-02'));
});

// minimatch 권고는 CLI dev=false 경로와 개발 도구 경로를 계속 분리해 서로 다른 기한으로 재검토합니다.
// 2026-11-04(UTC) 권고 범위가 >=7.0.0 <11.0.1로 정정되어 루트 minimatch 3.1.5의 ESLint 경로는 audit에서 빠졌습니다.
test('minimatch 권고는 사용면을 분리해 위험별 기한으로 재검토한다', () => {
  assert.equal(policy.assessments.filter(item => item.contextId === 'tooling-minimatch-glob').length, 15);
  for (const name of ['eslint', '@eslint/config-array', '@eslint/eslintrc', '@eslint-community/eslint-utils', '@next/eslint-plugin-next', 'eslint-plugin-import', 'eslint-plugin-jsx-a11y', 'eslint-plugin-react']) assert.equal(policy.packages.some(item => item.name === name), false);
  assert.deepEqual(policy.assessments.filter(item => item.key === 'minimatch:1244012'), []);
  assert.deepEqual(policy.assessments.filter(item => item.contextId === 'shadcn-ts-morph-glob').map(item => item.key), [
    '@ts-morph/common:minimatch',
    'shadcn:ts-morph',
    'ts-morph:@ts-morph/common',
  ]);
  const minimatchPkg = policy.packages.find(item => item.name === 'minimatch');
  assert.equal(minimatchPkg?.range, '7.0.0 - 11.0.0');
  assert.deepEqual(minimatchPkg?.via.map(item => `${item.id}:${item.source}:${item.range}`), ['GHSA-g3hv-75wg-m249:1244623:>=7.0.0 <11.0.1']);
  assert.ok(minimatchPkg?.nodes.every(node => node.version === '10.2.5' && node.development));
});

// 실제 원장의 기한을 늘리지 않고 합성 평가만 만료시켜 일반 실패 차단이 남아 있음을 확인합니다.
test('YAML 예외를 제거해도 다른 평가의 만료는 계속 차단한다', () => {
  const input = structuredClone(policy);
  input.assessments[0].reviewBy = '2026-11-05';
  assert.deepEqual(verifyDependencyPolicy(audit, lock, input, '2026-11-05'), { affectedPackages: 18, advisoryEntries: 3, p1: 0 });
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-06'), /DEPENDENCY_TRIAGE_INVALID/);
});

// @vercel/cli-config의 정확히 고정된 구버전 Zod가 다시 설치되면 실제 npm audit와 별개로 회귀를 차단한다.
test('Blob SDK는 cli-config의 Zod 취약 버전을 수정본으로만 해석한다', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(manifest.overrides['@vercel/cli-config']?.zod, '^4.6.6');
  assert.equal(lock.packages['node_modules/@vercel/cli-config/node_modules/zod'], undefined);
  assert.equal(lock.packages['node_modules/zod']?.version, '4.6.7');
});

test('현재 lock의 모든 resolved는 공식 npm registry를 가리킨다', () => { assert.deepEqual(lockRegistryViolations(lock), []); });
test('외부 피드 resolved는 주소 없이 설치 경로만 진단하고 차단한다', () => {
  const input = structuredClone(lock);
  input.packages['node_modules/dotenv'].resolved = 'https://ms-feed-25.pkgs.visualstudio.com/x/-/dotenv-17.4.2.tgz';
  input.packages['node_modules/turndown'].resolved = 'https://registry.npmjs.org.evil.example/turndown/-/turndown-7.2.4.tgz';
  assert.deepEqual(lockRegistryViolations(input).map(item => item.path), ['node_modules/dotenv', 'node_modules/turndown']);
  let thrown;
  try { verifyDependencyPolicy(audit, input, policy, '2026-11-05'); } catch (error) { thrown = error; }
  assert.equal(thrown?.message, 'DEPENDENCY_LOCK_REGISTRY_INVALID');
  const output = dependencyDiagnosticLines(thrown).join('\n');
  assert.match(output, /node_modules\/dotenv/);
  assert.doesNotMatch(output, /visualstudio|evil/);
});

// #446: 모바일 앱 lockfile도 같은 정확 일치·기한·공식 registry 정책을 별도 원장으로 적용한다.
const mobilePolicy = JSON.parse(readFileSync(new URL('../../security/mobile-dependency-triage.json', import.meta.url)));
const mobileLock = JSON.parse(readFileSync(new URL('../../apps/mobile/package-lock.json', import.meta.url)));
// 주의: mobileAudit는 원장에서 복원한 응답이라 아래 원장↔snapshot 일치 단언은 순환적이다. 여기서는 원장 nodes가
// 실제 lock 경로·버전과 맞는지와 정책 규칙만 확인한다. 실제 registry audit와 원장의 일치는 `npm run verify:dependencies`
// 실행(CI의 repository-security 워크플로)에서만 검사된다.
const mobileAudit = { auditReportVersion: 2, vulnerabilities: Object.fromEntries(mobilePolicy.packages.map(pkg => [pkg.name, { name: pkg.name, severity: pkg.severity, range: pkg.range, nodes: pkg.nodes.map(node => node.path), via: pkg.via.map(v => v.source ? { ...v, url: 'https://github.com/advisories/' + v.id } : v.dependency) }])) };
const mobileResult = { affectedPackages: 35, advisoryEntries: 4, p1: 0 };

// npm의 상위 패키지 meta range는 새 upstream 릴리스만으로 바뀔 수 있다.
// 실제 위험 평가에 쓰는 severity, via의 advisory range/ID/source와 lock nodes의 정확 일치는 유지한다.
test('상위 패키지 파생 range만 바뀌면 통과하지만 실제 권고·등급·경로 변경은 차단한다', () => {
  const changedDerived = structuredClone(mobileAudit);
  changedDerived.vulnerabilities['@expo/cli'].range += ' || 999.0.0';
  changedDerived.vulnerabilities['@expo/config'].range += ' || 999.0.0';
  assert.deepEqual(verifyDependencyPolicy(changedDerived, mobileLock, mobilePolicy, '2026-11-06'), mobileResult);

  const severityChanged = structuredClone(changedDerived);
  severityChanged.vulnerabilities['@expo/cli'].severity = 'critical';
  assert.throws(() => verifyDependencyPolicy(severityChanged, mobileLock, mobilePolicy, '2026-11-06'), /DEPENDENCY_TRIAGE_CHANGED/);

  const advisoryChanged = structuredClone(changedDerived);
  advisoryChanged.vulnerabilities.zod.via[0].range += ' || 999.0.0';
  assert.throws(() => verifyDependencyPolicy(advisoryChanged, mobileLock, mobilePolicy, '2026-11-06'), /DEPENDENCY_TRIAGE_CHANGED/);

  const linkChanged = structuredClone(changedDerived);
  linkChanged.vulnerabilities['@expo/cli'].via.push('previously-unreviewed-dependency');
  assert.throws(() => verifyDependencyPolicy(linkChanged, mobileLock, mobilePolicy, '2026-11-06'), /DEPENDENCY_TRIAGE_CHANGED/);

  const versionChanged = structuredClone(mobileLock);
  versionChanged.packages['node_modules/expo/node_modules/@expo/cli'].version = '99.0.0';
  assert.throws(() => verifyDependencyPolicy(changedDerived, versionChanged, mobilePolicy, '2026-11-06'), /DEPENDENCY_TRIAGE_CHANGED/);

  const invalidRange = structuredClone(mobilePolicy);
  invalidRange.packages.find(item => item.name === '@expo/cli').range = '';
  assert.throws(() => verifyDependencyPolicy(mobileAudit, mobileLock, invalidRange, '2026-11-06'), /DEPENDENCY_TRIAGE_CHANGED/);
});

test('모바일 원장은 lock 스냅샷과 정확히 일치하고 모든 resolved가 공식 registry다', () => {
  assert.deepEqual(dependencySnapshot(mobileAudit, mobileLock), mobilePolicy.packages);
  assert.deepEqual(lockRegistryViolations(mobileLock), []);
  assert.deepEqual(verifyDependencyPolicy(mobileAudit, mobileLock, mobilePolicy, '2026-11-05'), mobileResult);
});

test('모바일 sharp는 수정본으로 해소해 원장에 남지 않는다', () => {
  assert.equal(mobileLock.packages['node_modules/sharp'].version, '0.35.5');
  assert.equal(mobilePolicy.packages.some(item => item.name === 'sharp'), false);
  assert.deepEqual(mobilePolicy.assessments.filter(item => item.key.startsWith('sharp:')), []);
});

// high zod(Expo CLI 전이)는 2주, dev=false CLI·테스트 DoS는 3주, 개발 도구 전용은 4주로 사용면별 기한을 둔다.
// 2026-11-05 minimatch 권고 범위 정정(>=7.0.0 <11.0.1, source 1244012 → 1244623)으로 다시 확인한 평가만 검토일을 옮기고 기한은 늘리지 않는다.
test('모바일 평가는 사용면 위험별 기한을 두고 가장 이른 기한 다음 날 차단한다', () => {
  const deadlines = { 'expo-cli-devtools-zod': '2026-11-18', 'expo-cli-config-glob': '2026-11-25', 'jest-test-runner': '2026-11-25', 'eslint-lint-tooling': '2026-12-02' };
  const rechecked = item => item.contextId === 'eslint-lint-tooling' || item.key === 'minimatch:1244623';
  assert.deepEqual(mobilePolicy.contexts.map(item => item.id).sort(), Object.keys(deadlines).sort());
  assert.equal(mobilePolicy.assessments.length, 67);
  assert.ok(mobilePolicy.assessments.every(item => item.reviewedOn === (rechecked(item) ? '2026-11-05' : '2026-11-04') && item.reviewBy === deadlines[item.contextId]));
  assert.deepEqual(mobilePolicy.assessments.filter(item => item.contextId === 'expo-cli-devtools-zod').map(item => item.key).sort(), ['@expo/cli:zod', 'zod:1243066']);
  assert.deepEqual(verifyDependencyPolicy(mobileAudit, mobileLock, mobilePolicy, '2026-11-18'), mobileResult);
  assert.throws(() => verifyDependencyPolicy(mobileAudit, mobileLock, mobilePolicy, '2026-11-19'), /DEPENDENCY_TRIAGE_INVALID/);
});

// 같은 권고 정정으로 영향 범위 밖이 된 minimatch 3.x·5.x 경로(eslint 본체·Redocly)와 그 평가·context는 남지 않는다.
test('모바일 원장은 정정 전 minimatch source와 빠진 경로를 남기지 않는다', () => {
  assert.deepEqual(mobilePolicy.assessments.filter(item => item.key === 'minimatch:1244012'), []);
  assert.equal(mobilePolicy.assessments.filter(item => item.key === 'minimatch:1244623').length, 1);
  assert.deepEqual(mobilePolicy.packages.filter(item => ['eslint', '@redocly/openapi-core', 'openapi-typescript'].includes(item.name)), []);
  assert.equal(mobilePolicy.packages.find(item => item.name === 'minimatch').nodes.some(node => node.path === 'node_modules/minimatch'), false);
});

// test-exclude처럼 같은 이름의 전이 패키지를 여러 버전으로 두면 npm이 같은 링크를 중복 보고한다. 최초 등록 때는
// test-exclude의 glob 7·10이 그랬지만 2026-11-05 권고 정정으로 glob 7 경로가 빠져 현재 lock에는 중복이 없으므로 합성 입력으로 확인한다.
test('중복 전이 링크는 평가 하나로 받되 링크 수 변경과 중복 평가는 계속 차단한다', () => {
  assert.equal(mobilePolicy.assessments.filter(item => item.key === 'test-exclude:glob').length, 1);
  const audited = structuredClone(mobileAudit);
  audited.vulnerabilities['test-exclude'].via.push('glob');
  const recorded = structuredClone(mobilePolicy);
  recorded.packages.find(item => item.name === 'test-exclude').via.unshift({ dependency: 'glob' });
  assert.deepEqual(verifyDependencyPolicy(audited, mobileLock, recorded, '2026-11-05'), mobileResult);
  assert.throws(() => verifyDependencyPolicy(mobileAudit, mobileLock, recorded, '2026-11-05'), /DEPENDENCY_TRIAGE_CHANGED/);
  const extra = structuredClone(recorded);
  extra.assessments.push({ ...extra.assessments.find(item => item.key === 'test-exclude:glob') });
  assert.throws(() => verifyDependencyPolicy(audited, mobileLock, extra, '2026-11-05'), /DEPENDENCY_TRIAGE_MISSING/);
});

test('모바일 lock의 새 권고·외부 피드 resolved는 차단한다', () => {
  const input = structuredClone(mobileAudit);
  input.vulnerabilities.zod.via.push({ source: 999999, url: 'https://github.com/advisories/GHSA-test-1234', severity: 'critical', range: '<99', title: 'SENSITIVE_SENTINEL' });
  assert.throws(() => verifyDependencyPolicy(input, mobileLock, mobilePolicy, '2026-11-05'), /DEPENDENCY_TRIAGE_CHANGED/);
  const lockInput = structuredClone(mobileLock);
  lockInput.packages['node_modules/expo'].resolved = 'https://registry.npmjs.org.evil.example/expo/-/expo-58.0.21.tgz';
  assert.throws(() => verifyDependencyPolicy(mobileAudit, lockInput, mobilePolicy, '2026-11-05'), /DEPENDENCY_LOCK_REGISTRY_INVALID/);
});
