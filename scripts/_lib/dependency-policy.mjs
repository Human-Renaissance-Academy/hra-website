/** npm advisory의 정확한 집합과 lock 경로를 검토 원장과 대조한다. npm severity를 HRA P1로 자동 변환하지 않는다. */
const severities = new Set(['low', 'moderate', 'high', 'critical']);
const canonical = value => JSON.stringify(value);
const safeLabel = value => typeof value === 'string' && /^[A-Za-z0-9@/._-]{1,240}$/.test(value) ? value : '[redacted]';
// 달력에 존재하지 않는 날짜를 기한으로 사용해 만료 검사를 우회하지 못하게 한다.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
/** nodes와 advisory는 독립 집합이다. 둘을 곱해 확인되지 않은 설치 경로를 만들지 않는다. */
export function dependencySnapshot(audit, lock) {
  if (!audit || audit.auditReportVersion !== 2 || audit.error || !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object' || Array.isArray(audit.vulnerabilities) || !lock?.packages) throw new Error('DEPENDENCY_REPORT_INVALID');
  return Object.entries(audit.vulnerabilities).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => {
    if (item.name !== name || !severities.has(item.severity) || typeof item.range !== 'string' || !Array.isArray(item.nodes) || !item.nodes.length || !Array.isArray(item.via) || !item.via.length) throw new Error('DEPENDENCY_REPORT_INVALID');
    const nodes = item.nodes.map(path => {
      if (typeof path !== 'string' || !path.startsWith('node_modules/') || !lock.packages[path]?.version) throw new Error('DEPENDENCY_LOCK_MISMATCH');
      return { path, version: lock.packages[path].version, development: lock.packages[path].dev === true };
    }).sort((a, b) => a.path.localeCompare(b.path));
    const via = item.via.map(advisory => {
      if (typeof advisory === 'string' && advisory) return { dependency: advisory };
      if (!advisory || !Number.isSafeInteger(advisory.source) || !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9-]+$/.test(advisory.url) || !severities.has(advisory.severity) || typeof advisory.range !== 'string' || typeof advisory.title !== 'string') throw new Error('DEPENDENCY_REPORT_INVALID');
      return { source: advisory.source, id: advisory.url.split('/').at(-1), severity: advisory.severity, range: advisory.range, title: advisory.title };
    }).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    return { name, severity: item.severity, range: item.range, nodes, via };
  });
}
/** 불일치 진단에는 패키지·권고 ID·설치 경로만 넣고 감사 원문/영향 범위/버전은 출력하지 않는다. */
function dependencyChanges(snapshot, recorded) {
  if (!recorded.every(pkg => pkg && typeof pkg.name === 'string'
    && Array.isArray(pkg.nodes) && pkg.nodes.every(node => node && typeof node.path === 'string')
    && Array.isArray(pkg.via) && pkg.via.every(via => via && (typeof via.id === 'string' || typeof via.dependency === 'string')))) return [];
  const changes = [];
  const add = (kind, packageName, fields = {}) => changes.push({ kind, package: safeLabel(packageName), ...fields });
  const actualPackages = new Map(snapshot.map(pkg => [pkg.name, pkg]));
  const recordedPackages = new Map(recorded.map(pkg => [pkg.name, pkg]));
  for (const name of new Set([...actualPackages.keys(), ...recordedPackages.keys()])) {
    const actual = actualPackages.get(name);
    const expected = recordedPackages.get(name);
    if (!actual || !expected) { add(actual ? 'PACKAGE_ONLY_IN_AUDIT' : 'PACKAGE_ONLY_IN_POLICY', name); continue; }
    if (actual.severity !== expected.severity || actual.range !== expected.range) add('PACKAGE_METADATA_CHANGED', name);
    const actualNodes = new Map(actual.nodes.map(node => [node.path, node]));
    const recordedNodes = new Map(expected.nodes.map(node => [node.path, node]));
    for (const path of new Set([...actualNodes.keys(), ...recordedNodes.keys()])) {
      const current = actualNodes.get(path);
      const previous = recordedNodes.get(path);
      if (!current || !previous) add(current ? 'NODE_ONLY_IN_AUDIT' : 'NODE_ONLY_IN_POLICY', name, { path: safeLabel(path) });
      else if (canonical(current) !== canonical(previous)) add('NODE_METADATA_CHANGED', name, { path: safeLabel(path) });
    }
    const key = via => via.id ? `advisory:${via.source}:${via.id}` : `dependency:${via.dependency}`;
    const actualVia = new Map(actual.via.map(via => [key(via), via]));
    const recordedVia = new Map(expected.via.map(via => [key(via), via]));
    for (const viaKey of new Set([...actualVia.keys(), ...recordedVia.keys()])) {
      const current = actualVia.get(viaKey);
      const previous = recordedVia.get(viaKey);
      const item = current ?? previous;
      const fields = item.id
        ? { id: safeLabel(item.id), ...(Number.isSafeInteger(item.source) && item.source >= 0 ? { source: item.source } : {}) }
        : { dependency: safeLabel(item.dependency) };
      const prefix = item.id ? 'ADVISORY' : 'DEPENDENCY';
      if (!current || !previous) add(`${prefix}_ONLY_IN_${current ? 'AUDIT' : 'POLICY'}`, name, fields);
      else if (canonical(current) !== canonical(previous)) add(`${prefix}_METADATA_CHANGED`, name, fields);
    }
  }
  // 배열 순서·중복처럼 위의 키 비교로 포착되지 않은 차이도 조용히 지나가지 않는다.
  if (!changes.length) changes.push({ kind: 'SNAPSHOT_CHANGED' });
  changes.sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return changes.length > 20 ? [...changes.slice(0, 20), { kind: 'MORE_CHANGES', count: changes.length - 20 }] : changes;
}

/** CLI는 정제한 코드와 진단만 기록한다. 네트워크 오류·감사 원문은 로그에 남기지 않는다. */
export function dependencyDiagnosticLines(error) {
  if (!(error instanceof Error) || !/^DEPENDENCY_[A-Z_]+$/.test(error.message)) return ['DEPENDENCY_CHECK_FAILED'];
  const lines = [error.message];
  if (['DEPENDENCY_TRIAGE_CHANGED', 'DEPENDENCY_LOCK_REGISTRY_INVALID'].includes(error.message) && Array.isArray(error.diagnostics)) {
    for (const item of error.diagnostics) lines.push(`DEPENDENCY_CHANGE ${canonical(item)}`);
  }
  return lines;
}
// 공유 사용 맥락과 권고별 판단은 닫힌 필드 집합으로 검증해 예전 중복 필드나 미검토 설명을 허용하지 않는다.
const contextFields = ['usedApi', 'callLocations', 'assessment', 'residualAssumptions'];
const contextKeys = ['assessment', 'callLocations', 'id', 'residualAssumptions', 'usedApi'].join(',');
const assessmentKeys = ['attackCondition', 'contextId', 'key', 'owner', 'priority', 'reviewBy', 'reviewedOn'].join(',');
/** 모든 lock `resolved`가 공식 npm registry를 가리키는지 확인한다(워크스페이스 link 제외). 외부 피드 주소는 출력하지 않고 설치 경로만 진단한다(#432). */
export function lockRegistryViolations(lock) {
  if (!lock?.packages || typeof lock.packages !== 'object') throw new Error('DEPENDENCY_REPORT_INVALID');
  return Object.entries(lock.packages)
    .filter(([, pkg]) => pkg && pkg.link !== true && pkg.resolved !== undefined && !(typeof pkg.resolved === 'string' && pkg.resolved.startsWith('https://registry.npmjs.org/')))
    .map(([path]) => ({ kind: 'RESOLVED_NOT_OFFICIAL_REGISTRY', path: safeLabel(path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
/** 변경/누락/만료/미분류/P1은 차단한다. 공유 맥락은 검토 책임과 위험 수용 권한을 대체하지 않는다. */
export function verifyDependencyPolicy(audit, lock, policy, today = new Date().toISOString().slice(0, 10)) {
  const registryViolations = lockRegistryViolations(lock);
  if (registryViolations.length) {
    const error = new Error('DEPENDENCY_LOCK_REGISTRY_INVALID');
    error.diagnostics = registryViolations.slice(0, 20);
    throw error;
  }
  const snapshot = dependencySnapshot(audit, lock);
  if (!policy || policy.schemaVersion !== 2 || !Array.isArray(policy.packages)
    || !Array.isArray(policy.contexts) || !Array.isArray(policy.assessments)) throw new Error('DEPENDENCY_TRIAGE_CHANGED');
  if (canonical(snapshot) !== canonical(policy.packages)) {
    const error = new Error('DEPENDENCY_TRIAGE_CHANGED');
    error.diagnostics = dependencyChanges(snapshot, policy.packages);
    throw error;
  }
  const contexts = new Map();
  const contextTexts = new Set();
  for (const item of policy.contexts) {
    if (!item || Object.keys(item).sort().join(',') !== contextKeys
      || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{1,50}$/.test(item.id) || contexts.has(item.id)
      || contextFields.some(field => typeof item[field] !== 'string' || item[field].trim().length < 15)) throw new Error('DEPENDENCY_TRIAGE_INVALID');
    const text = canonical(contextFields.map(field => item[field]));
    if (contextTexts.has(text)) throw new Error('DEPENDENCY_TRIAGE_INVALID');
    contextTexts.add(text);
    contexts.set(item.id, item);
  }
  // 한 패키지가 버전이 다른 같은 이름의 전이 패키지를 여러 경로에 두면 npm은 같은 `dependency` 링크를 중복해 보고한다.
  // 링크 자체는 위의 snapshot 정확 일치로 이미 고정했으므로, 평가 키는 중복을 합쳐 한 번만 요구한다(#446 모바일 lock).
  // advisory 키는 source 번호를 포함하므로 서로 다른 권고가 합쳐지지 않는다.
  const required = [...new Set(snapshot.flatMap(pkg => pkg.via.map(via => `${pkg.name}:${via.source ?? via.dependency}`)))];
  if (policy.assessments.some(item => !item || typeof item.key !== 'string')) throw new Error('DEPENDENCY_TRIAGE_MISSING');
  if (policy.assessments.length !== required.length || new Set(policy.assessments.map(item => item.key)).size !== required.length) throw new Error('DEPENDENCY_TRIAGE_MISSING');
  const usedContexts = new Set();
  for (const key of required) {
    const item = policy.assessments.find(entry => entry.key === key);
    if (!item || Object.keys(item).sort().join(',') !== assessmentKeys
      || item.priority !== 'P2' || item.owner !== 'repo-maintainers'
      || !validDate(item.reviewedOn) || !validDate(item.reviewBy) || !validDate(today)
      || item.reviewedOn > today || item.reviewBy < today || item.reviewedOn > item.reviewBy
      || typeof item.attackCondition !== 'string' || item.attackCondition.trim().length < 15
      || !contexts.has(item.contextId)) throw new Error('DEPENDENCY_TRIAGE_INVALID');
    usedContexts.add(item.contextId);
  }
  if (usedContexts.size !== contexts.size) throw new Error('DEPENDENCY_TRIAGE_INVALID');
  return { affectedPackages: snapshot.length, advisoryEntries: snapshot.reduce((sum, item) => sum + item.via.filter(via => via.source).length, 0), p1: 0 };
}
