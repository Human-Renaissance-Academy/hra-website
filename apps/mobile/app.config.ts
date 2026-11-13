/**
 * HRA 공통 네이티브 설정입니다. Android/iOS 디렉터리는 이 설정으로 재생성합니다.
 * 비밀 값은 포함하지 않으며 운영 API 주소는 빌드 시 명시적으로 주입해야 합니다.
 */
import type { ExpoConfig } from "expo/config";

// PLACEHOLDER: 첫 Play 업로드 전에 소유자가 확인해야 합니다. Play 패키지 ID는 이후 변경할 수 없습니다.
const ANDROID_PACKAGE_PLACEHOLDER = "com.hra.mobile";
// 승인된 application ID·bundle ID는 환경별로 독립 설정합니다. 기본 placeholder로 store 빌드하지 않습니다.
// EAS 프로젝트 ID는 공개 UUID이지만 조직 프로젝트에 연결되므로 명시적 입력 없이는 EAS 원격 빌드를 시작하지 않습니다.
const androidApplicationId = process.env.HRA_ANDROID_APPLICATION_ID?.trim();
const iosBundleIdentifier = process.env.HRA_IOS_BUNDLE_IDENTIFIER?.trim();
const easProjectId = process.env.EXPO_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: "HRA",
  slug: "hra",
  scheme: "hra",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  android: {
    package: androidApplicationId || ANDROID_PACKAGE_PLACEHOLDER,
    versionCode: 1,
    // 앱이 사용하지 않는 권한은 매니페스트 병합 단계에서 제거합니다(Play 심사와 개인정보 최소화).
    // - SYSTEM_ALERT_WINDOW(다른 앱 위에 그리기)는 Expo 기본 main 매니페스트가 넣는 개발용 권한이라 release에는 필요 없습니다.
    //   debug 빌드의 개발 도구 오버레이는 debug 소스 세트 매니페스트가 따로 제공하므로 차단해도 영향이 없습니다.
    // - 생체 인증은 쓰지 않고(SecureStore는 requireAuthentication 없이 사용), 파일은 앱 캐시와 시스템 문서 선택기만 사용합니다.
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/monochrome-icon.png",
      backgroundColor: "#2563EB",
    },
  },
  ios: {
    ...(iosBundleIdentifier ? { bundleIdentifier: iosBundleIdentifier } : {}),
    supportsTablet: true,
    infoPlist: { CFBundleDevelopmentRegion: "ko", CFBundleLocalizations: ["ko"] },
  },
  ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
  plugins: ["expo-router", "expo-secure-store", "./plugins/with-network-security.cjs"],
};

export default config;
