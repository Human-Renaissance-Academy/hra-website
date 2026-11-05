/**
 * Android 권한 정책 회귀입니다. 앱이 쓰지 않는 권한은 `app.config.ts`의 blockedPermissions로 병합 매니페스트에서 제거해야 하고,
 * 앱 동작에 필요한 INTERNET 권한은 차단하면 안 됩니다.
 *
 * Expo 기본 템플릿의 main 매니페스트는 SYSTEM_ALERT_WINDOW(다른 앱 위에 그리기)를 포함하므로 차단하지 않으면 release에도 남습니다.
 * debug 빌드의 개발 도구 오버레이는 debug 소스 세트 매니페스트가 따로 제공하므로 차단 목록과 무관합니다.
 */
import config from '../app.config';

const blocked = config.android?.blockedPermissions ?? [];

test('쓰지 않는 민감 권한(오버레이·생체 인증·외부 저장소)은 모두 차단 목록에 있다', () => {
  // Given: app.config.ts의 Android 설정
  // Then: 앱이 사용하지 않는 권한이 병합 매니페스트에서 제거되도록 차단된다.
  expect(blocked).toEqual(
    expect.arrayContaining([
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]),
  );
});

test('앱 동작에 필요한 INTERNET 권한은 차단하지 않는다', () => {
  // Given: 차단 목록
  // Then: 네트워크 권한을 실수로 제거하면 앱이 서버와 통신할 수 없으므로 포함하지 않는다.
  expect(blocked).not.toContain('android.permission.INTERNET');
});
