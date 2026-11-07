/** 공개 스모크 검사의 격리 HTTP 계약과 비밀 정보 비노출을 검증한다. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProductionSmoke, renderProductionSmokeSummary } from '../verify-production-smoke.mjs';

const sha = 'a'.repeat(40);
const secret = 'SYNTHETIC_SECRET_DO_NOT_REPORT';

// 요청 원문과 동시 요청 수는 시험 서버 안에만 기록한다.
async function fixture(t, overrides = {}) {
  const requests = [];
  let active = 0;
  let peak = 0;
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, headers: req.headers, path: req.url });
    active += 1;
    peak = Math.max(active, peak);
    res.on('close', () => { active -= 1; });
    if (overrides[req.url]) return overrides[req.url](req, res);
    await new Promise((done) => setTimeout(done, 5));
    if (req.url === '/favicon.ico') {
      res.writeHead(200, { 'content-type': 'image/x-icon' });
      res.end(Buffer.from([0, 0, 1, 0, 1, 0]));
    } else if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":"ok"}');
    } else if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end([
        'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /member',
        'Disallow: /mypage', 'Disallow: /resources', 'Disallow: /login',
        'Disallow: /register', 'Disallow: /pending', 'Disallow: /system-error',
        'Disallow: /api/', 'Sitemap: http://' + req.headers.host + '/sitemap.xml',
      ].join('\n'));
    } else if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
      res.end('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>http://' + req.headers.host + '/</loc></url></urlset>');
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html lang="ko"><title>HRA</title></html>');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests, peak: () => peak,
    run: (extra = {}) => runProductionSmoke({ origin: `http://127.0.0.1:${server.address().port}`, sha, shaKind: 'fixture', fixture: true, ...extra }),
  };
}

// 정상 계약과 인증 정보가 없는 읽기 전용 요청을 함께 확인한다.
test('여섯 공개 경로가 성공하고 두 요청 이하로 실행된다', async (t) => {
  const app = await fixture(t);
  const report = await app.run();
  assert.equal(report.ok, true);
  assert.equal(report.environment, 'fixture');
  assert.equal(report.checks.length, 6);
  assert.ok(app.peak() <= 2);
  assert.equal(app.peak(), 2);
  for (const request of app.requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers['x-health-secret'], undefined);
    assert.equal(request.headers['x-health-check-secret'], undefined);
  }
});

for (const [name, path, status, type, body, code] of [
  ['상태 실패', '/api/health', 503, 'application/json', secret, 'HTTP_STATUS'],
  ['진단 필드 누출', '/api/health', 200, 'application/json', JSON.stringify({ status: 'ok', detail: secret }), 'HEALTH_CONTENT'],
  ['잘못된 상태', '/api/health', 200, 'application/json', '{"status":"error"}', 'HEALTH_CONTENT'],
  ['HTML 언어 오류', '/', 200, 'text/html', '<html lang="en">HRA</html>', 'CONTENT'],
  ['HTML 브랜드 오류', '/login', 200, 'text/html', '<html lang="ko">다른 서비스</html>', 'CONTENT'],
  ['HTML 유형 오류', '/', 200, 'text/plain', '<html lang="ko">HRA</html>', 'CONTENT_TYPE'],
  ['아이콘 서명 오류', '/favicon.ico', 200, 'image/x-icon', secret, 'CONTENT'],
  ['아이콘 유형 오류', '/favicon.ico', 200, 'text/html', secret, 'CONTENT_TYPE'],
  ['건강 유형 오류', '/api/health', 200, 'text/plain', '{"status":"ok"}', 'CONTENT_TYPE'],
  ['robots 크롤링 정책 오류', '/robots.txt', 200, 'text/plain', 'User-agent: *\nDisallow: /', 'SEO_CONTENT'],
  ['robots 응답 유형 오류', '/robots.txt', 200, 'text/html', '<html lang="ko">HRA</html>', 'CONTENT_TYPE'],
  ['sitemap 비공개 경로 오류', '/sitemap.xml', 200, 'application/xml', '<urlset><url><loc>http://127.0.0.1/admin</loc></url></urlset>', 'SEO_CONTENT'],
  ['sitemap 응답 유형 오류', '/sitemap.xml', 200, 'text/plain', 'not xml', 'CONTENT_TYPE'],
  ['본문 제한', '/', 200, 'text/html', secret.repeat(100000), 'BODY_LIMIT'],
]) {
  test(name, async (t) => {
    const app = await fixture(t, { [path]: (_req, res) => { res.writeHead(status, { 'content-type': type }); res.end(body); } });
    const report = await app.run();
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((check) => check.path === path).code, code);
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.ok(!renderProductionSmokeSummary(report).includes(secret));
  });
}

test('리디렉션을 따라가지 않는다', async (t) => {
  let hits = 0;
  const canary = await fixture(t, { '/': (_req, res) => { hits += 1; res.end(secret); } });
  const app = await fixture(t, { '/': (_req, res) => { res.writeHead(302, { location: canary.origin }); res.end(); } });
  const report = await app.run();
  assert.equal(report.checks[0].code, 'HTTP_STATUS');
  assert.equal(hits, 0);
});

test('시간 제한은 본문 수신에도 적용된다', async (t) => {
  const app = await fixture(t, { '/': (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html'); } });
  const report = await app.run({ timeoutMs: 50 });
  assert.equal(report.checks[0].code, 'TIMEOUT');
});

test('잘못된 출처와 SHA를 네트워크 요청 전에 거부한다', async () => {
  for (const origin of ['https://example.com', 'https://hra-website-theta.vercel.app/', 'https://hra-website-theta.vercel.app?x=1', 'https://user@hra-website-theta.vercel.app', 'https://hra-website-theta.vercel.app/#x']) {
    await assert.rejects(runProductionSmoke({ origin, sha }), /INVALID_ORIGIN/);
  }
  for (const origin of ['http://localhost:3000', 'http://192.168.1.1', 'http://127.0.0.1:3000/path', 'http://127.0.0.1:3000?x=1']) {
    await assert.rejects(runProductionSmoke({ origin, sha, fixture: true }), /INVALID_ORIGIN/);
  }
  await assert.rejects(runProductionSmoke({ sha: 'main' }), /INVALID_SHA/);
  await assert.rejects(runProductionSmoke({ sha, shaKind: 'fixture' }), /INVALID_SHA_KIND/);
  await assert.rejects(runProductionSmoke({ sha, timeoutMs: 10 }), /INVALID_TIMEOUT/);
});

test('실패 CLI는 정제된 JSON과 운영 요약을 기록하고 종료 코드 1을 반환한다', async (t) => {
  const app = await fixture(t, { '/api/health': (_req, res) => { res.writeHead(503); res.end(secret); } });
  const directory = await mkdtemp(join(tmpdir(), 'hra-smoke-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'result', 'report.json');
  const summary = join(directory, 'summary.md');
  const child = spawn(process.execPath, ['scripts/verify-production-smoke.mjs', '--sha', sha, '--sha-kind', 'fixture', '--fixture', '--fixture-origin', app.origin, '--output', output], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_STEP_SUMMARY: summary }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
  assert.equal(exitCode, 1);
  const json = await readFile(output, 'utf8');
  const markdown = await readFile(summary, 'utf8');
  assert.equal(JSON.parse(json).ok, false);
  assert.deepEqual(JSON.parse(stdout), JSON.parse(json));
  assert.match(markdown, /HTTP_STATUS/);
  assert.match(markdown, /docs\/operations\/production-smoke\.md/);
  assert.match(markdown, /실제 서비스 중인 배포 버전의 증거가 아닙니다/);
  for (const text of [json, markdown, stdout, stderr]) assert.ok(!text.includes(secret));
});

/** 운영 HTTPS 요청은 네트워크 대신 실제 Response로 검사하고 헤더 원문을 결과에 넣지 않습니다. */
function mockProduction(t, { hsts = 'max-age=63072000; includeSubDomains; preload', path = '/', status = 200, rawHsts = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    const currentPath = new URL(url).pathname;
    const headers = new Headers();
    const value = currentPath === path ? hsts : 'max-age=63072000';
    if (Array.isArray(value)) value.forEach(item => headers.append('strict-transport-security', item));
    else if (value !== null && !rawHsts) headers.set('strict-transport-security', value);
    let body;
    if (currentPath === '/favicon.ico') { headers.set('content-type', 'image/x-icon'); body = Buffer.from([0, 0, 1, 0, 1, 0]); }
    else if (currentPath === '/api/health') { headers.set('content-type', 'application/json'); body = '{"status":"ok"}'; }
    else if (currentPath === '/robots.txt') {
      headers.set('content-type', 'text/plain');
      body = [
        'User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /member',
        'Disallow: /mypage', 'Disallow: /resources', 'Disallow: /login',
        'Disallow: /register', 'Disallow: /pending', 'Disallow: /system-error',
        'Disallow: /api/', 'Sitemap: https://hra-website-theta.vercel.app/sitemap.xml',
      ].join('\n');
    } else if (currentPath === '/sitemap.xml') {
      headers.set('content-type', 'application/xml');
      body = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://hra-website-theta.vercel.app/</loc></url></urlset>';
    }
    else { headers.set('content-type', 'text/html'); body = '<html lang="ko">HRA</html>'; }
    const response = new Response(body, { status: currentPath === path ? status : 200, headers });
    if (rawHsts) {
      // Headers가 일부 제어 문자를 먼저 거부해도 파서의 HTTP 문법 검증을 직접 통과시키지 않습니다.
      const originalGet = response.headers.get.bind(response.headers);
      response.headers.get = name => name.toLowerCase() === 'strict-transport-security' ? value : originalGet(name);
    }
    return response;
  });
  return calls;
}

for (const header of [
  'max-age=31536000', 'max-age=\"31536000\"', 'max-age=\"31536\\000\"', 'max-age=63072000; includeSubDomains; preload',
  'MAX-AGE = 31536000; INCLUDESUBDOMAINS; PRELOAD', '\tmax-age\t=\t31536000\t;\tincludeSubDomains\t',
  'max-age=031536000; preload;', ';; max-age=63072000 ;;',
  'max-age=63072000; extension=known; quoted="safe value"',
]) {
  test(`Production HSTS 정상 문법 ${header}`, async t => {
    const calls = mockProduction(t, { hsts: header });
    const report = await runProductionSmoke({ sha });
    assert.equal(report.ok, true); assert.equal(calls.length, 6);
    assert.ok(calls.every(call => call.url.startsWith('https://hra-website-theta.vercel.app/')));
    assert.ok(!JSON.stringify(report).includes(header));
  });
}

for (const [label, header] of [
  ['누락', null], ['빈 값', ''], ['max-age 누락', 'includeSubDomains; preload'],
  ['NBSP 앞뒤', '\u00a0max-age=31536000\u00a0'], ['NBSP 이름 뒤', 'max-age\u00a0=31536000'],
  ['NBSP 구분자 뒤', 'max-age=31536000;\u00a0includeSubDomains'], ['NBSP 구분자 앞', 'max-age=31536000\u00a0;includeSubDomains'],
  ['0초', 'max-age=0'], ['1년 경계 미달', 'max-age=31535999'], ['음수', 'max-age=-1'],
  ['소수', 'max-age=31536000.5'], ['지수', 'max-age=31536e3'], ['부분 숫자', 'max-age=31536000junk'],
  ['값 없는 지시어', 'max-age'], ['빈 값 지시어', 'max-age='], ['인용 숫자 뒤 문자', 'max-age="31536000junk"'],
  ['중복', 'max-age=63072000; max-age=63072000'], ['대소문자 중복', 'max-age=63072000; MAX-AGE=31536000'],
  ['includeSubDomains 중복', 'max-age=63072000; includeSubDomains; includeSubDomains'],
  ['includeSubDomains 대소문자 중복', 'max-age=63072000; includeSubDomains; INCLUDESUBDOMAINS'],
  ['preload 중복', 'max-age=63072000; preload; preload'],
  ['preload 대소문자 중복', 'max-age=63072000; preload; PRELOAD'],
  ['확장 중복', 'max-age=63072000; extension=first; extension=second'],
  ['확장 대소문자 중복', 'max-age=63072000; extension=first; EXTENSION=second'],
  ['값 없는 확장 중복', 'max-age=63072000; extension; extension'],
  ['복수 헤더', ['max-age=63072000', 'max-age=63072000']], ['쉼표 결합', 'max-age=63072000, includeSubDomains'],
  ['안전 정수 초과', 'max-age=9007199254740992'], ['무한 수치', `max-age=${'9'.repeat(400)}`],
  ['잘못된 선택 지시어', 'max-age=63072000; preload=true'], ['잘못된 확장 문법', 'max-age=63072000; invalid name'],
]) {
  test(`Production HSTS ${label}은 고정 오류로 실패`, async t => {
    mockProduction(t, { hsts: header });
    const report = await runProductionSmoke({ sha });
    assert.equal(report.ok, false); assert.equal(report.checks[0].code, 'HSTS_INVALID'); assert.equal(report.checks[0].status, 200);
    assert.ok(report.checks.slice(1).every(check => check.ok));
    assert.match(renderProductionSmokeSummary(report), /HSTS_INVALID/);
    assert.deepEqual(Object.keys(report.checks[0]).sort(), ['code', 'durationMs', 'ok', 'path', 'status']);
  });
}
for (const path of ['/', '/login', '/favicon.ico', '/api/health', '/robots.txt', '/sitemap.xml']) {
  test(`Production ${path} 응답 각각 HSTS를 검사하고 상태 코드를 유지`, async t => {
    mockProduction(t, { hsts: null, path, status: 503 });
    const report = await runProductionSmoke({ sha }); const result = report.checks.find(check => check.path === path);
    assert.equal(result.code, 'HSTS_INVALID'); assert.equal(result.status, 503);
  });
}
test('HSTS가 정상인 HTTP 오류는 기존 상태 오류를 유지하고 헤더 원문은 공개하지 않음', async t => {
  const header = `max-age=63072000; diagnostic="${secret}"`;
  mockProduction(t, { hsts: header, status: 503 });
  const report = await runProductionSmoke({ sha });
  assert.equal(report.checks[0].code, 'HTTP_STATUS'); assert.equal(report.checks[0].status, 503);
  assert.ok(!JSON.stringify(report).includes(secret)); assert.ok(!renderProductionSmokeSummary(report).includes(secret));
});

for (const [label, control] of [['수직 탭', '\u000b'], ['폼 피드', '\u000c']]) {
  for (const header of [`${control}max-age=31536000${control}`, `max-age${control}=31536000`, `max-age=31536000;${control}includeSubDomains`]) {
    test(`Production HSTS ${label} 원시 헤더를 HTTP 공백으로 정규화하지 않음 ${JSON.stringify(header)}`, async t => {
      mockProduction(t, { hsts: header, rawHsts: true });
      const report = await runProductionSmoke({ sha });
      assert.equal(report.ok, false); assert.equal(report.checks[0].code, 'HSTS_INVALID'); assert.equal(report.checks[0].status, 200);
    });
  }
}
