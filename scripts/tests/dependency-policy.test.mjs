/** audit 네트워크/형식 실패와 새 advisory·설치 경로·만료·P1의 차단을 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dependencyDiagnosticLines, dependencySnapshot, verifyDependencyPolicy } from '../_lib/dependency-policy.mjs';
const policy = JSON.parse(readFileSync(new URL('../../security/dependency-triage.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
// 실제 원장의 독립 nodes/via 집합으로 npm 응답을 복원한다. 공격 조건 설명은 응답 metadata와 분리한다.
const audit = { auditReportVersion: 2, vulnerabilities: Object.fromEntries(policy.packages.map(pkg => [pkg.name, { name: pkg.name, severity: pkg.severity, range: pkg.range, nodes: pkg.nodes.map(node => node.path), via: pkg.via.map(v => v.source ? { ...v, url: 'https://github.com/advisories/' + v.id } : v.dependency) }])) };
test('현재 정확한 집합은 package 수와 advisory 수를 구분한다', () => { assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 31, advisoryEntries: 23, p1: 0 }); });
for (const [name, change] of [
  ['새 advisory', a => a.vulnerabilities.vite.via[0].source++],
  ['영향 범위 변경', a => a.vulnerabilities.vite.via[0].range += ' || 99.0.0'],
  ['심각도 변경', a => a.vulnerabilities.vite.severity = 'critical'],
  ['설치 경로 누락', a => a.vulnerabilities.vite.nodes.pop()],
  ['패키지 누락', a => delete a.vulnerabilities.vite],
  ['통신 오류 응답', a => a.error = { code: 'ENETWORK', summary: 'sensitive sentinel' }],
  ['잘못된 via', a => a.vulnerabilities.vite.via = [null]],
]) test(name + ' 차단', () => { const input = structuredClone(audit); change(input); assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-03'), /DEPENDENCY_/); });
for (const [name, change] of [
  ['미분류', p => p.assessments.pop()], ['P1', p => p.assessments[0].priority = 'P1'],
  ['owner 누락', p => p.assessments[0].owner = ''], ['설명 누락', p => p.assessments[0].assessment = ''],
  ['중복 검토', p => p.assessments[0] = p.assessments[1]],
]) test(name + ' 원장 차단', () => { const input = structuredClone(policy); change(input); assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-03'), /DEPENDENCY_/); });
test('검토 기한 만료 차단', () => assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-06'), /DEPENDENCY_TRIAGE_INVALID/));
test('lock 설치 버전 변경 차단', () => { const input = structuredClone(lock); input.packages['node_modules/vite'].version = '99.0.0'; assert.throws(() => verifyDependencyPolicy(audit, input, policy, '2026-11-03'), /DEPENDENCY_TRIAGE_CHANGED/); });
test('깨진 audit는 정상 0건이 아니다', () => { for (const input of [null, {}, { auditReportVersion: 2, vulnerabilities: [] }]) assert.throws(() => dependencySnapshot(input, lock), /DEPENDENCY_REPORT_INVALID/); });

// 감사 응답의 제목·영향 범위는 원문에 민감한 문자열이 섞일 수 있으므로 진단에는 식별자만 남긴다.
function capturePolicyError(inputAudit, inputLock = lock) {
  try { verifyDependencyPolicy(inputAudit, inputLock, policy, '2026-11-03'); }
  catch (error) { return error; }
  assert.fail('변경된 감사 결과가 차단되지 않았다');
}

test('신규 권고는 패키지·권고 ID·source로만 진단하며 차단한다', () => {
  const input = structuredClone(audit);
  input.vulnerabilities.vite.via.push({ source: 999999, url: 'https://github.com/advisories/GHSA-test-1234', severity: 'high', range: '<99', title: 'SENSITIVE_SENTINEL' });
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{ kind: 'ADVISORY_ONLY_IN_AUDIT', package: 'vite', id: 'GHSA-test-1234', source: 999999 }]);
  assert.doesNotMatch(JSON.stringify(error.diagnostics), /SENSITIVE_SENTINEL|<99/);
  assert.deepEqual(dependencyDiagnosticLines(error), [
    'DEPENDENCY_TRIAGE_CHANGED',
    'DEPENDENCY_CHANGE {"kind":"ADVISORY_ONLY_IN_AUDIT","package":"vite","id":"GHSA-test-1234","source":999999}',
  ]);
});

test('권고 제거는 철회로 단정하지 않고 원장에만 남은 ID를 진단한다', () => {
  const input = structuredClone(audit);
  const removed = input.vulnerabilities.vite.via.pop();
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{ kind: 'ADVISORY_ONLY_IN_POLICY', package: 'vite', id: removed.id, source: removed.source }]);
});

test('권고 메타데이터와 설치 버전 변경은 원문 없이 위치만 진단한다', () => {
  const input = structuredClone(audit);
  input.vulnerabilities.vite.via[0].title = 'SENSITIVE_SENTINEL';
  const changedAdvisory = capturePolicyError(input);
  assert.deepEqual(changedAdvisory.diagnostics, [{ kind: 'ADVISORY_METADATA_CHANGED', package: 'vite', id: input.vulnerabilities.vite.via[0].id, source: input.vulnerabilities.vite.via[0].source }]);
  assert.doesNotMatch(JSON.stringify(changedAdvisory.diagnostics), /SENSITIVE_SENTINEL/);
  const changedLock = structuredClone(lock);
  changedLock.packages['node_modules/vite'].version = '99.0.0';
  const changedNode = capturePolicyError(audit, changedLock);
  assert.deepEqual(changedNode.diagnostics, [{ kind: 'NODE_METADATA_CHANGED', package: 'vite', path: 'node_modules/vite' }]);
  assert.doesNotMatch(JSON.stringify(changedNode.diagnostics), /99\.0\.0/);
});

test('새 설치 경로는 경로만 진단하고 실제 lock 일치 검사를 유지한다', () => {
  const input = structuredClone(audit);
  const inputLock = structuredClone(lock);
  input.vulnerabilities.vite.nodes.push('node_modules/fixture-vite');
  inputLock.packages['node_modules/fixture-vite'] = { version: '99.0.0', dev: true };
  const error = capturePolicyError(input, inputLock);
  assert.deepEqual(error.diagnostics, [{ kind: 'NODE_ONLY_IN_AUDIT', package: 'vite', path: 'node_modules/fixture-vite' }]);
  assert.doesNotMatch(JSON.stringify(error.diagnostics), /99\.0\.0/);
  assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-11-03'), /DEPENDENCY_LOCK_MISMATCH/);
});

test('변경이 20건을 넘으면 생략 건수를 남기면서 차단한다', () => {
  const input = structuredClone(audit);
  for (let index = 0; index < 21; index++) input.vulnerabilities.vite.via.push({
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

test('v2 원장은 69개 권고별 판단과 7개 공유 사용 맥락을 유지한다', () => {
  assert.equal(policy.schemaVersion, 2);
  assert.equal(policy.assessments.length, 69);
  assert.equal(policy.contexts.length, 7);
  assert.equal(new Set(policy.assessments.map(item => item.contextId)).size, 7);
  assert.deepEqual(policy.contexts.map(context => policy.assessments.filter(item => item.contextId === context.id).length).sort((a, b) => a - b), [3, 3, 4, 5, 5, 12, 37]);
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 31, advisoryEntries: 23, p1: 0 });
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
  const duplicate = { ...input.vulnerabilities.vite.via[0], source: 999998 };
  input.vulnerabilities.vite.via.push(duplicate);
  const error = capturePolicyError(input);
  assert.equal(error.message, 'DEPENDENCY_TRIAGE_CHANGED');
  assert.deepEqual(error.diagnostics, [{
    kind: 'ADVISORY_ONLY_IN_AUDIT', package: 'vite', id: duplicate.id, source: 999998,
  }]);
  assert.doesNotMatch(dependencyDiagnosticLines(error).join('\n'), /title|range|version/);
});

// 수정 버전으로 대체한 YAML의 임시 예외만 제거하고 다른 평가의 날짜는 그대로 보존합니다.
test('패치된 YAML 설치본은 임시 평가·공유 맥락 없이 확인한다', () => {
  assert.equal(policy.packages.some(item => item.name === 'js-yaml'), false);
  assert.deepEqual(policy.assessments.filter(item => item.key.startsWith('js-yaml:')), []);
  assert.deepEqual(policy.contexts.filter(item => ['yaml-parser-cli', 'yaml-omap'].includes(item.id)), []);
  const cliAssessments = policy.assessments.filter(item => item.contextId === 'shadcn-registry-cli');
  assert.equal(cliAssessments.length, 4);
  assert.ok(cliAssessments.every(item => item.reviewedOn === '2026-10-28' && item.reviewBy === '2026-11-05'));
  assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-11-03'), { affectedPackages: 31, advisoryEntries: 23, p1: 0 });
});

// minimatch 신규 권고는 CLI dev=false 경로와 개발 도구 경로를 분리하고 기존 2026-11-05 기한을 연장하지 않습니다.
test('minimatch 신규 권고는 사용면을 분리하고 기존 검토일·기한을 보존한다', () => {
  const priorAssessments = policy.assessments.slice(0, 29);
  const addedAssessments = policy.assessments.slice(29);
  assert.equal(addedAssessments.length, 40);
  assert.ok(priorAssessments.every(item => ['2026-10-22', '2026-10-28'].includes(item.reviewedOn) && item.reviewBy === '2026-11-05'));
  assert.ok(addedAssessments.every(item => item.reviewedOn === '2026-11-03' && item.reviewBy === '2026-11-05'));
  assert.equal(addedAssessments.filter(item => item.contextId === 'tooling-minimatch-glob').length, 37);
  assert.deepEqual(addedAssessments.filter(item => item.contextId === 'shadcn-ts-morph-glob').map(item => item.key), [
    '@ts-morph/common:minimatch',
    'shadcn:ts-morph',
    'ts-morph:@ts-morph/common',
  ]);
  const minimatchPkg = policy.packages.find(item => item.name === 'minimatch');
  assert.deepEqual(minimatchPkg?.via.map(item => `${item.id}:${item.source}`), ['GHSA-g3hv-75wg-m249:1244012']);
});

// 실제 원장의 기한을 늘리지 않고 합성 평가만 만료시켜 일반 실패 차단이 남아 있음을 확인합니다.
test('YAML 예외를 제거해도 다른 평가의 만료는 계속 차단한다', () => {
  const input = structuredClone(policy);
  input.assessments[0].reviewBy = '2026-11-03';
  assert.deepEqual(verifyDependencyPolicy(audit, lock, input, '2026-11-03'), { affectedPackages: 31, advisoryEntries: 23, p1: 0 });
  assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-11-04'), /DEPENDENCY_TRIAGE_INVALID/);
});
