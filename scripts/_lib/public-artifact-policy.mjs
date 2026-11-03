/**
 * 공개 업로드 직전 세 JSON 보고서의 닫힌 계약을 검사합니다.
 * 임의 본문·식별자·오류 문자열을 허용하지 않으며 완전한 개인정보 탐지를 보장하지 않습니다.
 */
export const publicArtifactKinds = Object.freeze(['expanded-public', 'authentication-measurement', 'production-smoke']);
export const publicArtifactByteLimit = 256 * 1024;
const reject = () => { throw new Error('PUBLIC_ARTIFACT_SCHEMA_INVALID'); };
const object = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) reject();
};
const exact = (value, expected) => { if (JSON.stringify(value) !== JSON.stringify(expected)) reject(); };
const choice = (value, values) => { if (!values.includes(value)) reject(); };
const number = (value, maximum = 1_800_000, integer = false) => { if (!Number.isFinite(value) || value < 0 || value > maximum || integer && !Number.isSafeInteger(value)) reject(); };
const bool = value => { if (typeof value !== 'boolean') reject(); };
const list = (value, maximum, check) => { if (!Array.isArray(value) || value.length > maximum) reject(); value.forEach(check); };
const digest = (value, length) => { if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) reject(); };
const timing = value => { object(value, ['p50', 'p95']); number(value.p50); number(value.p95); if (value.p50 > value.p95) reject(); };
const countDistribution = value => { object(value, ['total', 'p50', 'p95']); number(value.total, 100000, true); number(value.p50, 100000, true); number(value.p95, 100000, true); if (value.p50 > value.p95 || value.p95 > value.total) reject(); };

const browserFiles = { HOME: 'home.spec.ts', CALENDAR_390: 'home-calendar-responsive.spec.ts', CALENDAR_768: 'home-calendar-responsive.spec.ts', CALENDAR_800: 'home-calendar-responsive.spec.ts', CALENDAR_1024: 'home-calendar-responsive.spec.ts', CALENDAR_1280: 'home-calendar-responsive.spec.ts', KEYBOARD_HEADER: 'keyboard-navigation.spec.ts', KEYBOARD_CONTENT: 'keyboard-navigation.spec.ts', KEYBOARD_CALENDAR: 'keyboard-navigation.spec.ts', KEYBOARD_MOBILE_HEADER: 'keyboard-navigation.spec.ts', KEYBOARD_MOBILE_HEADER_768: 'keyboard-navigation.spec.ts', SEARCH_DRAFT: 'notice-search-history.spec.ts', SEARCH_BACK: 'notice-search-history.spec.ts', SEARCH_FORWARD: 'notice-search-history.spec.ts', HERO_CLS_390: 'home-hero-reduced-motion.spec.ts', HERO_CLS_768: 'home-hero-reduced-motion.spec.ts', HERO_CLS_1024: 'home-hero-reduced-motion.spec.ts', HERO_CLS_1280: 'home-hero-reduced-motion.spec.ts', HERO_REDUCED: 'home-hero-reduced-motion.spec.ts', HERO_SSR: 'home-hero-reduced-motion.spec.ts', FAQ_COLLAPSED: 'faq-accordion.spec.ts', FAQ_COLLAPSED_TAB: 'faq-accordion.spec.ts', FAQ_OPEN: 'faq-accordion.spec.ts', FAQ_CONTACT: 'faq-accordion.spec.ts' };
/** 공개 브라우저 모드에서는 HTTP 전수 검사 결과를 섞지 않습니다. */
function expanded(report) {
  object(report, ['sourceSha', 'scope', 'browser', 'completed', 'cleanupComplete', 'coverageHealthy', 'phase', 'limitations', 'summary', 'diagnostics', 'results']);
  if (report.sourceSha !== null) digest(report.sourceSha, 40);
  object(report.scope, ['appRoot', 'only', 'publicBrowser']);
  exact(report.scope, { appRoot: '.', only: null, publicBrowser: true });
  for (const key of ['completed', 'cleanupComplete', 'coverageHealthy']) bool(report[key]);
  choice(report.phase, ['INPUT', 'SCHEMA', 'BUILD', 'SERVER', 'AUTH', 'BROWSER_COLLECTION', 'BROWSER_EXECUTION', 'COMPLETE']);
  exact(report.limitations, ['실제 Blob 업로드·파일 스트림 미검증', '정상 CRUD·서버 액션 쓰기 미검증', '공개 6개 spec 외 브라우저는 별도 G1 검증 결과를 확인', '알려진 동적 경로 외 합성 식별자는 fixture 제약']);
  exact(report.summary, { routes: 0, records: 0, classifications: {} }); exact(report.results, []);
  list(report.diagnostics, 30, value => choice(value, ['STARTUP_RETRY', 'CHILD_SIGNAL_FAILED', 'CHILD_GROUP_EXIT_UNCONFIRMED', 'CHILD_START_FAILED', 'SERVER_ACTION_SERIALIZATION', 'CLIENT_FUNCTION_ON_SERVER', 'FORM_DATA_PARSE_FAILURE', 'AUTH_FAILURE', 'INTERRUPTED', 'RUN_TIMEOUT', 'SITE_ROUTE_EXECUTION_FAILED', 'SITE_ROUTE_DATABASE_CLEANUP_FAILED', 'SITE_ROUTE_BROWSER_FAILED', 'SITE_ROUTE_BROWSER_INCOMPLETE', 'SITE_ROUTE_BROWSER_CLEANUP_FAILED', 'SITE_ROUTE_BUILD_FAILED', 'SITE_ROUTE_BUILD_CLEANUP_FAILED', 'SITE_ROUTE_SERVER_NOT_READY']));
  if (report.browser === null) return;
  const browser = report.browser; object(browser, ['status', 'mode', 'required', 'collected', 'completed', 'cases']);
  choice(browser.status, ['passed', 'failed']); choice(browser.mode, ['list', 'run']); exact(browser.required, 24); number(browser.collected, 24, true); number(browser.completed, 24, true);
  const seen = new Set();
  list(browser.cases, 24, item => {
    object(item, ['file', 'caseId', 'line', 'status', 'errors']); choice(item.caseId, [...Object.keys(browserFiles), 'UNKNOWN']);
    choice(item.file, [...new Set(Object.values(browserFiles)), 'UNKNOWN']);
    if (item.caseId !== 'UNKNOWN' && browserFiles[item.caseId] !== item.file || seen.has(item.caseId)) reject(); seen.add(item.caseId);
    number(item.line, 100000, true); choice(item.status, ['collected', 'passed', 'failed']);
    list(item.errors, 20, error => { object(error, ['code', 'line']); choice(error.code, ['NETWORK_BLOCKED', 'TO_BE_VISIBLE', 'TO_HAVE_ATTRIBUTE', 'TO_BE_FOCUSED', 'TO_BE_LESS_THAN_OR_EQUAL', 'TO_HAVE_URL', 'TO_HAVE_VALUE', 'TO_HAVE_COUNT', 'TO_CONTAIN', 'TO_BE_DISABLED', 'TO_BE', 'TIMEOUT', 'OTHER']); number(error.line, 100000, true); });
  });
}
const scenarios = ['credentials', 'anonymous_public', 'anonymous_protected', 'member_page', 'admin_page', 'approver_page', 'academic_gate', 'faculty_action', 'population_1', 'population_25', 'population_100', 'population_200'];
const phases = ['PROXY', 'RSC', 'ACTION', 'ROUTE', 'LOGIN'];
const diagnosticSuffixes = ['ARGUMENTS', 'PG_BIN_REQUIRED', 'BASELINE_REF', 'LOCK_MISMATCH', 'COMMAND_FAILED', 'ENV_FILE', 'SCHEMA', 'BUILD_TIMEOUT', 'BUILD', 'SERVER', 'CSRF', 'LOGIN', 'IDENTITY', 'ACTION_MANIFEST', 'ACTION_RESULT', 'ACTION_WRITE', 'PENDING', 'STALE_PROTECTED_PAGE', 'STALE_SESSION', 'ROLE_REVOKE', 'PENDING_REVOKE', 'DATABASE_PRECONDITION', 'DATABASE_FAIL_CLOSED', 'PHASE_MISSING', 'PUBLIC_COST', 'GATE_QUERY', 'DATABASE_CLEANUP', 'EXECUTION_FAILED', 'INTERRUPTED', 'PARTIAL_AGGREGATE', 'PROCESS_CLEANUP', 'RUN_TIMEOUT', 'WORKTREE_CLEANUP', 'EVENT_INVALID', 'SOURCE_MISMATCH', ...scenarios.map(value => `${value.toUpperCase()}_STATUS`)];
/** 인증 보고서는 집계값과 고정 회귀 이름만 허용합니다. */
function authentication(report) {
  object(report, ['complete', 'cleanupComplete', 'stage', 'diagnostics', 'limits', 'runs']); bool(report.complete); bool(report.cleanupComplete);
  choice(report.stage, ['INPUT', 'SCHEMA', 'BUILD', 'SERVER', 'MEASURE', 'REGRESSIONS', 'AGGREGATE', 'COMPLETE']);
  list(report.diagnostics, 50, value => choice(value, diagnosticSuffixes.map(suffix => `AUTH_MEASURE_${suffix}`)));
  exact(report.limits, { serialIdentityPopulations: true, maximumPopulation: 200, maximumSamples: 50, httpIncludesRenderingAndAdapter: true, databaseCountsLogicalNeonPosts: true, productionLatencyOrCapacityClaim: false });
  const profiles = new Set();
  list(report.runs, 2, run => {
    object(run, ['profile', 'samplesPerScenario', 'population', 'complete', 'cleanupComplete', 'regressions', 'scenarios'], ['versions', 'sourceSha', 'worktreeClean', 'reusedBuild', 'lockHash']);
    choice(run.profile, ['baseline', 'current']); if (profiles.has(run.profile)) reject(); profiles.add(run.profile);
    number(run.samplesPerScenario, 50, true); number(run.population, 200, true); if (!run.samplesPerScenario || !run.population) reject(); bool(run.complete); bool(run.cleanupComplete);
    if (Object.hasOwn(run, 'sourceSha')) digest(run.sourceSha, 40); if (Object.hasOwn(run, 'lockHash')) digest(run.lockHash, 64);
    for (const key of ['worktreeClean', 'reusedBuild']) if (Object.hasOwn(run, key)) bool(run[key]);
    if (Object.hasOwn(run, 'versions')) {
      object(run.versions, ['node', 'nextVersion', 'authVersion', 'postgres']);
      for (const key of ['node', 'nextVersion', 'authVersion']) if (typeof run.versions[key] !== 'string' || !/^v?\d{1,3}\.\d{1,3}\.\d{1,3}(?:-(?:beta|canary|rc)\.\d{1,3})?$/.test(run.versions[key])) reject();
      if (typeof run.versions.postgres !== 'string' || !/^postgres \(PostgreSQL\) \d{1,3}(?:\.\d{1,3}){1,2}(?: \((?:Ubuntu|Debian) \d{1,3}(?:\.\d{1,3}){1,2}[-+~a-z0-9.]{0,60}\))?$/.test(run.versions.postgres)) reject();
    }
    object(run.regressions, [], ['identitySequence', 'concurrentIdentity', 'sessionVersion', 'roleRevocation', 'pendingRevocation', 'deletedUser', 'databaseErrorFailClosed']); Object.values(run.regressions).forEach(bool);
    const names = new Set();
    list(run.scenarios, 12, metric => {
      object(metric, ['scenario', 'requests', 'httpMs', 'authCalls', 'databaseRoundtrips', 'phases']); choice(metric.scenario, scenarios); if (names.has(metric.scenario)) reject(); names.add(metric.scenario);
      number(metric.requests, 200, true); timing(metric.httpMs); countDistribution(metric.authCalls);
      const db = metric.databaseRoundtrips; object(db, ['total', 'p50', 'p95', 'errorCount', 'errorRate', 'durationMs', 'kinds']); countDistribution({ total: db.total, p50: db.p50, p95: db.p95 }); number(db.errorCount, db.total, true); number(db.errorRate, 1); if (db.errorRate !== (db.total ? db.errorCount / db.total : 0)) reject(); timing(db.durationMs);
      object(db.kinds, ['rate_limit', 'credentials', 'session', 'other']); Object.values(db.kinds).forEach(value => number(value, 100000, true)); if (Object.values(db.kinds).reduce((a, b) => a + b, 0) !== db.total) reject();
      object(metric.phases, phases); for (const phase of phases) { object(metric.phases[phase], ['auth', 'db']); Object.values(metric.phases[phase]).forEach(value => number(value, 100000, true)); }
      if (phases.reduce((sum, phase) => sum + metric.phases[phase].auth, 0) !== metric.authCalls.total || phases.reduce((sum, phase) => sum + metric.phases[phase].db, 0) !== db.total) reject();
    });
  });
}
/** 운영 실패 fixture도 같은 공개 상태 계약으로 검사하고 원문 오류를 허용하지 않습니다. */
function smoke(report) {
  object(report, ['environment', 'sha', 'shaKind', 'startedAt', 'completedAt', 'ok', 'checks', 'limitations']); choice(report.environment, ['Production', 'fixture']); digest(report.sha, 40); choice(report.shaKind, report.environment === 'fixture' ? ['fixture'] : ['main', 'deployment']); bool(report.ok);
  for (const key of ['startedAt', 'completedAt']) if (typeof report[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report[key]) || new Date(report[key]).toISOString() !== report[key]) reject();
  if (report.completedAt < report.startedAt) reject();
  if (!Array.isArray(report.checks) || report.checks.length !== 4) reject();
  report.checks.forEach((check, index) => {
    object(check, ['path', 'status', 'ok', 'code', 'durationMs']); exact(check.path, ['/', '/login', '/favicon.ico', '/api/health'][index]);
    if (check.status !== null) { number(check.status, 599, true); if (check.status < 100) reject(); }
    bool(check.ok); choice(check.code, ['NETWORK', 'HTTP_STATUS', 'BODY_LIMIT', 'CONTENT_TYPE', 'CONTENT', 'OK', 'HEALTH_CONTENT', 'TIMEOUT', 'HSTS_INVALID']); if (check.ok !== (check.code === 'OK') || check.ok && check.status !== 200) reject(); number(check.durationMs);
  });
  if (report.ok !== report.checks.every(check => check.ok)) reject();
  exact(report.limitations, ['소스 SHA는 실제 서비스 중인 배포 버전의 증거가 아닙니다.', '공개 HTTP 응답만 검사하며 OAuth 로그인과 쓰기 작업은 수행하지 않습니다.', '알림은 실행 결과와 작업 요약에만 기록하며 개인 이메일 전달을 보장하지 않습니다.']);
}
/** 자유 문자열을 허용하지 않는 스키마 외에 대표적인 유출 패턴도 별도로 거부합니다. */
export function validatePublicArtifact(kind, report) {
  choice(kind, publicArtifactKinds);
  const serialized = JSON.stringify(report);
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > publicArtifactByteLimit) reject();
  if (/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{8}-\d{4}-\d{4}-\d{4}-\d{12}\b|\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|https?:\/\/|postgres(?:ql)?:\/\/|(?:set-cookie|authorization|bearer|password|secret|token|cookie)\s*[:=])/i.test(serialized)) reject();
  ({ 'expanded-public': expanded, 'authentication-measurement': authentication, 'production-smoke': smoke })[kind](report);
  return true;
}
