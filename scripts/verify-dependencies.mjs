#!/usr/bin/env node
/** 공개 npm registry만 사용해 lock 기반 audit를 실행한다. 통신 오류나 원문 오류/응답을 CI 로그에 출력하지 않는다. */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyDiagnosticLines, verifyDependencyPolicy } from './_lib/dependency-policy.mjs';
// 검사 대상 lockfile과 검토 원장. 모바일 앱은 루트와 별도로 설치되므로 자체 원장으로 같은 정책을 적용한다(#446).
// 대상 하나가 실패해도 나머지를 계속 검사해 모든 불일치를 한 번에 보이고, 하나라도 실패하면 종료 코드 1로 차단한다.
const targets = [
  { name: 'root', directory: '../', policy: '../security/dependency-triage.json' },
  { name: 'mobile', directory: '../apps/mobile/', policy: '../security/mobile-dependency-triage.json' },
];
const temporaries = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { for (const path of temporaries) rmSync(path, { recursive: true, force: true }); process.exit(1); });
/** 대상 하나의 package/lock 복사본을 소유 임시 디렉터리에서 감사하고 원장과 대조한다. */
function verifyTarget(target) {
  const temporary = mkdtempSync(join(tmpdir(), 'hra-dependency-audit-'));
  temporaries.add(temporary);
  try {
    for (const name of ['package.json', 'package-lock.json']) writeFileSync(join(temporary, name), readFileSync(new URL(target.directory + name, import.meta.url)), { mode: 0o600 });
    writeFileSync(join(temporary, 'user.npmrc'), ''); writeFileSync(join(temporary, 'global.npmrc'), '');
    const environment = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, SystemRoot: process.env.SYSTEMROOT, LANG: 'C', npm_config_userconfig: join(temporary, 'user.npmrc'), npm_config_globalconfig: join(temporary, 'global.npmrc'), npm_config_cache: join(temporary, 'cache') };
    const run = spawnSync('npm', ['audit', '--json', '--package-lock-only', '--ignore-scripts', '--registry=https://registry.npmjs.org', '--fetch-retries=0', '--fetch-timeout=30000'], { cwd: temporary, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    if (run.error || ![0, 1].includes(run.status)) throw new Error('DEPENDENCY_AUDIT_FAILED');
    const audit = JSON.parse(run.stdout.toString('utf8'));
    if (audit.error) throw new Error('DEPENDENCY_AUDIT_FAILED');
    const lock = JSON.parse(readFileSync(new URL(target.directory + 'package-lock.json', import.meta.url), 'utf8'));
    const policy = JSON.parse(readFileSync(new URL(target.policy, import.meta.url), 'utf8'));
    return verifyDependencyPolicy(audit, lock, policy);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    temporaries.delete(temporary);
  }
}
if (process.argv.length !== 2) {
  for (const line of dependencyDiagnosticLines(new Error('DEPENDENCY_ARGUMENTS_INVALID'))) console.error(line);
  process.exitCode = 1;
} else {
  for (const target of targets) {
    try {
      console.log(JSON.stringify({ target: target.name, ...verifyTarget(target) }));
    } catch (error) {
      // 어느 lockfile에서 실패했는지 고정된 대상 이름만 붙이고, 진단은 기존과 같이 정제된 줄만 출력한다.
      console.error(`DEPENDENCY_TARGET ${target.name}`);
      for (const line of dependencyDiagnosticLines(error)) console.error(line);
      process.exitCode = 1;
    }
  }
}
