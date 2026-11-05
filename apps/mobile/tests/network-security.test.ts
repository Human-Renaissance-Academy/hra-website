/** CNG 플러그인의 생성 리소스를 임시 디렉터리에서 검사하여 debug/release 보안 경계를 고정합니다. */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('release 기본 리소스는 HTTP를 거부하고 debug 리소스만 허용한다', async () => {
  // 준비: Expo mod 래퍼만 대체하며 실제 플러그인과 파일 쓰기는 그대로 실행합니다.
  const directory = await mkdtemp(path.join(tmpdir(), 'hra-mobile-network-'));
  let generate: ((value: { modRequest: { platformProjectRoot: string } }) => Promise<unknown>) | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo/config-plugins', () => ({
      withAndroidManifest: (config: unknown) => config,
      withDangerousMod: (config: unknown, [, action]: readonly [string, typeof generate]) => {
        generate = action;
        return config;
      },
    }));
    const plugin = jest.requireActual<(config: object) => unknown>('../plugins/with-network-security.cjs');
    plugin({});
  });
  try {
    if (!generate) throw new Error('네트워크 리소스 생성 mod가 등록되지 않았습니다.');
    // 실행: 실제 prebuild와 동일한 리소스 생성 함수를 호출합니다.
    await generate({ modRequest: { platformProjectRoot: directory } });
    // 검증: 기본 리소스에는 평문 허용이 없고 debug 소스 세트에만 허용이 존재합니다.
    expect(await readFile(path.join(directory, 'app/src/main/res/xml/network_security_config.xml'), 'utf8')).toContain('cleartextTrafficPermitted="false"');
    expect(await readFile(path.join(directory, 'app/src/debug/res/xml/network_security_config.xml'), 'utf8')).toContain('cleartextTrafficPermitted="true"');
  } finally {
    await rm(directory, { recursive: true, force: true });
    jest.dontMock('expo/config-plugins');
  }
});
