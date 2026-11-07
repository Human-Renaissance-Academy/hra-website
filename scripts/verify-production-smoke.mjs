/**
 * 프로덕션 공개 경로의 최소 HTTP 계약을 검사한다.
 * 인증 정보나 원문 응답을 보관하지 않고 고정된 오류 코드만 보고한다.
 */
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 운영 대상·읽기 경로·응답 한도는 외부 입력이 아닌 이 계약으로 고정한다.
export const productionSmokeOrigin = 'https://hra-website-theta.vercel.app';
const paths = ['/', '/login', '/favicon.ico', '/api/health', '/robots.txt', '/sitemap.xml'];
const bodyLimit = 2 * 1024 * 1024;
const procedure = 'https://github.com/yeongseon/hra-website/blob/main/docs/operations/production-smoke.md';

// 시험 서버도 숫자형 루프백 주소만 허용하여 외부 목적지로 전환하지 못하게 한다.
function validateOptions({ origin, sha, shaKind, fixture, timeoutMs }) {
  if (typeof sha !== 'string' || !/^[a-fA-F0-9]{40}$/.test(sha)) throw new Error('INVALID_SHA');
  if (!['main', 'deployment', 'fixture'].includes(shaKind) || (!fixture && shaKind === 'fixture')) throw new Error('INVALID_SHA_KIND');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000 || (!fixture && timeoutMs !== 15000)) throw new Error('INVALID_TIMEOUT');
  let url;
  try { url = new URL(origin); } catch { throw new Error('INVALID_ORIGIN'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || origin !== url.origin) throw new Error('INVALID_ORIGIN');
  if (fixture) {
    if (url.protocol !== 'http:' || !/^127(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.split('.').some((part) => Number(part) > 255)) throw new Error('INVALID_ORIGIN');
  } else if (origin !== productionSmokeOrigin) throw new Error('INVALID_ORIGIN');
}

// 본문을 조금씩 읽고 상한을 넘으면 즉시 취소한다. 반환값은 검사 함수 안에서만 사용한다.
async function readBounded(response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > bodyLimit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// 플랫폼의 2년 설정과 별개로 최소 1년의 단일 정수 max-age를 요구합니다.
// 중복 헤더는 Fetch가 쉼표로 합치므로 거부하며 preload 목록 등재는 판정하지 않습니다.
function validHsts(value) {
  if (typeof value !== 'string' || value.includes(',')) return false;
  let maximumAge = null;
  const names = new Set();
  for (const directive of value.split(';').map(part => part.replace(/^[ \t]+|[ \t]+$/g, '')).filter(Boolean)) {
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)(?:[ \t]*=[ \t]*(.+))?$/.exec(directive);
    if (!match) return false;
    const name = match[1].toLowerCase();
    // RFC 6797 §6.1에서 중복 지시어가 있는 전체 필드는 무효이므로 확장 이름도 검사합니다.
    if (names.has(name)) return false;
    names.add(name);
    if (name === 'max-age') {
      let seconds = match[2] ?? '';
      // §6.1.1은 quoted-string을 해제한 뒤 숫자인 max-age도 허용합니다.
      if (/^"(?:[\x20-\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/.test(seconds)) seconds = seconds.slice(1, -1).replace(/\\([\x20-\x7e])/g, '$1');
      if (maximumAge !== null || !/^\d+$/.test(seconds)) return false;
      maximumAge = Number(seconds);
      if (!Number.isSafeInteger(maximumAge)) return false;
    } else if (name === 'includesubdomains' || name === 'preload') {
      if (match[2] !== undefined) return false;
    } else {
      // 알려지지 않은 확장도 문법이 명확한 token 또는 quoted-string일 때만 허용합니다.
      if (match[2] !== undefined && !/^(?:[!#$%&'*+.^_`|~0-9A-Za-z-]+|"(?:[\x20-\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*")$/.test(match[2])) return false;
    }
  }
  return maximumAge !== null && maximumAge >= 31536000;
}


// #413: 공개 색인 정책은 운영 Production 응답의 고정된 최소 계약으로 확인한다.
// robots.txt는 접근 제어가 아니며, 정본 권한 정책은 애플리케이션에서 검사한다.
function validRobots(value, origin) {
  const lines = new Set(value.split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(Boolean));
  const required = [
    'user-agent: *', 'allow: /', 'disallow: /admin', 'disallow: /member',
    'disallow: /mypage', 'disallow: /resources', 'disallow: /login',
    'disallow: /register', 'disallow: /pending', 'disallow: /system-error',
    'disallow: /api/', 'sitemap: ' + origin.toLowerCase() + '/sitemap.xml',
  ];
  return required.every(line => lines.has(line)) && !lines.has('disallow: /');
}

// sitemap의 원문은 출력·저장하지 않고 origin과 보호 경로 누락 여부만 확인한다.
function validSitemap(value, origin) {
  if (!/<urlset(?:\s|>)/.test(value)) return false;
  const locations = [...value.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  if (!locations.includes(origin + '/')) return false;
  const privatePrefixes = ['/admin', '/member', '/mypage', '/resources', '/login', '/register', '/pending', '/system-error', '/api', '/academic'];
  return locations.every(location => {
    let url;
    try { url = new URL(location); } catch { return false; }
    return url.origin === origin && !url.search && !url.hash
      && !privatePrefixes.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix + '/'));
  });
}

// 각 검사는 응답 헤더·원문·예외 메시지를 외부로 내보내지 않는다.
async function checkPath(origin, path, timeoutMs, requireHsts) {
  const started = performance.now();
  let status = null;
  let code = 'NETWORK';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}${path}`, {
      method: 'GET', credentials: 'omit', redirect: 'manual', signal: controller.signal,
    });
    status = response.status;
    if (requireHsts && !validHsts(response.headers.get('strict-transport-security'))) {
      await response.body?.cancel();
      code = 'HSTS_INVALID';
    } else if (status !== 200) {
      await response.body?.cancel();
      code = 'HTTP_STATUS';
    } else {
      const bytes = await readBounded(response);
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (bytes === null) code = 'BODY_LIMIT';
      else if (path === '/favicon.ico') {
        if (!['image/x-icon', 'image/vnd.microsoft.icon'].includes(contentType)) code = 'CONTENT_TYPE';
        else code = bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0 && (bytes[4] !== 0 || bytes[5] !== 0) ? 'OK' : 'CONTENT';
      } else if (path === '/api/health') {
        if (contentType !== 'application/json') code = 'CONTENT_TYPE';
        else {
          try {
            const value = JSON.parse(new TextDecoder().decode(bytes));
            code = value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && value.status === 'ok' ? 'OK' : 'HEALTH_CONTENT';
          } catch { code = 'HEALTH_CONTENT'; }
        }
      } else if (path === '/robots.txt') {
        if (contentType !== 'text/plain') code = 'CONTENT_TYPE';
        else code = validRobots(new TextDecoder().decode(bytes), origin) ? 'OK' : 'SEO_CONTENT';
      } else if (path === '/sitemap.xml') {
        if (!['application/xml', 'text/xml'].includes(contentType)) code = 'CONTENT_TYPE';
        else code = validSitemap(new TextDecoder().decode(bytes), origin) ? 'OK' : 'SEO_CONTENT';
      } else if (contentType !== 'text/html') code = 'CONTENT_TYPE';
      else {
        const html = new TextDecoder().decode(bytes);
        code = /<html\b[^>]*\s+lang\s*=\s*["']ko["']/i.test(html) && /HRA/i.test(html) ? 'OK' : 'CONTENT';
      }
    }
  } catch { code = controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'; }
  finally { clearTimeout(timer); }
  return { path, status, ok: code === 'OK', code, durationMs: Math.round(performance.now() - started) };
}

/** 고정된 여섯 경로를 최대 두 개씩 검사하고 민감 정보가 없는 결과만 반환한다. */
export async function runProductionSmoke({ origin = productionSmokeOrigin, sha, shaKind = 'main', fixture = false, timeoutMs = 15000 } = {}) {
  validateOptions({ origin, sha, shaKind, fixture, timeoutMs });
  const startedAt = new Date().toISOString();
  const checks = [];
  for (let index = 0; index < paths.length; index += 2) {
    checks.push(...await Promise.all(paths.slice(index, index + 2).map((path) => checkPath(origin, path, timeoutMs, !fixture))));
  }
  return {
    environment: fixture ? 'fixture' : 'Production', sha: sha.toLowerCase(), shaKind,
    startedAt, completedAt: new Date().toISOString(), ok: checks.every((check) => check.ok), checks,
    limitations: [
      '소스 SHA는 실제 서비스 중인 배포 버전의 증거가 아닙니다.',
      '공개 HTTP 응답만 검사하며 OAuth 로그인과 쓰기 작업은 수행하지 않습니다.',
      '알림은 실행 결과와 작업 요약에만 기록하며 개인 이메일 전달을 보장하지 않습니다.',
    ],
  };
}

/** 운영자가 실패 경로와 조치 문서를 바로 확인할 수 있는 작업 요약이다. */
export function renderProductionSmokeSummary(report) {
  return [
    `## 공개 서비스 스모크 검사: ${report.ok ? '성공' : '실패'}`,
    '', `- 환경: ${report.environment}`, `- 소스 SHA (${report.shaKind}): \`${report.sha}\``,
    ...report.checks.filter((check) => !check.ok).map((check) => `- 실패: \`${check.path}\` — \`${check.code}\``),
    '', ...report.limitations.map((value) => `- ${value}`),
    '', `[운영 담당자 조치 절차](${procedure})`, '',
  ].join('\n');
}

// 명령줄 입력도 제한된 옵션만 허용한다. 환경 변수는 작업 요약 경로 하나만 읽는다.
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let output;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--fixture') { options.fixture = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error('INVALID_ARGUMENT');
    if (flag === '--sha') options.sha = value;
    else if (flag === '--sha-kind') options.shaKind = value;
    else if (flag === '--fixture-origin') options.origin = value;
    else if (flag === '--output') output = value;
    else throw new Error('INVALID_ARGUMENT');
  }
  if (options.origin && !options.fixture) throw new Error('INVALID_ORIGIN');
  const report = await runProductionSmoke(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(output, json);
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, renderProductionSmokeSummary(report));
  process.stdout.write(json);
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('PRODUCTION_SMOKE_FAILED\n'); process.exitCode = 1; });
}
