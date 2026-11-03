/** audit 네트워크/형식 실패와 새 advisory·설치 경로·만료·P1의 차단을 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dependencyDiagnosticLines, dependencySnapshot, verifyDependencyPolicy } from '../_lib/dependency-policy.mjs';
const policy = JSON.parse(readFileSync(new URL('../../security/dependency-triage.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
// 실제 원장의 독립 nodes/via 집합으로 npm 응답을 복원한다. 공격 조건 설명은 응답 metadata와 분리한다.
const audit = { auditReportVersion: 2, vulnerabilities: Object.fromEntries(policy.packages.map(pkg => [pkg.name, { name: pkg.name, severity: pkg.severity, range: pkg.range, nodes: pkg.nodes.map(node => node.path), via: pkg.via.map(v => v.source ? { ...v, url: 'https://github.com/advisories/' + v.id } : v.dependency) }])) };
test('현재 정확한 집합은 package 수와 advisory 수를 구분한다', () => { assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 }); });
for (const [name, change] of [
  ['새 advisory', a => a.vulnerabilities.esbuild.via[0].source++],
  ['영향 범위 변경', a => a.vulnerabilities.esbuild.via[0].range += ' || 99.0.0'],
  ['심각도 변경', a => a.vulnerabilities.esbuild.severity = 'critical'],
  ['설치 경로 누락', a => a.vulnerabilities.esbuild.nodes.pop()],
  ['패키지 누락', a => delete a.vulnerabilities.esbuild],
  ['통신 오류 응답', a => a.error = { code: 'ENETWORK', summary: 'sensitive sentinel' }],
  ['잘못된 via', a => a.vulnerabilities.esbuild.via = [null]],
]) test(name + ' 차단', () => { const input = structuredClone(audit); change(input); assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-03'), /DEPENDENCY_/); });
for (const [name, change] of [
  ['미분류', p => p.assessments.pop()], ['P1', p => p.assessments[0].priority = 'P1'],
  ['owner 누락', p => p.assessments[0].owner = ''], ['설명 누락', p => p.assessments[0].assessment = ''],
  ['중복 검토', p => p.assessments[0] = p.assessments[1]],
]) test(name + ' 원장 차단', () => { const input = structuredClone(policy); change(input); assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-03'), /DEPENDENCY_/); });
// 가장 이른 재검토 기한(2026-11-19) 다음 날부터는 실제 원장 전체가 만료로 차단된다.
test('검토 기한 만료 차단', () => assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-20'), /DEPENDENCY_TRIAGE_INVALID/));
test('lock 설치 버전 변경 차단', () => { const input = structuredClone(lock); input.packages['node_modules/@esbuild-kit/core-utils/node_modules/esbuild'].version = '99.0.0'; assert.throws(() => verifyDependencyPolicy(audit, input, policy, '2026-11-03'), /DEPENDENCY_TRIAGE_CHANGED/); });
test('깨진 audit는 정상 0건이 아니다', () => { for (const input of [null, {}, { auditReportVersion: 2, vulnerabilities: [] }]) assert.throws(() => dependencySnapshot(input, lock), /DEPENDENCY_REPORT_INVALID/); });

// 감사 응답의 제목·영향 범위는 원문에 민감한 문자열이 섞일 수 있으므로 진단에는 식별자만 남긴다.
function capturePolicyError(inputAudit, inputLock = lock) {
  try { verifyDependencyPolicy(inputAudit, inputLock, policy, '2026-11-03'); }
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
  try { verifyDependencyPolicy(audit, lock, input, '2026-11-03'); }
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
  assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-03'), /DEPENDENCY_LOCK_MISMATCH/);
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
  try { verifyDependencyPolicy(audit, lock, input, '2026-11-03'); }
  catch (caught) { error = caught; }
  assert.equal(error?.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(dependencyDiagnosticLines(error), ['DEPENDENCY_TRIAGE_CHANGED']);
});

test('v2 원장은 50개 권고별 판단과 5개 공유 사용 맥락을 유지한다', () => {
  assert.equal(policy.schemaVersion, 2);
  assert.equal(policy.assessments.length, 50);
  assert.equal(policy.contexts.length, 5);
  assert.equal(new Set(policy.assessments.map(item => item.contextId)).size, 5);
  assert.deepEqual(policy.contexts.map(context => policy.assessments.filter(item => item.contextId === context.id).length).sort((a, b) => a - b), [2, 3, 4, 4, 37]);
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 });
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
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-03'), /DEPENDENCY_/);
});

test('구 schema v1은 새 검토 원장으로 자동 승인하지 않는다', () => {
  const input = structuredClone(policy);
  input.schemaVersion = 1;
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-03'), /DEPENDENCY_TRIAGE_CHANGED/);
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

// 수정 버전으로 대체한 YAML의 임시 예외는 다시 나타나지 않고, shadcn CLI 평가는 2026-11-04(KST) 재검토 기한을 따릅니다.
test('패치된 YAML 설치본은 임시 평가·공유 맥락 없이 확인한다', () => {
  assert.equal(policy.packages.some(item => item.name === 'js-yaml'), false);
  assert.deepEqual(policy.assessments.filter(item => item.key.startsWith('js-yaml:')), []);
  assert.deepEqual(policy.contexts.filter(item => ['yaml-parser-cli', 'yaml-omap'].includes(item.id)), []);
  const cliAssessments = policy.assessments.filter(item => item.contextId === 'shadcn-registry-cli');
  assert.equal(cliAssessments.length, 4);
  assert.ok(cliAssessments.every(item => item.reviewedOn === '2026-11-03' && item.reviewBy === '2026-11-19'));
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 });
});

// 2026-11-04(KST) 재검토: lock 범위 안 수정본으로 해소한 권고는 원장에서 제거하고, 남은 평가는 일괄 연장 없이
// 사용면 위험에 따라 기한을 다르게 둡니다. reviewedOn은 게이트 기준 시계인 UTC 날짜(2026-11-03)입니다.
test('수정본으로 해소한 권고는 제거하고 남은 평가는 위험별 기한을 둔다', () => {
  for (const name of ['brace-expansion', 'source-map-js', 'vite']) assert.equal(policy.packages.some(item => item.name === name), false);
  assert.deepEqual(policy.assessments.filter(item => /^(brace-expansion|source-map-js|vite):/.test(item.key) || item.key === 'esbuild:1120680'), []);
  assert.deepEqual(policy.contexts.filter(item => ['tooling-brace-expansion', 'vitest-vite'].includes(item.id)), []);
  assert.ok(policy.assessments.every(item => item.reviewedOn === '2026-11-03'));
  // dev=false이거나 수정본이 있는데 적용되지 못한 사용면은 2주, dev=false CLI DoS는 3주, 개발 도구 전용은 4주다.
  const deadlines = { 'shadcn-registry-cli': '2026-11-19', 'build-css-source-map': '2026-11-19', 'shadcn-ts-morph-glob': '2026-11-26', 'build-esbuild': '2026-12-03', 'tooling-minimatch-glob': '2026-12-03' };
  assert.deepEqual(Object.keys(deadlines).sort(), policy.contexts.map(item => item.id).sort());
  assert.ok(policy.assessments.every(item => item.reviewBy === deadlines[item.contextId]));
  // 기존 기한 다음 날(2026-11-06)에도 통과하고, 가장 이른 기한 다음 날부터는 다시 차단한다.
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-06'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 });
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-19'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 });
  assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-20'), /DEPENDENCY_TRIAGE_INVALID/);
});

// minimatch 권고는 CLI dev=false 경로와 개발 도구 경로를 계속 분리해 서로 다른 기한으로 재검토합니다.
test('minimatch 권고는 사용면을 분리해 위험별 기한으로 재검토한다', () => {
  assert.equal(policy.assessments.filter(item => item.contextId === 'tooling-minimatch-glob').length, 37);
  assert.deepEqual(policy.assessments.filter(item => item.contextId === 'shadcn-ts-morph-glob').map(item => item.key), [
    '@ts-morph/common:minimatch',
    'shadcn:ts-morph',
    'ts-morph:@ts-morph/common',
  ]);
  const minimatchPkg = policy.packages.find(item => item.name === 'minimatch');
  assert.equal(minimatchPkg?.range, '<11.0.1');
  assert.deepEqual(minimatchPkg?.via.map(item => `${item.id}:${item.source}`), ['GHSA-g3hv-75wg-m249:1244012']);
});

// 실제 원장의 기한을 늘리지 않고 합성 평가만 만료시켜 일반 실패 차단이 남아 있음을 확인합니다.
test('YAML 예외를 제거해도 다른 평가의 만료는 계속 차단한다', () => {
  const input = structuredClone(policy);
  input.assessments[0].reviewBy = '2026-11-03';
  assert.deepEqual(verifyDependencyPolicy(audit, lock, input, '2026-11-03'), { affectedPackages: 28, advisoryEntries: 4, p1: 0 });
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-04'), /DEPENDENCY_TRIAGE_INVALID/);
});
