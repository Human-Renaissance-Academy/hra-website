# HRA 모바일 앱 (apps/mobile)

## 보안 정본 (2026-10-31)

이 절은 아래의 초기 구현 기록보다 우선합니다. 현재 다섯 탭·과제·파일 화면이 연결되어 있으며 출시 승인을 뜻하지는 않습니다.

- **리다이렉트:** API·인증·보호 다운로드는 `fetch(request, {redirect:'error', credentials:'omit', signal})`의 INIT에서 거부합니다. RN Request에만 넣지 않습니다. Node Blob fetch도 같은 정책입니다. **Expo `File.upload`는 redirect/retry 옵션이 없어 거부를 강제할 수 없습니다.** 설치된 `NetworkTasks.types.ts:97-150`, Android `FileSystemUploadTask.kt:42-54,73-77`이 근거이며 native 설정 변경 없이 해결했다고 주장하지 않습니다.
- **시도와 멱등성:** JS는 변이·Blob PUT·모호한 실패를 자동 재시도하지 않는 한 번의 논리적 시도만 합니다. 네이티브 OkHttp 연결 복구는 투명하게 재전송할 수 있습니다(`NativeRequest.kt:39-49`, `FileSystemUploadTask.kt:73-77`). wire 1회 보장은 없습니다. intent는 requestId, finalize는 submissionKey, Blob은 단일 사용 토큰과 **항상 뒤따르는 verify**, logout 계열은 세션 해지 멱등성에 의존합니다. 같은 refresh 요청의 중복 전달은 서버 10초 leeway에서 401이며 새 토큰을 얻었다고 추정하거나 자동 재전송하지 않고 재로그인이 필요한 모호한 실패로 취급합니다. 기존 세션 기계는 401에서 로컬 세션을 닫습니다.
- **본문 수명:** HTTP 타이머·호출자 AbortSignal은 헤더가 아니라 본문 완료·실패·취소 때 해제합니다. 스트림 취소도 underlying fetch controller를 중단합니다. Expo `fetch.ts:86-90`은 signal을 native request.cancel에 연결하지만 실제 소켓 종료는 기기 검증 대상입니다.
- **계정 수명:** `app/_layout.tsx`의 AuthProvider 안 `AccountLifecycle`이 한 번 소유합니다. 승인 경로 그룹의 언마운트와 무관합니다. 세대 변경을 동기적으로 캡처하고 이전 resume 핸들을 무효화한 뒤 전송 종료→캐시·이전 계정 기록 삭제 순서로 처리합니다. `ready()`는 이전 정리를 기다리며 삭제 실패 시 보호 작업을 차단합니다. 재개 read/write/clear는 세대별 직렬 큐를 통과합니다. `dispose()`는 등록 전송과 저장 정리를 기다립니다. React effect 해제 자체는 await할 수 없으며 반환된 비동기 drain이 계속 실행됩니다.
- **수신·캐시 상한:** JSON/오류 본문 실제 수신량 2 MiB, 보호 다운로드 50 MiB, 보호 캐시 200 MiB·20개입니다. Content-Length가 없거나 거짓이어도 실제 바이트 수로 제한합니다. 새 다운로드는 직렬화하고 최대 파일 크기를 예약하여 오래된 수정 시각 순으로 먼저 제거합니다. 앱 시작에는 이전 프로세스의 보호 캐시 전체와 `hra-submissions` 전체를 지웁니다(과거 24시간 보존 기록보다 우선).
- **선택 사본:** 승인된 사본은 `hra-submissions/<account>/`로 이동합니다. picker 반환 시 화면·세대·계정을 재검사하고 늦은 결과는 삭제합니다. 이동 후에도 다시 검사합니다. 기기 저장 장치 삭제 실패까지 물리적 삭제를 보장하지는 않습니다.
- **Markdown:** 입력 100,000자·5,000줄, 공유 탐색 작업 600,000단위와 보수적 AST 할당 2,000단위 상한을 사용합니다. 깊이·블록·표 열 제한도 유지합니다. 모든 인라인 재귀·목록·표는 같은 예산을 쓰며 초과 시 남은 인라인은 평문, 이후 블록은 생략합니다. 공백 run은 한 번 소비하고 suffix 탐색은 실행 전 최악 비용을 차감합니다. `useMemo`로 동일 source의 재파싱을 막습니다.
- **이미지:** 자격증명 없는 HTTPS 중 API origin 호스트 또는 `.public.blob.vercel-storage.com` 하위 호스트만 문서당 최대 20개 자동 로드합니다(동일 URL 반복도 노드별 집계). 다른 HTTPS와 예산 초과 이미지는 alt와 **이미지 불러오기** 버튼을 표시하며 탭 전 Image를 마운트하지 않습니다. 비HTTPS·자격증명 URL은 버튼도 없습니다. 승인 Blob suffix는 요청된 정책이며 웹 정본의 단일 projectBlobHost보다 넓습니다.
- **기기 없이는 미검증:** 307/308 실제 native wire 동작, 연결 장애의 wire 횟수, 헤더 이후 native 소켓 취소, SecureStore/파일 권한·삭제 장애, 실제 picker/외부 PDF 앱, TalkBack·시각 품질. Jest 가짜 전송 계약과 Android export를 이 증거로 대체하지 않습니다. Blob `File.upload` redirect는 명시적으로 남은 제한입니다.

Android 우선, iOS 공통 Expo 앱입니다. 이메일 로그인·승인 대기·세션 코어와 한국어 다섯 탭(홈·공지·일정·자료실·내 정보), 공지 상세, 내 과제(목록·상세·PDF 제출)를 구현했습니다. 현재 상태와 검증 범위의 정본은 [모바일 앱 안내](../../docs/developer/mobile-app.md)입니다. 루트 npm workspace에 넣지 않은 독립 설치로 웹의 React 19.3.1과 섞이지 않습니다. 네이티브 프로젝트는 CNG 산출물이며 직접 수정하지 않습니다.

## 버전 선택 근거 (2026-10-31)

`npm view expo@latest`는 **58.0.21**, `react-native@latest`는 **0.88.1**을 반환했습니다. [SDK 58 릴리스](https://expo.dev/changelog/sdk-58), [SDK 대응표](https://docs.expo.dev/versions/latest/), [기본 템플릿](https://github.com/expo/expo/tree/sdk-58/templates/expo-template-default), 설치한 `expo/bundledNativeModules.json`에 맞춰 직접 의존성을 정확한 버전으로 고정했습니다. 전체 전이 의존성은 자체 `package-lock.json`이 고정합니다.

| 패키지                         | 고정 버전        | 이유                                                                        |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------- |
| expo                           | 58.0.21          | 현재 안정 SDK 58                                                            |
| react-native                   | 0.88.1           | SDK 대상 RN                                                                 |
| react / react-dom              | 19.3.0           | SDK 요구값; DOM은 Router 전이 peer의 19.3.1 자동 선택 충돌 방지             |
| expo-router                    | 58.0.28          | SDK 대응 파일 기반 라우팅                                                   |
| expo-secure-store              | 58.0.2           | 후속 모바일 세션의 보안 저장소                                              |
| expo-document-picker           | 58.0.4           | 시스템 문서 선택                                                            |
| expo-file-system               | 58.0.13          | 다운로드와 SDK 58 `File.preview()`                                          |
| expo-sharing                   | 58.0.21          | PDF 외부 공유 대안                                                          |
| expo-constants                 | 58.0.14          | 앱 메타데이터와 Router 요구                                                 |
| expo-status-bar                | 58.0.4           | 상태바                                                                      |
| expo-linking                   | 58.0.15          | Router 링크 요구                                                            |
| expo-system-ui                 | 58.0.7           | 밝은 UI 네이티브 설정                                                       |
| react-native-safe-area-context | 5.10.1           | edge-to-edge 안전 영역                                                      |
| react-native-screens           | 4.30.1           | 네이티브 화면 스택                                                          |
| @tanstack/react-query          | 5.105.0          | 후속 서버 상태 계층 v5                                                      |
| openapi-fetch                  | 0.17.0           | 생성 계약의 얇은 HTTP 클라이언트                                            |
| openapi-typescript             | 7.13.0           | OpenAPI 3.1 타입 생성                                                       |
| typescript                     | 6.0.3            | Expo doctor 및 템플릿 요구                                                  |
| jest / jest-expo               | 30.5.2 / 58.0.13 | SDK 58 권장 Jest 런타임 조합                                                |
| @testing-library/react-native  | 14.1.0           | React 19 지원 렌더링; 비동기 render 사용                                    |
| @types/jest / @types/react     | 30.0.0 / 19.3.0  | 위 런타임 타입                                                              |
| eslint / eslint-config-expo    | 9.39.1 / 58.0.4  | 저장소 ESLint와 SDK flat config                                             |
| expo-doctor                    | 1.21.5           | 건강 검사도 재현 가능한 버전 사용                                           |
| sharp                          | 0.35.5           | 임시 아이콘 PNG 재생성 개발 도구(libvips·libheif·librsvg 권고 수정본, #446) |

OpenAPI 생성기 7.13.0의 TypeScript peer는 아직 `^5.x`입니다. 5.9.3으로 설치해 보았으나 doctor가 SDK 요구 `~6.0.3`과의 불일치를 검출했습니다. 따라서 **생성기에 한정한 npm override**로 TypeScript 6.0.3을 사용합니다. `--force`/`--legacy-peer-deps`, doctor 제외나 검사 비활성화는 사용하지 않습니다. 실제 타입 생성·최신성 비교·타입 검사를 검증합니다. 생성기의 공식 TypeScript 6 peer 지원은 후속 갱신 대상입니다.

`expo-build-properties`는 불필요합니다. 기본 SDK 값을 그대로 사용하고 소스 세트별 네트워크 정책만 작은 로컬 config plugin으로 생성합니다. 기본 템플릿은 데모 및 불필요한 패키지를 포함하므로 [Router 수동 설치](https://docs.expo.dev/router/installation/)와 동일한 최소 구조로 작성했습니다. `create-expo-app`을 쓸 경우 [명시적 `default@sdk-58`](https://docs.expo.dev/more/create-expo/)가 필요하며 전환기의 기본값 SDK 57에 주의합니다.

## 설치와 검증

작업 디렉터리는 반드시 `apps/mobile`입니다. 루트에서 모바일 의존성을 설치하지 않습니다.

```sh
npm ci --no-audit --no-fund
npm run api:generate
npm run api:check
npm run typecheck
npm run lint
npm test
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 npm run doctor  # 설치된 SDK 기준. 온라인 최신 패치 비교는 EXPO_OFFLINE 없이 별도로 확인
EXPO_NO_DOTENV=1 npm run export:android
EXPO_NO_DOTENV=1 npm run export:ios
EXPO_NO_DOTENV=1 npm run prebuild:android
EXPO_NO_DOTENV=1 npm run build:android:debug
```

`api:generate`는 `../../packages/contracts/openapi.json`만 읽어 `src/api/schema.d.ts`를 재생성합니다. `api:check`는 메모리에서 재생성해 비교하고 오래되면 종료 코드 1, 파일을 변경하지 않습니다. 서버 계약을 동시에 편집 중이면 후속 작업이 생성 파일을 다시 갱신해야 합니다. 생성 파일은 저장소에 포함하고 수동 편집하지 않습니다.

Node **24.14.0**, npm **11.9.0**, OpenJDK **17.0.20.1**에서 검증했습니다. SDK 58은 최소 Node 22.13.x이며 [RN 환경 안내](https://reactnative.dev/docs/0.88/set-up-your-environment)는 JDK 17을 권장합니다. 일반 RN 안내의 Android 35 값보다 실제 SDK 58/RN 0.88 버전 카탈로그와 Gradle 해석 결과를 우선합니다.

### Android SDK와 컴파일

`ANDROID_HOME`은 Android SDK 설치 위치를 가리켜야 합니다. 검증한 구성은 Gradle **9.4.1**, AGP **9.2.1**, Kotlin 플러그인 **2.2.10**, minSdk **24**, compileSdk **37**, targetSdk **36**, NDK **27.1.12297006**, CMake **3.22.1**입니다. SDK 58은 edge-to-edge가 기본이며 이를 끄는 레거시 옵션을 추가하지 않습니다.

필요한 SDK 패키지:

- `platforms;android-37.0` revision 2 (주의: `platforms;android-37`이 아님)
- `build-tools;37.0.0`, `build-tools;36.0.0` (후자는 의존 모듈 빌드에서 추가로 요구)
- `ndk;27.1.12297006`, `cmake;3.22.1`

새 환경에서는 `sdkmanager --licenses`로 SDK 라이선스를 직접 확인해 수락해야 합니다. 검증 때는 이미 수락된 라이선스만 사용했고 새 라이선스를 일괄 승인하지 않았습니다. 첫 전체 Gradle 빌드는 의존 SDK를 내려받아 **약 23분(488개 작업)** 걸렸습니다.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 약 235MB, applicationId `com.hra.mobile`, versionName **0.1.0**, versionCode **1**. 네 ABI를 포함하는 비최적화 debug APK이므로 크기는 배포 크기가 아닙니다. debug APK는 Metro 개발 서버가 필요하며 release 서명/출시 증거가 아닙니다.

## API 주소와 네트워크 보안

- `EXPO_PUBLIC_API_BASE_URL`은 공개 설정이며 비밀 값이 아닙니다. 실제 운영 URL 기본값은 없습니다.
- 개발(`__DEV__`)에서만 누락 시 Android 에뮬레이터 호스트 `http://10.0.2.2:3000`을 사용합니다. 실기기/iOS에서는 접근 가능한 로컬 주소를 명시해야 합니다.
- 운영(`__DEV__ === false`)은 누락·HTTP·손상 주소·인증 정보·쿼리·프래그먼트를 파서가 거부합니다. 후속 기능은 `createApiClient()`/`getApiBaseUrl()`을 통해 읽습니다.
- `plugins/with-network-security.cjs`는 main 리소스에 평문 거부, debug 소스 세트의 동일 이름 리소스에만 평문 허용을 생성합니다. main manifest는 `networkSecurityConfig`를 참조합니다. Android 7+의 Network Security Config가 `usesCleartextTraffic`보다 우선하므로 debug 리소스는 개발 HTTP를 허용하고 release는 HTTPS만 허용합니다. iOS ATS 예외는 추가하지 않습니다.
- Android 디렉터리 직접 수정 금지. 설정 변경 후 `prebuild:android`로 재생성합니다.
- 빌드·export는 네트워크 요청을 하지 않으므로 API 주소 없이도 번들을 만들 수 있습니다. 운영 기능에서 클라이언트를 생성할 때 주소가 없으면 명시적으로 실패합니다.

## 파일과 후속 작업 경계

- `app/`: Router 진입점, `(app)/(tabs)` 다섯 탭, `(auth)/login`, `pending`.
- `src/api/`: 생성 타입, 인증 HTTP 팩터리, 정형 오류와 한국어 변환.
- `src/config/env.ts`: 개발/운영 URL 파싱.
- `src/i18n/ko.ts`: 모든 앱 표시 문구.
- `src/theme/`: 웹과 같은 색상 및 여백·모서리 토큰.
- `tests/`: 환경 경계·실제 화면 렌더링·테마 smoke·CNG 네트워크 리소스 회귀.
- `assets/`: 자체 생성한 임시 아이콘. `node scripts/generate-icons.mjs`로 재현합니다.

[SDK 58 FileSystem 문서](https://docs.expo.dev/versions/latest/sdk/filesystem/)의 `File.canPreview()`/`File.preview()`는 Android에서 PDF 처리 앱, iOS에서 Quick Look을 사용합니다. 외부 앱이 없으면 `expo-sharing`으로 공유할 수 있지만 다운로드와 열기 흐름은 `src/features/files`와 `src/features/resources`가 구현합니다. private 파일을 public URL로 바꾸거나 Blob 서버 토큰을 넣지 않습니다.

## 저장소와 CI 격리

루트 `tsconfig.json`과 ESLint만 `apps/mobile`을 제외합니다. 웹 Vitest는 기존 `tests/unit/**`, Playwright는 `tests/e2e`로 이미 한정됩니다. spell-check는 `src/`만 순회합니다. public-source는 명시된 docs/tests/content 경로, artifact는 전달된 단일 파일, dependency 검사는 루트 lock만 읽습니다. DB 소스 검사는 Git 파일 목록과 SQL/운영 스크립트 경로로 한정되며 무시된 네이티브/설치 산출물을 수집하지 않습니다. secret 검사는 **추적 소스 전체**를 계속 검사해야 하므로 모바일 소스 제외는 추가하지 않았습니다.

`.github/workflows/mobile.yml`은 모바일·OpenAPI·자신의 변경에만 작동합니다. 두 job은 자체 `npm ci`를 사용하고 checks는 계약/타입/린트/Jest/doctor/Android·iOS JS 번들 export, android-build는 JDK 17/SDK/prebuild/실제 Gradle/APK 업로드를 담당합니다. 운영 secrets·루트 설치·새 라이선스 일괄 승인은 없습니다. GitHub-hosted CI 자체 실행은 이 로컬 작업에서 미검증입니다.

`node_modules`, `.expo`, `dist`, `android`, `ios`, APK/AAB, 키 저장소는 앱 `.gitignore`로 차단합니다. [Expo monorepo 안내](https://docs.expo.dev/guides/monorepos/)의 자동 Metro 설정을 유지하며 루트 React를 강제로 공유하지 않습니다. [doctor 안내](https://docs.expo.dev/develop/tools/)와 [Jest 30/Testing Library 14 전환](https://docs.expo.dev/develop/unit-testing/)을 따릅니다.

## 출시 전 소유자 결정과 미검증 범위

Android·iOS EAS 빌드 프로필, 수동 실행 보호 조건과 아직 완료되지 않은 계정·출시 승인은 [EAS 빌드 운영 절차](../../docs/developer/mobile-eas-release.md)에서 관리합니다. 설정 파일·워크플로 존재만으로 실제 출시가 완료된 것은 아닙니다.

1. **`ANDROID_PACKAGE_PLACEHOLDER = com.hra.mobile` 승인**: 최초 Play 업로드 뒤 패키지 ID 변경 불가. iOS bundle ID도 출시 전에 별도 확정해야 합니다.
2. 정식 아이콘/브랜딩과 운영 HTTPS API URL, 서명키 보관/릴리스 배포 정책이 필요합니다.
3. 현재 수동 `android.versionCode = 1`; 매 Play 업로드마다 반드시 단조 증가시킵니다. 첫 배포 전 수동 관리 또는 EAS remote version 자동 증가 중 하나를 정해야 하며 이 작업은 EAS 계정/키를 만들지 않습니다.
4. Linux에서 iOS 네이티브 컴파일, 실기기/에뮬레이터 실행, Play 제출, 화면 시각 QA는 검증하지 못했습니다. 공통 코드와 iOS 설정을 유지했지만 compile-ready를 실제 iOS 빌드 통과로 주장하지 않습니다.
5. AGP/Gradle의 레거시 API 폐기 경고는 SDK 전이 플러그인에서 발생합니다. 검사나 테스트를 끄지 않았으며 Gradle 10 업그레이드는 별도 SDK 지원 확인이 필요합니다.
6. 소셜 로그인은 MVP 제외입니다. 비공개 PDF 흐름과 기능 화면은 구현되어 있으나 실기기 검증과 독립 보안 리뷰는 출시 전 별도 필수 게이트입니다.

## 코어 아키텍처와 화면 구현 규약

`src/auth/session-manager.ts`는 React와 무관하며 `AuthApi`, `TokenStore`, `now`를 주입받습니다. 상태는 `loading | signedOut | signedIn`, 액세스 토큰은 메모리 전용입니다. `runtime.ts`의 앱 수명 싱글턴을 반드시 공유합니다. 화면별 세션 관리자나 새 refresh 인터셉터를 만들지 않습니다.

```tsx
import { useAuth } from "../src/auth/use-auth";
import { getApiClient } from "../src/auth/runtime";
import { apiQueryOptions } from "../src/query/client";
import { useQuery } from "@tanstack/react-query";

// 보호된 화면 안에서 호출합니다. 토큰은 훅, 키, URL에 넣지 않습니다.
const { status, user, role, isPending, error, logout, logoutAll, retry } = useAuth();
const notices = useQuery(
  apiQueryOptions(["notices", user?.id], async (signal) => {
    const { data } = await getApiClient().GET("/api/v1/notices", { signal });
    return data;
  }),
);
```

- `useAuth()` 공개값: `status, user({id,name,role}), role, isPending, login(email,password,device?), logout(), logoutAll(), error, retry()`.
- 화면 경로는 `app/(app)/` 아래에 추가합니다. 서버 인가는 별도이며 ADMIN/FACULTY에 MEMBER 과제 권한을 가정하지 않습니다. PENDING은 `pending`만 접근합니다. 외부/쿼리 redirect 목적지는 읽지 않습니다.
- `getApiClient()`는 `openapi-fetch`의 `GET/POST/DELETE/...`와 생성 계약 타입을 제공합니다. 비-2xx는 `ApiError`를 throw하므로 반환 `error`를 다시 처리할 필요가 없습니다. 성공 응답의 `data`는 생성 타입상 optional입니다. query key에 데이터 구분값만 넣습니다.
- `ApiError`는 `status, code, requestId, retryAfterSeconds`를 가지며 `toKoreanMessage(error, 'login' | 'default')`로 표시합니다. 요청 식별자는 오류 envelope 또는 `X-Request-Id`에서 포착하며 팩터리 `onRequestId`로 성공 응답도 수집 가능합니다. 원본 서버 메시지를 표시하지 않습니다.
- 기본 요청 제한시간 20초. 장기 전송은 `createApiClient({session: getSessionManager(), timeoutMs: TRANSFER_TIMEOUT_MS})`로 120초 인스턴스를 만들되 반드시 동일 세션을 주입합니다. 호출자 `signal`을 전달합니다. JSON은 본문 수신까지 제한하며 파일 스트림 본문 소비/진행률은 후속 파일 전송 계층의 책임입니다.
- Query는 GET 전용입니다. 30초 staleTime(짧은 공지/일정 탐색 중 중복 요청 억제), 5분 gcTime, NETWORK/5xx만 최대 두 번 1초/2초 백오프, 4xx/429/TIMEOUT 재시도 없음. 변이는 `retry:false`. 업로드/제출의 모호한 실패는 조회로 확인한 뒤 사용자가 판단하며 자동 재제출하지 않습니다.
- NetInfo/expo-network는 설치되어 있지 않아 추가하지 않았습니다. `onlineManager`는 기본 상태를 유지하고 전송 오류 안내와 명시적 retry를 사용합니다. AppState는 focusManager와 공유 세션 check에 연결합니다. 전경 복귀 외 지속 폴링은 없습니다.
- 세션 세대가 바뀌거나 signedOut이 되면 Query 취소와 캐시 제거가 실행됩니다. 계정 간 데이터 격리를 위해 전송 완료 시에도 세대를 검사합니다. 토큰/프로필/Query cache를 AsyncStorage 또는 디스크에 복제하지 않습니다.

### 보안·회전 정책

SecureStore에는 갱신 토큰·갱신 만료·최소 프로필(id/name/role)만 단일 JSON으로 저장합니다. Android는 Keystore 암호화, `keychainService` 별칭을 쓰고 `requireAuthentication:false`로 생체 인증을 요구하지 않습니다. `WHEN_UNLOCKED_THIS_DEVICE_ONLY`는 iOS 접근성 옵션이며 Android용 생체 인증 대안이라는 뜻이 아닙니다. 기본 SecureStore 백업 제외는 기존 CNG 설정을 유지합니다.

시작 복원·401·전경·백그라운드의 갱신은 단일 Promise를 공유합니다. 현재 세대의 refresh 401만 로그아웃시킵니다. 새 회전 토큰을 **저장 완료한 뒤** 액세스 토큰과 signedIn을 공개합니다. 네트워크/타임아웃은 signedIn+error를 유지하고 자동 갱신을 멈춥니다. 재확인 버튼이나 다음 전경 확인만 다음 시도를 시작합니다(서버가 이미 회전한 경우 다음 시도가 401일 수 있음). 429는 서버 대기시간 전 재요청하지 않습니다.

일반 API의 401은 조정 후 GET만 한 번 재전송합니다. POST/DELETE 등 변이는 재전송하지 않습니다. 전송 실패는 API 계층에서 재시도하지 않습니다. `logout()`은 서버 실패에도 즉시 로컬 상태를 지웁니다. 보안 저장소 삭제 실패 시 정형 STORAGE_UNAVAILABLE 오류가 남으며 다음 실행에서 잔존 자격 증명이 읽힐 수 있으므로 실제 기기 저장소 오류 검증이 필요합니다. `logoutAll()`은 유효 액세스 토큰으로 모든 **모바일** 세션 해지를 요청하고, 결과와 관계없이 로컬 상태를 제거합니다. 서버 해지가 실패하면 로컬 정리 뒤 원래 오류를 다시 던집니다(다른 기기 세션이 남아 있을 수 있음).

프로필 스냅샷은 권한의 근거가 아닙니다. refresh 응답에는 user가 없어 역할/승인 변경은 서버가 인가하며 재로그인 때 UI에 반영합니다. 화면 구현자는 최신 `/me`의 데이터를 화면용으로 사용하고, 승인 정책을 임의로 완화하지 않습니다. 비밀번호·토큰·기기 이름은 로그/분석/오류 메시지에 넣지 않습니다. 공용 계약(`packages/contracts/openapi.json`)이 바뀌면 `npm run api:generate && npm run api:check`를 다시 실행합니다.

### 인증 화면 표시 기준

기존 `theme` 색상·여백과 28pt 제목/16pt 본문을 유지합니다. Layout: 안전 영역 안에서 ScrollView 하나가 세로 스크롤을 소유하는 단일 열 폼. 로그인 우선순위는 제목 → 이메일/비밀번호 → 오류/로그인 버튼이며 기본 동작은 로그인 하나입니다. 필수 요소는 이메일 키보드, 비밀번호 숨김/표시, 입력 검증, 비밀번호 자동완성, 429 카운트다운, 로딩/오류, 접근성 레이블입니다. 장식 카드·소셜 버튼·추가 기능은 넣지 않습니다. 승인 대기는 안내와 로그아웃만 제공합니다. 48pt 조작 영역, 시스템 글꼴 확대, 스크롤과 KeyboardAvoidingView를 사용합니다. 실제 TalkBack/키보드·대형 글꼴·화면 캡처/대비 QA는 기기 검증 전까지 미확인입니다.

## UI 키트 (`src/theme` · `src/ui`)

### 디자인 원칙

1. **차분한 학술적 인상과 웹 일관성**: HRA 웹사이트(`globals.css`, `AGENTS.md`)와 동일한 주 텍스트(`#1a1a1a`), 보조 텍스트(`#666666`), 구분선(`#D9D9D9`), 브랜드 블루(`#2563EB`)를 사용하며 밝은 테마(Light Theme) 기준으로 정돈된 여백을 유지합니다.
2. **한국어 가독성 중심 타이포그래피**: 모든 타이포그래피 단계(`title`, `heading`, `subheading`, `body`, `bodySmall`, `caption`, `label`)에 글자 크기의 **1.4배 이상** 명시적 행간(`lineHeight`)을 부여해 한글 문장 줄바꿈 시 답답함을 방지합니다.
3. **4pt 그리드 여백과 48dp 터치 영역**: 여백(`xs: 4` ~ `xxxl: 48`)은 모두 4의 배수이며, 모든 상호작용 컴포넌트(`Button`, 터치형 `Card`, `ListRow`, `SectionHeader` 액션, `InlineBanner` 액션)는 최소 `48dp × 48dp` 터치 영역과 Android 물결(`android_ripple`) 피드백을 보장합니다.
4. **순수 프레젠테이션 경계**: `src/ui/**` 컴포넌트는 `src/auth`나 `src/api`를 절대 import하지 않습니다. 데이터 조회·인증 상태는 각 기능 화면에서 주입합니다.

### 컴포넌트별 사용 예시

```tsx
import {
  AppText,
  Button,
  Card,
  Chip,
  confirmAction,
  Divider,
  EmptyState,
  ErrorState,
  Icon,
  InlineBanner,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonList,
  useRefresh,
} from "../src/ui";
import { ko } from "../src/i18n/ko";

// 1) Screen + useRefresh + SectionHeader + Card + Chip + ListRow + Divider
const { refreshing, onRefresh } = useRefresh(() => query.refetch());

<Screen scroll padding="md" refreshing={refreshing} onRefresh={() => void onRefresh()}>
  <InlineBanner tone="info" message="학사 일정을 확인해 주세요." />
  <SectionHeader
    title="다가오는 일정"
    actionLabel="일정 전체 보기"
    onActionPress={() => router.push("/(app)/(tabs)/schedule")}
  />
  <Card variant="elevated" padding="md" onPress={() => router.push("/(app)/assignments")}>
    <Chip label="미제출" tone="warning" icon="time-outline" />
    <AppText variant="subheading">1주차 독서 에세이</AppText>
    <Divider spacing="sm" />
    <AppText variant="bodySmall" tone="secondary">
      마감: 2026.11.07 23:59
    </AppText>
  </Card>
  <ListRow
    title="내 과제"
    subtitle="제출 현황 및 피드백 확인"
    meta="1건"
    leadingIcon="clipboard-outline"
    onPress={() => router.push("/(app)/assignments")}
  />
</Screen>;

// 2) 로딩 / 빈 상태 / 오류 상태 / 확인 대화상자
if (query.isPending)
  return (
    <Screen>
      <SkeletonList count={3} />
    </Screen>
  );
if (query.isError) {
  return (
    <Screen centered>
      <ErrorState message={toKoreanMessage(query.error)} onRetry={() => void query.refetch()} />
    </Screen>
  );
}
if (items.length === 0) {
  return (
    <Screen centered>
      <EmptyState description="등록된 공지가 없습니다." />
    </Screen>
  );
}

// 3) 위험 동작 확인 대화상자 (콜백 또는 await 지원)
const confirmed = await confirmAction({
  title: ko.auth.logout,
  message: "로그아웃하시겠습니까?",
  destructive: true,
});
if (confirmed) await logout();
```

### 접근성 체크리스트

- [x] **명암비(WCAG 2.1 AA)**: `declaredContrastPairs`(25개 전경/배경 조합) 전수 단위 테스트로 일반 텍스트 `4.5:1` 이상 검증 (`tests/theme-contrast.test.ts`).
- [x] **최소 터치 영역**: 모든 누름 가능한 요소에 `minHeight: 48` / `minWidth: 48` 및 `hitSlop` 적용.
- [x] **보조기술 역할과 상태**: 제목은 `accessibilityRole="header"`, 버튼은 `accessibilityRole="button"` 및 로딩 시 `accessibilityState={{ disabled: true, busy: true }}`, 오류·경고는 `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` 노출.
- [x] **장식용 아이콘 숨김**: `accessibilityLabel`이 없는 `Icon`과 `Divider`, `Skeleton`은 `accessibilityElementsHidden` 및 `importantForAccessibility="no-hide-descendants"`로 중복 읽기를 방지.
- [x] **글꼴 확대 및 동작 줄이기 대응**: `AppText` 기본 `maxFontSizeMultiplier={1.6}` 적용, `Skeleton`/`SkeletonList`는 `AccessibilityInfo.isReduceMotionEnabled()` 및 변경 이벤트를 구독해 동작 줄이기 활성화 시 애니메이션 루프를 중지.

## 파일·제출 모듈

파일·제출 코어는 React Native를 import하지 않습니다. 네이티브 import는 `expo-file-system-port.ts`, `open-file.ts`, `expo-blob-transport.ts`, `secure-resume-store.ts`에만 있습니다. 날짜는 UTC+9 산술로 처리하며 일정의 `calendarDate/startTime`은 변환하지 않습니다.

### 날짜·일정

`src/lib/date-kst.ts`: `formatKstDate(Instant)`, `formatKstDateTime(Instant)`, `kstNow(clock?: () => number)`, `kstMonthOf(Instant)`, `isPastDue(dueIso, now)`, `koreanWeekday(calendarDate)`, `guardScheduleMonth(year, month)`, `groupScheduleEventsByDate(events)`, `upcomingScheduleEvents(events, now, limit=3)`. Instant는 `string | number | Date`입니다. `kstNow`는 표시용 `{year,month,day,hour,minute,second,weekday}`이며 실제 시각으로 다시 직렬화하지 않습니다. 마감 경계는 `dueAt <= now`입니다. 그룹은 `{calendarDate,events}[]`입니다. `format.ts`는 `formatFileSize(bytes)`, `formatDueText(dueIso, now)`를 제공합니다.

### 보호 PDF 다운로드

```ts
const fs = createExpoFileSystemPort();
const cache = createProtectedCache(fs);
await cache.sweepProtectedCache(); // 기본 24시간, 앱 시작 때 호출
const controller = new AbortController();
const downloaded = await downloadProtectedFile({
  fs,
  fileNameHint: guidebook.title,
  signal: controller.signal,
  request: createProtectedRequest(getApiClient(), { kind: "guidebook", id: guidebook.id }),
  onProgress: ({ receivedBytes, totalBytes }) => {
    /* 화면 상태 갱신 */
  },
});
await openProtectedFile(downloaded.uri, fs);
// 내 제출 파일: {kind:'submission', submissionId, fileId}
```

`downloadProtectedFile(options): Promise<{uri,fileName,sizeBytes}>`에서 request는 `(signal: AbortSignal) => Promise<Response>`입니다. 기존 API 클라이언트의 `parseAs:'stream'`을 사용하므로 401의 공유 갱신과 GET 단일 재시도를 그대로 적용합니다. 전체 본문 소비에도 기본 120초 제한을 걸고 부분 파일을 정리합니다. 취소는 기존 ApiError 코드에 별도 CANCELLED가 없어 NETWORK로 매핑하며 UI는 자신의 signal도 확인합니다. 캐시 포트는 `create/write/close/abort/delete/list/contentUri`를 제공하고 보호 하위 디렉터리만 접근합니다.

Android는 VIEW intent에 content URI와 읽기 권한(flag 1)을 전달합니다. iOS는 `File.preview`이며 실패 시 `expo-sharing`으로 대체합니다. 선택 파일은 `expo-document-picker`의 `copyToCacheDirectory:true`로 별도 관리합니다. 보호 다운로드 캐시 정리는 선택 파일을 삭제하지 않습니다.

### 제출·재개·취소

```ts
const store = createSecureResumeStore(user.id); // 계정별 키, 토큰·파일 URI 저장 금지
const deps = {
  api: createSubmissionApi(getApiClient()),
  store,
  upload: createBlobUploader({
    transport: expoBlobTransport,
    now: Date.now,
    generateId: randomUUID,
  }),
  now: Date.now,
  generateId: randomUUID,
};
const run = createSubmitRunner(deps); // 화면/기능 수명 동안 하나만 유지: 중복 탭·429 차단
const result = await run(
  { kind: "new", assignmentId, file: { uri, name, sizeBytes, mimeType } },
  { signal: controller.signal, onEvent: setSubmitState },
);
await run({ kind: "resume" }); // 저장된 식별자와 같은 submissionKey로 복구
await run({ kind: "cancel" }); // 서버 의도 삭제 성공 후 저장 삭제
```

저수준 `runSubmitFlow(deps, command, controls?): Promise<SubmitResult>`도 공개합니다. result는 `kind: 'success'`(submission), `'cancelled'`, `'error'`(ApiError, retryAt, canResume)입니다. 상태 이벤트는 validating/creatingIntent/authorizing/uploading(percentage)/verifying/finalizing/cancelling/success/cancelled/error이며 토큰은 포함하지 않습니다. `retryAfterRemaining(retryAt, now)`는 UI 카운트다운용 초를 반환합니다. `ResumeStore`는 `read/write/clear`이고 레코드는 네 식별자와 `phase:'verifying'|'finalizing'`만 보관합니다.

승인→재개 저장→토큰 교환→논리적 PUT 시도→항상 verify→최종화 순서입니다. 네이티브 계층은 연결 장애 뒤 투명하게 재전송할 수 있으므로 submissionKey/requestId/단일 사용 토큰에 의존합니다. PUT 네트워크 실패/취소 뒤에도 별도의 인증 요청으로 verify합니다. 검증 404/409는 서버 의도를 취소하고 새 시도를 요구합니다. 503 STORAGE_UNAVAILABLE/UNAVAILABLE과 429는 재개를 보존하며 JS 자동 재시도하지 않습니다. `finalizing`은 POST 전에 저장하므로 최종화 응답 유실 뒤 verify를 다시 호출하지 않고 동일 키 최종화만 재시도합니다(replayed도 성공). 최종화 전 취소는 DELETE하며, 이미 보낸 최종화는 중단하지 않고 성공 결과를 우선합니다. 승인 요청도 중단하지 않아 늦게 받은 intent ID로 취소할 수 있게 합니다.

로그아웃/계정 전환은 현재 루트 `AccountLifecycle`이 연결합니다. 전송 AbortController를 `trackTransfer(controller)`로 등록하고 완료 시 반환된 해제 함수를 호출합니다. `ready()`는 이전 세대 정리 대기, `settled()`는 정리 결과 대기, 비동기 `dispose()`는 구독 해제·전송/저장 drain입니다. 이전 계정 store를 동기 캡처하여 새 계정의 기록을 지우지 않습니다. 오류는 한국어 `toKoreanMessage`로 표시하며 실패한 정리 게이트는 보호 작업을 막습니다.

### Blob 요청과 Node 검증

설치된 @vercel/blob 2.4.0의 `client.js:createPutMethod`, 공유 chunk의 `requestApi/createPutHeaders/getApiVersion`를 대조했습니다. URL은 `https://vercel.com/api/blob/?pathname=<URLSearchParams>`이고 PUT 헤더는 `authorization`, `x-api-version:12`, `x-vercel-blob-access:private`, `x-content-type:application/pdf`, `x-content-length`, store/request-id/attempt:0입니다. pathname은 수정하지 않습니다. SDK의 기본 10회 JS 재시도·Node crypto/undici를 피하고 논리적 요청만 한 번 호출합니다. 네이티브 연결 복구 재전송은 여전히 가능하며 서버 멱등성에 의존합니다. 성공 응답 pathname 일치만 확인하고 URL은 버립니다.

공식 SDK 58 문서는 `expo/fetch` + `File` 본문도 지원하지만 전송 진행률까지 제공하는 설치된 `File.upload({httpMethod:'PUT',uploadType:BINARY_CONTENT,signal,onProgress})`를 사용했습니다. legacy API나 파일 URI를 RN fetch 본문에 넣지 않습니다. 새 dependency/package/lock 변경은 없습니다.

Node 하네스(`e2e/`)는 같은 코어에 `createSubmissionApi(createApiClient({baseUrl,session,fetch}))`, 인메모리/파일 기반 `ResumeStore`, Node crypto `randomUUID`, `Date.now`, `createBlobUploader({transport:createFetchBlobTransport(fetch, async uri => new Blob([await readFile(uri)])),generateId:randomUUID,now:Date.now})`를 주입합니다. Node 파일 다운로드는 FileSystemPort를 `fs.open/write/close/unlink/readdir`에 연결합니다. `createFetchBlobTransport(fetcher, readBody)`는 Blob/Uint8Array를 받으며 테스트용 endpoint를 명시할 수 있습니다. TypeScript 소스는 기존 Jest 변환 또는 tsc CommonJS 출력 후 Node에서 실행합니다. Expo 어댑터를 Node에서 import하지 않습니다.

### 검증 범위

Jest는 KST 월·연도·윤년·자정, 길이 검증·파일명 공격·부분 정리·401 한 번 재시도·캐시 보관, 제출/재개/replayed/취소/오류/429, 로컬 Node HTTP Blob 서버의 실제 PUT URL·헤더·바이트·4xx/5xx·제한시간을 검증합니다. 네이티브 어댑터는 호출 경계 모의 검증이며 실제 디바이스 동작 증거가 아닙니다. 실제 문서 선택, 네이티브 파일 스트리밍 메모리/진행률/백그라운드 취소, Android content URI·PDF 앱 유무·공유 시트, SecureStore 장애, iOS Quick Look는 기기 검증이 필요합니다. Jest는 실제 서버·Blob 서비스를 호출하지 않습니다. 실제 로컬 서버 연동은 `scripts/verify-mobile-bearer-http.mjs` 하네스가 검증하며([모바일 Bearer 검증](../../docs/developer/mobile-bearer-verification.md)), 사람의 독립 보안 리뷰는 출시 전 별도 필수 게이트입니다.

### 검증 명령과 현재 검증 현황

실행할 명령은 위 "설치와 검증" 절을 따릅니다. 최근 검증 결과와 미검증 범위는 [모바일 앱 안내 §9](../../docs/developer/mobile-app.md)에, 실제 로컬 서버 연동 검증은 [모바일 Bearer 검증](../../docs/developer/mobile-bearer-verification.md)에 있습니다. 수치가 필요한 검증 결과는 이 두 문서만 갱신하므로 README에는 옮기지 않습니다.
