/**
 * CNG 네트워크 정책 플러그인입니다. 기본/release는 평문 통신을 거부합니다.
 * Android의 debuggable 플래그가 참인 debug 변형에만 로컬 개발 HTTP를 허용합니다.
 * 생성 파일은 직접 편집하지 않고 prebuild의 리소스 mod에서 매번 재현합니다.
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

module.exports = function withNetworkSecurity(config) {
  config = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android 애플리케이션 설정이 없습니다.');
    application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    application.$['android:usesCleartextTraffic'] = 'false';
    return result;
  });
  return withDangerousMod(config, ['android', async (result) => {
    const root = result.modRequest.platformProjectRoot;
    // 동일 리소스 이름을 소스 세트별로 생성하므로 release는 debug 정책을 포함하지 않습니다.
    for (const [variant, cleartext] of [['main', 'false'], ['debug', 'true']]) {
      const directory = path.join(root, 'app/src', variant, 'res/xml');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="${cleartext}"><trust-anchors><certificates src="system" /></trust-anchors></base-config></network-security-config>\n`);
    }
    return result;
  }]);
};
