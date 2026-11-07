/** 실제 생산자 출력과 변형한 위험 보고서로 공개 업로드 차단을 검증합니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ExpandedPublicReporter, { requiredPublicBrowserCases } from '../../tests/support/expanded-public-reporter.mjs';
import { summarizeMeasurements } from '../../tests/support/auth-measurement-stats.mjs';
import { runProductionSmoke } from '../verify-production-smoke.mjs';
import { publicArtifactByteLimit, validatePublicArtifact } from '../_lib/public-artifact-policy.mjs';

const sha = 'a'.repeat(40);
/** 보고서 생성기 자체로 정상 사례를 구성하여 검사가 임의로 만든 모양에만 맞지 않게 합니다. */
async function reports(directory) {
  const summaryPath = join(directory, 'browser.json');
  const reporter = new ExpandedPublicReporter({ summaryPath }); reporter.listOnly = false;
  const tests = Object.entries(requiredPublicBrowserCases).map(([id, file], index) => ({ title: `[PUBLIC:${id}] 합성 사례`, location: { file, line: index + 1 }, expectedStatus: 'passed' }));
  reporter.onBegin({}, { allTests: () => tests });
  for (const item of tests) reporter.onTestEnd(item, { status: 'passed', retry: 0 });
  await reporter.onEnd({ status: 'passed' });
  const expanded = { sourceSha: sha, scope: { appRoot: '.', only: null, publicBrowser: true }, browser: JSON.parse(await readFile(summaryPath, 'utf8')), completed: true, cleanupComplete: true, coverageHealthy: true, phase: 'COMPLETE', limitations: ['실제 Blob 업로드·파일 스트림 미검증', '정상 CRUD·서버 액션 쓰기 미검증', '공개 6개 spec 외 브라우저는 별도 G1 검증 결과를 확인', '알려진 동적 경로 외 합성 식별자는 fixture 제약'], summary: { routes: 0, records: 0, classifications: {} }, diagnostics: [], results: [] };
  const metrics = summarizeMeasurements([{ sampleKey: 1, scenario: 'member_page', durationMs: 21 }], [{ sampleKey: 1, type: 'auth', phase: 'RSC', durationMs: 0, failed: false }, { sampleKey: 1, type: 'db', phase: 'RSC', durationMs: 10, failed: false, dbKind: 'session' }]);
  const authentication = { complete: true, cleanupComplete: true, stage: 'COMPLETE', diagnostics: [], limits: { serialIdentityPopulations: true, maximumPopulation: 200, maximumSamples: 50, httpIncludesRenderingAndAdapter: true, databaseCountsLogicalNeonPosts: true, productionLatencyOrCapacityClaim: false }, runs: [{ profile: 'current', samplesPerScenario: 20, population: 200, complete: true, cleanupComplete: true, regressions: { identitySequence: true, concurrentIdentity: true, sessionVersion: true, roleRevocation: true, pendingRevocation: true, deletedUser: true, databaseErrorFailClosed: true }, scenarios: metrics, sourceSha: sha, lockHash: 'b'.repeat(64), worktreeClean: true, reusedBuild: false, versions: { node: 'v24.14.0', nextVersion: '16.1.6', authVersion: '5.0.0-beta.30', postgres: 'postgres (PostgreSQL) 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)' } }] };
  const server = createServer((req, res) => {
    if (req.url === '/api/health') { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"status":"error"}'); }
    else if (req.url === '/favicon.ico') { res.writeHead(200, { 'content-type': 'image/x-icon' }); res.end(Buffer.from([0, 0, 1, 0, 1, 0])); }
    else if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end([
        'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /member',
        'Disallow: /mypage', 'Disallow: /resources', 'Disallow: /login',
        'Disallow: /register', 'Disallow: /pending', 'Disallow: /system-error',
        'Disallow: /api/', `Sitemap: http://${req.headers.host}/sitemap.xml`,
      ].join('\n'));
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://${req.headers.host}/</loc></url></urlset>`);
    }
    else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html lang="ko">HRA</html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let fixture;
  try { fixture = await runProductionSmoke({ origin: `http://127.0.0.1:${server.address().port}`, sha, shaKind: 'fixture', fixture: true }); }
  finally { await new Promise(resolve => server.close(resolve)); }
  const production = structuredClone(fixture); production.environment = 'Production'; production.shaKind = 'deployment'; production.checks[3] = { path: '/api/health', status: 200, ok: true, code: 'OK', durationMs: 1 }; production.ok = true;
  return { 'expanded-public': expanded, 'authentication-measurement': authentication, 'production-smoke': production, fixture };
}

const temporary = await mkdtemp(join(tmpdir(), 'hra-public-artifact-'));
const fixtures = await reports(temporary);
test.after(async () => { await rm(temporary, { recursive: true, force: true }); });

for (const kind of ['expanded-public', 'authentication-measurement', 'production-smoke']) {
  test(`${kind}: 실제 생산자 정상 보고서와 CLI 통과`, async () => {
    assert.equal(validatePublicArtifact(kind, fixtures[kind]), true);
    const file = join(temporary, `${kind}.json`); await writeFile(file, JSON.stringify(fixtures[kind]));
    const result = spawnSync(process.execPath, ['scripts/check-public-artifact.mjs', '--kind', kind, '--file', file], { encoding: 'utf8' });
    assert.equal(result.status, 0); assert.equal(result.stdout, 'PUBLIC_ARTIFACT_SAFE\n'); assert.equal(result.stderr, '');
  });
  test(`${kind}: 임의 추가 필드·유출 문자열 차단`, () => {
    // 탐지용 값은 실제 credential이 아니며 유효한 공급자 token을 소스에 저장하지 않습니다.
    const sensitive = ['user' + '@' + 'private.invalid', ['010', '9876', '5432'].join('-'), 'Cookie' + ': session=synthetic', 'Bearer' + ' synthetic-value', ['https:', '', 'private.invalid', 'token'].join('/'), ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-')];
    for (const value of sensitive) {
      const report = structuredClone(fixtures[kind]); report.extra = { nested: value };
      assert.throws(() => validatePublicArtifact(kind, report), /PUBLIC_ARTIFACT_SCHEMA_INVALID/);
      const nested = structuredClone(fixtures[kind]);
      if (kind === 'expanded-public') nested.browser.cases[0].file = value;
      else if (kind === 'authentication-measurement') nested.runs[0].versions.postgres = value;
      else nested.checks[0].code = value;
      assert.throws(() => validatePublicArtifact(kind, nested), /PUBLIC_ARTIFACT_SCHEMA_INVALID/);
    }
    const extra = structuredClone(fixtures[kind]); extra.extra = false; assert.throws(() => validatePublicArtifact(kind, extra));
  });
}
test('고정 fixture 실패 보고서는 허용하되 오류 코드에 원문을 넣으면 거부', () => {
  assert.equal(validatePublicArtifact('production-smoke', fixtures.fixture), true);
  const report = structuredClone(fixtures.fixture); report.checks[3].code = 'unsafe raw failure'; assert.throws(() => validatePublicArtifact('production-smoke', report));
});
for (const value of [null, false, 0, '']) {
  test(`인증 versions가 존재하면 falsy 값도 객체 계약을 검사: ${JSON.stringify(value)}`, () => {
    const report = structuredClone(fixtures['authentication-measurement']); report.runs[0].versions = value;
    assert.throws(() => validatePublicArtifact('authentication-measurement', report), /PUBLIC_ARTIFACT_SCHEMA_INVALID/);
  });
}
test('SEO 상태 오류는 허용하지만 임의 경로·비공개 값은 차단', () => {
  const report = structuredClone(fixtures['production-smoke']);
  report.checks[4].ok = false;
  report.checks[4].code = 'SEO_CONTENT';
  report.ok = false;
  assert.equal(validatePublicArtifact('production-smoke', report), true);
  const paths = structuredClone(report);
  paths.checks[4].path = '/member/sensitive-id';
  assert.throws(() => validatePublicArtifact('production-smoke', paths), /PUBLIC_ARTIFACT_SCHEMA_INVALID/);
  const extra = structuredClone(report);
  extra.checks.push({ path: '/admin', status: 200, ok: true, code: 'OK', durationMs: 1 });
  assert.throws(() => validatePublicArtifact('production-smoke', extra), /PUBLIC_ARTIFACT_SCHEMA_INVALID/);
});
test('HSTS 고정 오류도 공개 상태 보고서로 허용', () => {
  const report = structuredClone(fixtures['production-smoke']); report.checks[0].ok = false; report.checks[0].code = 'HSTS_INVALID'; report.ok = false;
  assert.equal(validatePublicArtifact('production-smoke', report), true);
});
test('허용된 기존 필드에 중첩 민감 값·추가 키를 넣어도 거부', () => {
  const mutations = [
    ['production-smoke', report => { report.checks[0].path = 'user' + '@private.invalid'; }],
    ['production-smoke', report => { report.checks[0].headers = { cookie: 'synthetic' }; }],
    ['expanded-public', report => { report.browser.cases[0].errors = [{ code: 'Cookie' + ': synthetic', line: 1 }]; }],
    ['expanded-public', report => { report.scope.appRoot = '/tmp/private-user'; }],
    ['authentication-measurement', report => { report.runs[0].versions.postgres = 'postgres (PostgreSQL) 16.11 user' + '@private.invalid'; }],
    ['authentication-measurement', report => { report.runs[0].scenarios[0].phases.RSC.rawSql = 'SELECT private'; }],
    ['authentication-measurement', report => { report.diagnostics = ['AUTH_MEASURE_' + 'PRIVATE_EMAIL']; }],
  ];
  for (const [kind, mutate] of mutations) { const report = structuredClone(fixtures[kind]); mutate(report); assert.throws(() => validatePublicArtifact(kind, report)); }
});
test('음수·역전·무한 수치와 집계 불일치를 거부', () => {
  for (const value of [-1, Infinity, NaN, 1_800_001]) { const report = structuredClone(fixtures['production-smoke']); report.checks[0].durationMs = value; assert.throws(() => validatePublicArtifact('production-smoke', report)); }
  const report = structuredClone(fixtures['authentication-measurement']); report.runs[0].scenarios[0].httpMs = { p50: 2, p95: 1 }; assert.throws(() => validatePublicArtifact('authentication-measurement', report));
  report.runs[0].scenarios[0].httpMs = { p50: 1, p95: 2 }; report.runs[0].scenarios[0].databaseRoundtrips.errorRate = 0.5; assert.throws(() => validatePublicArtifact('authentication-measurement', report));
});
test('CLI 누락·잘린 JSON·과대 파일·알 수 없는 인수는 원문 없는 고정 실패', async () => {
  const file = join(temporary, 'unsafe.json');
  for (const bytes of ['{', ' '.repeat(publicArtifactByteLimit + 1), Buffer.from([0xff]), JSON.stringify(fixtures['production-smoke']).replace('{', '{\"ok\":\"Cookie: synthetic\",')]) {
    await writeFile(file, bytes);
    const result = spawnSync(process.execPath, ['scripts/check-public-artifact.mjs', '--kind', 'production-smoke', '--file', file], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'PUBLIC_ARTIFACT_REJECTED\n');
  }
  for (const args of [[], ['--kind', 'other', '--file', file], ['--kind', 'production-smoke', '--file', file, '--unknown'], ['--kind', 'production-smoke', '--file', join(temporary, 'missing')]]) {
    const result = spawnSync(process.execPath, ['scripts/check-public-artifact.mjs', ...args], { encoding: 'utf8' }); assert.equal(result.status, 1); assert.equal(result.stderr, 'PUBLIC_ARTIFACT_REJECTED\n');
  }
});
test('세 workflow 모두 실패 경로에서도 같은 파일 검사 후에만 보관', async () => {
  for (const [workflow, kind] of [['expanded-e2e', 'expanded-public'], ['authentication-measurement', 'authentication-measurement'], ['production-smoke', 'production-smoke']]) {
    const source = await readFile(`.github/workflows/${workflow}.yml`, 'utf8');
    const scanner = source.indexOf('id: artifact_safety'); const upload = source.indexOf('uses: actions/upload-artifact@');
    assert.ok(scanner > 0 && scanner < upload);
    const between = source.slice(scanner, upload);
    assert.match(between, /if: always\(\)\n/); assert.match(between, /if: always\(\) && steps\.artifact_safety\.outcome == 'success'/);
    assert.ok(between.includes(`--kind ${kind} --file test-results/${kind}.json`));
    assert.equal((between.match(/\n        run:/g) ?? []).length, 1);
    assert.ok(source.slice(upload).includes(`path: test-results/${kind}.json`)); assert.match(source.slice(upload), /retention-days: 7/);
  }
});
