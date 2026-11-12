/** 생성된 Gradle wrapper를 Android 디렉터리에서 실행하고 실제 종료 코드를 전달합니다. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync('./gradlew', ['assembleDebug', '--no-daemon', '--max-workers=2'], {
  cwd: fileURLToPath(new URL('../android', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
