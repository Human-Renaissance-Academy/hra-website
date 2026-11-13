/** 실제 Android 실행 래퍼를 격리된 Gradle 대역으로 실행해 진단 인자와 종료 코드 전달을 검증합니다. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

describe('Android 빌드 실행 계약', () => {
  for (const exitCode of [0, 17]) test(`Gradle의 종료 코드 ${exitCode}와 진단 출력을 전달한다`, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'hra-mobile-gradle-contract-'));
    try {
      const scripts = join(temporary, 'scripts');
      const android = join(temporary, 'android');
      const trace = join(temporary, 'trace.json');
      mkdirSync(scripts);
      mkdirSync(android);
      copyFileSync(fileURLToPath(new URL('../../apps/mobile/scripts/build-android.mjs', import.meta.url)), join(scripts, 'build-android.mjs'));
      // SDK·네트워크를 사용하지 않고 자식 프로세스가 받은 인자·작업 디렉터리만 기록합니다.
      writeFileSync(join(android, 'gradlew'), [
        '#!/usr/bin/env node',
        `require('node:fs').writeFileSync(${JSON.stringify(trace)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));`,
        "console.log('GRADLE_CONTRACT_STDOUT');",
        "console.error('GRADLE_CONTRACT_STDERR');",
        `process.exitCode = ${exitCode};`,
      ].join('\n'), { mode: 0o700 });

      const result = spawnSync(process.execPath, [join(scripts, 'build-android.mjs')], {
        // 실제 래퍼가 호출한 Node 대역에도 현재 검증 중인 Node 실행 파일을 사용합니다.
        env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` },
        encoding: 'utf8',
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, exitCode);
      assert.deepEqual(JSON.parse(readFileSync(trace, 'utf8')), {
        args: ['assembleDebug', '--no-daemon', '--max-workers=2', '--stacktrace', '--console=plain'],
        cwd: realpathSync(android),
      });
      assert.match(result.stdout, /GRADLE_CONTRACT_STDOUT/);
      assert.match(result.stderr, /GRADLE_CONTRACT_STDERR/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
