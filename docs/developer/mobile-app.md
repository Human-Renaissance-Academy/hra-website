# 모바일 앱 (apps/mobile) 개발 및 운영 안내

이 문서는 HRA 모바일 애플리케이션(`apps/mobile`)의 목적, 프로젝트 구조, API 타입 연동, 실행과 빌드 명령, 인증 및 보안 모델, 검증 범위와 출시 전 소유자 결정 사항을 설명합니다.

이 문서는 출시일을 약속하지 않으며, 현재 구현된 코드의 동작과 검증 경계를 객관적으로 기록합니다.

## 1. 목적과 범위

`apps/mobile`은 React Native와 Expo 기반의 단일 코드베이스로 작성된 HRA 모바일 클라이언트입니다. Android를 1차 대상으로 하며, 동일한 소스 코드로 향후 iOS 배포까지 지원하도록 설계되었습니다.

### 고정 버전과 독립 프로젝트 구성

| 패키지 | 고정 버전 | 용도 및 선정 이유 |
| --- | --- | --- |
| expo | 58.0.21 | Expo SDK 58 안정 버전 |
| react-native | 0.88.1 | SDK 58 대상 React Native 런타임 |
| react / react-dom | 19.3.0 | SDK 요구 버전, 루트 웹(19.3.1)과 격리 |
| expo-router | 58.0.28 | 파일 기반 모바일 라우팅 |
| expo-secure-store | 58.0.2 | 하드웨어 지원 암호화 키스토어 기반 토큰 저장소 |
| @tanstack/react-query | 5.105.0 | 서버 상태 관리 및 쿼리 캐시 계층 |
| openapi-fetch | 0.17.0 | OpenAPI 계약 기반 경량 HTTP 클라이언트 |
| openapi-typescript | 7.13.0 | OpenAPI 3.1.1 스키마 타입 생성 도구 |
| typescript | 6.0.3 | Expo doctor 및 SDK 58 요구 버전 |

`apps/mobile`은 저장소 루트의 `package.json` `workspaces`에 포함되지 않은 **독립 npm 프로젝트**입니다. 이는 웹 애플리케이션의 React 19.3.1 및 Next.js 16 도구 체인과 모바일의 React 19.3.0 및 React Native 0.88.1 의존성이 섞이지 않도록 방지하기 위함입니다. 루트 `npm run typecheck`와 `npm run lint`는 모바일 디렉터리를 검사 대상에서 제외하며, 모바일 의존성과 검사는 `apps/mobile` 내부에서 자체 `package-lock.json`을 기준으로 독립 실행합니다.

또한 `openapi-typescript` 7.13.0은 TypeScript 5.x를 peer dependency로 선언하고 있으나, Expo SDK 58은 TypeScript 6.0.3을 요구합니다. 따라서 `apps/mobile/package.json`의 `overrides` 설정을 통해 생성기 실행에 한해 TypeScript 6.0.3을 적용하도록 구성했습니다.

## 2. 폴더 구조

`apps/mobile`의 주요 디렉터리와 역할은 다음과 같습니다.

```
apps/mobile/
├── app/                        # Expo Router 화면 진입점
│   ├── _layout.tsx             # 루트 레이아웃 (QueryClientProvider, AuthProvider)
│   ├── pending.tsx             # 승인 대기 안내 화면
│   ├── (auth)/                 # 미인증 라우트 그룹
│   │   ├── _layout.tsx         # 인증 화면 스택
│   │   └── login.tsx           # 이메일/비밀번호 로그인 화면
│   └── (app)/                  # 인증 보호 라우트 그룹 (RouteGuard, 계정 수명주기)
│       ├── _layout.tsx         # 보호 영역 레이아웃
│       ├── (tabs)/             # 5개 하단 탭
│       │   ├── _layout.tsx     # 탭 네비게이션 헤더 및 탭 바
│       │   ├── index.tsx       # 홈 탭 (인사말, 다가오는 일정, 최근 공지, 내 과제)
│       │   ├── notices.tsx     # 공지 탭 (검색, 무한 스크롤 목록)
│       │   ├── schedule.tsx    # 일정 탭 (월별 아젠다, 오늘 날짜 자동 스크롤)
│       │   ├── resources.tsx   # 자료실 탭 (가이드북 무한 스크롤, PDF 다운로드)
│       │   └── profile.tsx     # 내 정보 탭 (계정 요약, 버전 정보, 단일/전체 기기 로그아웃)
│       ├── assignments/        # 내 과제 스택
│       │   ├── _layout.tsx     # 과제 스택 레이아웃
│       │   ├── index.tsx       # 과제 목록 화면 (/assignments)
│       │   ├── [id].tsx        # 과제 상세 화면 (/assignments/[id])
│       │   └── [id]/submit.tsx # 과제 제출 화면 (/assignments/[id]/submit)
│       └── notices/            # 공지 상세 스택
│           ├── _layout.tsx     # 공지 상세 레이아웃
│           └── [id].tsx        # 공지 상세 화면 (/notices/[id])
├── src/
│   ├── api/                    # HTTP 클라이언트, 오류 변환, 생성 스키마
│   │   ├── client.ts           # createApiClient 팩터리
│   │   ├── transport.ts        # 전송 제한시간, JSON 크기 상한, 취소 연결
│   │   ├── errors.ts           # ApiError 및 toKoreanMessage 한국어 변환
│   │   └── schema.d.ts         # OpenAPI 계약에서 자동 생성된 타입
│   ├── auth/                   # 세션 관리와 인증 런타임
│   │   ├── types.ts            # AuthSession, AuthUser, AuthState
│   │   ├── token-store.ts      # SecureStore 기반 리프레시 토큰 및 최소 프로필 보관
│   │   ├── auth-api.ts         # 로그인, 갱신, 로그아웃 API 호출부
│   │   ├── session-manager.ts  # 단일 비행(single-flight) 갱신, 세션 세대 가드
│   │   ├── runtime.ts          # 세션 매니저 및 API 클라이언트 앱 싱글턴
│   │   ├── auth-context.ts     # AuthContext 정의
│   │   ├── auth-provider.tsx   # React 인증 상태 제공자
│   │   ├── use-auth.ts         # useAuth 훅
│   │   └── route-guard.tsx     # 경로 접근 제어 가드 (미인증, 승인 대기 분기)
│   ├── config/
│   │   └── env.ts              # EXPO_PUBLIC_API_BASE_URL 파싱 및 검증
│   ├── features/               # 화면별 도메인 로직 및 뷰 컴포넌트
│   │   ├── home/               # 홈 탭 데이터 매핑 및 섹션 컴포넌트
│   │   ├── notices/            # 공지 목록 검색 디바운스, 무한 스크롤 훅
│   │   ├── schedule/           # KST 월별 일정 모델, 아젠다 컴포넌트
│   │   ├── resources/          # 가이드북 다운로드 상태 머신 및 실행기
│   │   ├── assignments/        # 과제 뷰모델, 제출 상태 머신, 문서 선택
│   │   ├── markdown/           # 외부 의존성 없는 안전 Markdown AST 파서 및 뷰어
│   │   ├── files/              # 보호 파일 시스템 포트, 캐시 관리, 인텐트 열기
│   │   ├── submission/         # 재개 저장소, Blob 단일 PUT, 제출 흐름 실행기
│   │   ├── account/            # 계정 수명주기, 전송 추적, 로그아웃 정리
│   │   └── profile/            # 프로필 뷰모델 및 설정
│   ├── i18n/
│   │   └── ko.ts               # 앱 전체 한국어 UI 문자열 정본
│   ├── lib/
│   │   ├── date-kst.ts         # KST(UTC+9) 날짜 산술 유틸리티
│   │   └── format.ts           # 파일 크기, 마감 시각 포맷터
│   ├── query/
│   │   └── client.ts           # TanStack Query 클라이언트 기본 옵션
│   ├── theme/                  # 웹 일관 디자인 토큰 (색상, 여백, 모서리, 명암비)
│   └── ui/                     # 순수 프레젠테이션 UI 키트 (Button, Card, Screen 등)
├── plugins/
│   └── with-network-security.cjs # Android Network Security Config 생성 플러그인
├── tests/                      # Jest 및 React Native Testing Library 단위/통합 테스트
├── e2e/                        # Node 환경 기반 HTTP/세션/제출 E2E 테스트
└── scripts/                    # 빌드 및 API 타입 생성 스크립트
```

## 3. OpenAPI 계약과 타입 생성

모바일 앱의 모든 네트워크 통신 타입은 루트 저장소의 공용 계약인 `packages/contracts/openapi.json`을 단일 정본으로 삼습니다.

- `npm run api:generate`: `packages/contracts/openapi.json`을 읽어 `src/api/schema.d.ts`를 자동 생성합니다.
- `npm run api:check`: 현재 `openapi.json`을 메모리에서 변환한 뒤 `src/api/schema.d.ts` 파일과 정확히 일치하는지 비교합니다. 계약이 갱신되었으나 모바일 타입이 최신화되지 않은 경우 종료 코드 1로 실패합니다.

생성된 `src/api/schema.d.ts`는 Git에 포함되며 직접 손으로 편집하지 않습니다.

## 4. 환경 변수와 네트워크 보안 규칙

### API 기본 주소 규칙

`EXPO_PUBLIC_API_BASE_URL` 환경 변수는 앱이 요청을 보낼 API 서버의 기본 URL을 지정합니다. 이 값은 클라이언트에 노출되는 공개 설정이며 비밀정보가 아닙니다.

- **개발 환경 (`__DEV__ === true`)**:
  - 환경 변수가 비어 있는 경우 Android 에뮬레이터 루프백 주소인 `http://10.0.2.2:3000`을 기본값으로 사용합니다.
  - 실제 모바일 기기나 iOS 시뮬레이터에서 실행할 때는 개발 PC의 실제 로컬 IP 주소(예: `http://192.168.0.x:3000`)를 명시해야 합니다.
- **운영 릴리스 (`__DEV__ === false`)**:
  - `EXPO_PUBLIC_API_BASE_URL`이 누락되거나, `http:` 평문 프로토콜을 사용하거나, 잘못된 형식, 쿼리, 해시 프래그먼트, 인증 정보가 포함된 경우 `getApiBaseUrl()` 검증기가 앱 시작 시점에 명시적으로 예외를 발생시킵니다.
  - 운영 빌드는 오직 유효한 `https:` 주소만 허용합니다.

### Android 네트워크 보안 설정

Android 7(API 레벨 24) 이상에서는 Manifest의 `usesCleartextTraffic`보다 Network Security Config가 우선합니다. `plugins/with-network-security.cjs` 플러그인은 Expo prebuild 시점에 다음과 같이 네이티브 리소스를 분리 생성합니다.

- **main 소스 세트**: 모든 도메인에 대해 평문 HTTP 트래픽을 거부합니다 (`cleartextTrafficPermitted="false"`).
- **debug 소스 세트**: 개발 편의를 위해 로컬 통신 평문 HTTP를 허용합니다 (`cleartextTrafficPermitted="true"`).

이를 통해 릴리스 빌드에서는 평문 통신이 원천 차단되며 별도의 iOS ATS 예외도 추가하지 않습니다.

## 5. 실행, 빌드, 검증 명령

모든 모바일 명령어는 반드시 `apps/mobile` 디렉터리에서 실행해야 합니다.

```bash
cd apps/mobile

# 의존성 설치 (자체 package-lock.json 기준)
npm ci --no-audit --no-fund

# 계약 타입 최신성 확인 및 생성
npm run api:check
npm run api:generate

# 정적 분석
npm run typecheck
npm run lint

# 단위 및 컴포넌트 통합 테스트 (Jest + RNTL)
npm test

# 프로젝트 환경 및 종속성 진단
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 npm run doctor  # 설치된 SDK 기준. 온라인 최신 패치 비교는 EXPO_OFFLINE 없이 별도로 확인

# Android 번들 내보내기 (Hermes 바이트코드 생성)
EXPO_NO_DOTENV=1 npm run export:android

# iOS JS 번들 내보내기 (Linux에서는 네이티브 컴파일 없이 번들링 가능 여부만 확인)
EXPO_NO_DOTENV=1 npm run export:ios

# 네이티브 CNG 프로젝트 생성
EXPO_NO_DOTENV=1 npm run prebuild:android

# 로컬 Android Debug APK 빌드
EXPO_NO_DOTENV=1 npm run build:android:debug
```

### 설치된 네이티브 도구 및 환경

본 프로젝트 검증 환경에서 확인된 도구 버전은 다음과 같습니다.

- Node.js: 24.x
- Java: OpenJDK 17.0.20.1
- Android SDK:
  - `platforms;android-37.0` (revision 2)
  - `build-tools;37.0.0`, `build-tools;36.0.0`
  - `ndk;27.1.12297006`
  - `cmake;3.22.1`
- Gradle: 9.4.1, Android Gradle Plugin: 9.2.1, Kotlin: 2.2.10
- 컴파일 설정: minSdk 24, compileSdk 37, targetSdk 36

## 6. 인증 및 세션 모델

모바일 앱의 인증은 보안 원칙에 따라 웹 쿠키와 명확히 분리된 전용 토큰 체계를 사용합니다.

### 토큰 보관 정책

- **액세스 토큰 (Access Token)**: 메모리에만 보관합니다. 비휘발성 저장소, AsyncStorage, 디스크 파일, URL, 분석 로그 등에 일절 저장하지 않습니다.
- **리프레시 토큰 (Refresh Token)**: Android의 경우 Android Keystore 암호화 기반 `expo-secure-store`에만 보관합니다.
  - 저장 대상: `refreshToken`, `refreshTokenExpiresAt`, 최소 사용자 정보(`id`, `name`, `role`).
  - 비밀번호, 액세스 토큰, 상세 학사 프로필은 저장소에 보관하지 않습니다.

### 세션 조정과 세대 가드

- **단일 비행 갱신 (Single-Flight Refresh)**: 앱 시작 복원, 401 응답 인터셉터, 전경 복귀 이벤트가 발생할 때 하나의 공유 Promise를 통해 토큰 갱신을 수행합니다. 여러 요청이 동시에 401을 받아도 중복 갱신 요청을 서버로 보내지 않습니다.
- **세션 세대 가드 (Generation Guard)**: 세션 전환 시마다 로컬 `generation` 정수를 증가시킵니다. 네트워크 지연으로 인해 뒤늦게 완료된 이전 세대의 갱신 실패나 응답이 현재 유효한 최신 세션 데이터를 덮어쓰거나 삭제하지 못하도록 차단합니다.
- **새 토큰 저장 순서**: 서버로부터 회전된 새 리프레시 토큰을 SecureStore에 완전히 쓴 뒤에만 새 액세스 토큰과 인증 상태를 공개합니다.

### 로그아웃 동작

- **단일 기기 로그아웃 (`logout()`)**:
  - 서버의 `POST /api/v1/auth/logout`을 호출해 현재 리프레시 토큰을 무효화합니다.
  - 네트워크 단절이나 서버 503 오류가 발생하더라도 사용자 프라이버시 보호를 위해 기기 내 토큰과 캐시 파일은 즉시 삭제합니다.
- **전체 기기 로그아웃 (`logoutAll()`)**:
  - 현재 유효한 Bearer 토큰으로 `POST /api/v1/auth/logout-all`을 호출합니다.
  - `logout()`과 같이 서버 응답과 관계없이 이 기기의 토큰과 보안 저장소를 즉시 삭제합니다. 서버 204를 받지 못하면 다른 기기의 모바일 세션이 남아 있을 수 있으므로 로컬 정리 뒤 원래 오류를 호출자에게 다시 전달합니다. 웹 세션 쿠키는 영향을 받지 않습니다.

## 7. 비공개 파일 다운로드 및 업로드 흐름

모바일 앱은 Vercel Blob 서버 토큰을 앱 번들에 포함하지 않습니다.

### 비공개 가이드북 다운로드 흐름

1. 모바일 앱이 `GET /api/v1/resources/guidebooks/{id}/file`에 Bearer 토큰을 실어 요청합니다.
2. 서버는 토큰 검증, 역할(ADMIN, FACULTY, MEMBER) 인가, 대상 파일 확인 후 바이너리 스트림을 응답합니다.
3. 앱은 파일명을 안전하게 정제한 뒤 전용 보호 임시 캐시 디렉터리에 다운로드합니다 (기본 제한시간 120초).
4. 다운로드가 완료되면 Android에서는 시스템 파일 인텐트(VIEW Intent, flag 1 읽기 권한)를 통해 외부 PDF 뷰어로 전달하고, iOS에서는 `File.preview` 또는 공유 시트(`expo-sharing`)로 엽니다.
5. 앱 시작과 계정 전환·로그아웃 때 보호 캐시 전체(`hra-protected`)와 제출용 선택 사본(`hra-submissions`)을 삭제합니다. 내 제출 파일을 다시 받기 전에는 24시간이 지난 보호 캐시 파일을 추가로 정리하고, 새 다운로드는 최대 50MiB를 예약하며 캐시가 200MiB·20개 안에 들도록 오래된 파일부터 지웁니다.

### 과제 제출 및 비공개 파일 업로드 흐름

1. **의도 생성 (Create Intent)**: 모바일 앱이 `POST /api/v1/uploads/intents`를 호출하여 업로드 의도 ID와 불투명 경로(`pathname`)를 발급받습니다.
2. **토큰 교환 (Authorize)**: `POST /api/v1/uploads`에 `blob.generate-client-token` 요청을 보내 1회용 제한된 Vercel Blob 클라이언트 토큰을 받습니다.
3. **단일 PUT 업로드 (Single PUT Upload)**: 발급받은 클라이언트 토큰으로 Vercel Blob 저장소에 정확히 1회의 바이너리 PUT 전송을 수행합니다.
4. **검증 (Verify)**: 업로드 성공 여부와 관계없이 서버의 `POST /api/v1/uploads/{id}/verify`를 호출하여 실제 업로드된 파일의 크기, PDF 유효성을 검증합니다.
5. **최종화 (Finalize)**: `POST /api/v1/submissions`에 과제 ID, 업로드 의도 ID, 멱등성 보장을 위한 고유 `submissionKey`를 전송하여 제출을 원자적으로 확정합니다. 동일한 키로 재시도 시 이미 제출된 결과를 안전하게 반환받습니다.

## 8. 보안 규칙과 알려진 한계

### 네이티브 전송 계층의 재시도 한계

React Native와 Expo의 기본 fetch 런타임 및 `File.upload`는 네이티브 OkHttp 라이브러리를 사용합니다. OkHttp의 기본 연결 복구 재시도(connection-recovery retry) 동작은 JavaScript 계층에서 완전히 비활성화할 수 없습니다. 따라서 클라이언트가 단일 시도를 하더라도 네트워크 환경에 따라 네이티브 수준에서 복구 재전송이 발생할 수 있습니다. 시스템은 이에 대응하기 위해 서버의 업로드 멱등성 검증과 의도 확인 아키텍처에 의존합니다.

### 리다이렉트 거부 정책

모바일 API 클라이언트와 파일 업로드 요청은 fetch 옵션에 `redirect: 'error'`를 명시합니다. React Native의 Request 객체가 리다이렉트 정책을 누락할 수 있으므로 fetch 호출 시점의 init 객체에도 `redirect: 'error'`를 직접 전달합니다. 이를 통해 307이나 308 리다이렉트로 인해 인증 토큰이나 비밀번호 본문이 제3의 호스트로 전달되는 것을 방지합니다.

### 안전한 마크다운 파서 및 외부 링크

공지 상세의 마크다운 렌더러는 외부 서드파티 라이브러리 없이 자체 구축한 순수 TypeScript AST 파서를 사용합니다.

- 입력 100,000자, 5,000줄, 1,500개 블록, 중첩 깊이 8단계, 인라인 노드 1,000개, 표 열 32개의 상한에 더해 문서 전체가 공유하는 탐색 작업량 600,000단위·AST 할당 2,000단위의 예산을 두어, 조작된 본문이 과도한 CPU를 쓰는 것을 막습니다. 예산을 넘으면 남은 인라인은 평문으로 표시하고 이후 블록은 생략합니다.
- 링크는 `http:`, `https:`, `mailto:`, `tel:` 스킴만 허용하며 탭 시 반드시 사용자 확인 대화상자("외부 링크를 엽니다")를 거칩니다.
- 이미지는 자격 증명이 없는 `https:` URL만 허용하고 상대 경로나 데이터 URI는 렌더링하지 않습니다. 호스트가 API 주소와 같거나 `.public.blob.vercel-storage.com` 하위인 이미지만 문서당 최대 20개까지 자동으로 불러오며, 그 밖의 이미지는 "이미지 불러오기" 버튼을 누르기 전에는 요청하지 않습니다.

## 9. 검증 완료 항목과 미검증 범위

### 검증 완료된 항목

- **모바일 테스트 스위트**: Jest 및 React Native Testing Library 기반 총 50개 스위트, 447개 테스트 전수 통과 (열린 핸들 없이 정상 종료).
- **실제 로컬 서버 하네스 (E2E)**: 최신 Next.js 프로덕션 빌드, 격리 PostgreSQL 14, 실제 G1 파일 저장소 환경에서 원시 HTTP, 모바일 클라이언트 모듈 7사례, 빌드 출처 검증과 비밀 유출·외부망 가드를 포함한 44개 PASS 출력이 종료 코드 0으로 통과 (2026-11-04, #438·#440 병합 뒤 main 기준 1회) (`scripts/verify-mobile-bearer-http.mjs`).
- **도구 및 내보내기 진단**: `expo-doctor` 20개 항목 전수 통과(`EXPO_OFFLINE=1`, 설치된 SDK 58.0.21의 `bundledNativeModules.json` 기준. 2026-11-04 온라인 비교는 그 뒤 배포된 패치 7건의 차이를 보고하며 업그레이드는 별도 작업), `expo export --platform android` 번들링 통과 (1,373개 모듈, 3.2MB Hermes 바이트코드), `expo export --platform ios` JS 번들링 통과 (1,380개 모듈, 네이티브 컴파일이 아닌 플랫폼 중립 코드 확인). 두 export는 `mobile.yml`의 checks job이 실행하도록 구성했으며 GitHub 호스트 실행 자체는 로컬에서 검증하지 못했습니다.
- **네이티브 디버그 빌드**: Gradle 기반 `app-debug.apk` 컴파일 및 생성 통과 (약 235MB, 전체 재빌드 약 20~40분 소요). debug·release 변형의 병합 매니페스트를 Gradle로 직접 만들어 확인했습니다. **release** 변형의 권한은 `INTERNET`, `VIBRATE`뿐이며 (앱 자체 서명 권한 제외) 쓰지 않는 `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`는 `app.config.ts`의 `blockedPermissions`로 제거했습니다(`tests/app-config.test.ts`가 회귀를 막습니다). **debug** 변형만 개발 도구용으로 `SYSTEM_ALERT_WINDOW`(debug 소스 세트)와 `ACCESS_LOCAL_NETWORK`(React Native debug 라이브러리)를 추가로 가집니다. release 변형은 `assembleRelease`를 arm64-v8a 한 ABI로 컴파일해 확인했습니다(R8 축소 켜짐, Hermes 번들 `assets/index.android.bundle` 포함, 약 30MB, `aapt2 dump badging`의 권한은 `INTERNET`, `VIBRATE`뿐, `usesCleartextTraffic=false`, `debuggable` 없음). 이 산출물은 생성 프로젝트의 기본 debug 키로 서명되어 배포할 수 없으며, 네 ABI 전체 release 빌드와 서명된 APK/AAB는 만들지 않았습니다.

### 아직 검증되지 않은 범위

- **실제 Android 하드웨어 및 에뮬레이터 실행**: 본 개발 환경에는 KVM 및 물리 기기가 없으므로 실제 화면의 레이아웃 체감, 터치 제스처 반응성을 확인하지 못했습니다.
- **보조기술 (TalkBack) 음성 출력**: 접근성 레이블과 상태 prop은 단위 테스트로 검증했으나, 실제 TalkBack 초점 이동 순서와 한국어 음성 안내는 미검증 상태입니다.
- **실기기 하드웨어 보안 키스토어 및 파일 인텐트**: 실제 기기에서의 SecureStore 생체/하드웨어 암호화 동작, 시스템 문서 선택기(Document Picker), 외부 PDF 뷰어 연동은 기기 검증이 필요합니다.
- **iOS 네이티브 컴파일 및 기기 검증**: 공통 코드베이스로 작성되었으나 Linux 환경에서는 iOS 네이티브 컴파일 및 시뮬레이터 실행을 수행할 수 없습니다.
- **Google Play 스토어 제출 및 EAS 클라우드 빌드**: 실제 배포용 서명 키 생성, 릴리스 번들(AAB) 생성, EAS 계정 연동은 진행하지 않았습니다.
- **소셜 로그인 (Google, Kakao)**: 모바일 환경에서의 OAuth 웹뷰 또는 네이티브 SDK 연동은 MVP 범위에서 제외되었습니다.

## 10. 출시 전 소유자 결정 사항

모바일 앱을 실제 사용자에게 배포하기 전에 프로젝트 소유자가 반드시 결정하고 조치해야 하는 항목들입니다.

1. **Android 패키지 식별자 (Package Name) 확정**:
   - 현재 `app.config.ts`에는 임시 자리표시자인 `com.hra.mobile`이 지정되어 있습니다.
   - Google Play Console에 앱을 처음 업로드한 이후에는 패키지 식별자를 변경할 수 없으므로, 조직의 공식 패키지 명칭(예: `org.hra.app` 등)을 확정해야 합니다.
2. **iOS 번들 식별자 (Bundle Identifier) 확정**:
   - Apple App Store 등록에 사용할 공식 번들 ID를 결정해야 합니다.
3. **운영 HTTPS API 기본 주소 준비**:
   - 프로덕션 배포 시 `EXPO_PUBLIC_API_BASE_URL`에 주입할 유효한 보안 도메인을 설정해야 합니다.
4. **버전 코드 (versionCode) 및 릴리스 서명 정책**:
   - 현재 `android.versionCode = 1`입니다. Google Play 업로드 시마다 버전 코드를 단조 증가시켜야 하므로 수동 관리할지 또는 EAS 원격 버전 자동 증가를 사용할지 결정해야 합니다.
   - 프로덕션 릴리스 서명 키(Keystore)의 생성, 안전한 보관 장소, 배포 파이프라인 비밀 관리가 필요합니다.
5. **개인정보 처리방침 (Privacy Policy) URL 등록**:
   - Google Play 스토어 등록 및 앱 내 표시를 위한 개인정보 처리방침 웹 페이지 주소가 필요합니다 (`src/features/profile/config.ts`의 `privacyPolicyUrl` 기본값은 현재 빈 문자열입니다).
6. **모바일 소셜 로그인 지원 여부**:
   - 현재 모바일은 이메일과 비밀번호로만 로그인합니다. 추후 Google이나 Kakao 로그인을 모바일 앱에 지원할지 여부와 일정을 결정해야 합니다.
7. **기기 식별 및 푸시 알림 아키텍처 (#275)**:
   - 후속 작업으로 계획된 기기 등록 모델과 푸시 알림 제공자(APNs, FCM) 도입 결정을 진행해야 합니다.
   - #274의 MVP 기능 목록에 있는 "기본 알림 진입점"(알림 화면, 푸시 권한 요청)은 구현하지 않았습니다. 현재 알림에 가장 가까운 진입점은 홈의 "최근 공지" 영역과 공지 탭입니다. 이것으로 그 항목을 충족한다고 볼지, 별도 화면이 필요한지는 소유자가 정해야 합니다.
8. **데이터베이스 마이그레이션 운영 적용 (#280)**:
   - 모바일 세션을 위한 DB 마이그레이션 파일(`scripts/migrate-mobile-sessions.sql`)은 로컬 테스트 환경에서만 검증되었습니다.
   - 실제 운영 DB 배포 전 [데이터베이스 변경 절차](database-change-procedure.md)에 따라 승인 및 적용을 완료해야 합니다.
9. **세션 정리 크론 작업 (Cron) 등록**:
   - 만료되거나 폐기된 모바일 세션을 주기적으로 청소하는 엔드포인트 `/api/cron/cleanup-mobile-sessions`가 구현되어 있습니다.
   - Vercel Cron 또는 외부 스케줄러에 이 엔드포인트를 등록하고 주기를 정해야 합니다. 권장 주기는 매시간이며 호출당 최대 1,000세션을 삭제합니다. 근거와 적체 감시 방법은 [모바일 인증 라우트](mobile-auth-routes.md)와 [모바일 세션 migration](mobile-session-migration.md)에 있습니다.
   - 현재 `vercel.json`에는 이 경로가 등록되어 있지 않습니다. 환경 계약 검사(`scripts/check-environment-contract.mjs`)는 등록된 일정을 요청 제한 정리 하나로 고정하므로 등록하려면 그 계약과 생성 문서도 함께 바꿔야 합니다.
10. **비밀번호 변경 시 세션 버전 증가 규칙 준수**:
    - `scripts/seed-admin.mjs`의 안내에 반영된 것과 같이, DB에서 관리자 비밀번호를 수동으로 변경하거나 비밀번호 재설정 기능을 구현할 때는 `password_hash` 변경과 함께 반드시 `session_version = session_version + 1`을 동일한 문장에서 실행해야 기존 모바일 세션이 정상 무효화됩니다.
11. **모바일 의존성 감시 범위**:
    - (#446 반영) 저장소의 Dependabot 설정(`.github/dependabot.yml`)과 `npm run verify:dependencies`는 루트 `package-lock.json`과 함께 `apps/mobile/package-lock.json`도 대상으로 합니다. 모바일 권고는 별도 원장 `security/mobile-dependency-triage.json`에서 검토하며 처리 내역은 [저장소 보안 게이트](repository-security-gates.md)의 "모바일 앱 lockfile" 절에 있습니다. `sharp`는 0.35.5로 갱신했습니다. Android 네이티브(Gradle/Maven) 라이브러리는 여전히 자동 감시 범위에 없습니다.
    - 아래 두 항목은 #446 이전 시점의 점검 기록입니다.
    - 2026-10-31에 `apps/mobile`에서 `npm audit`을 실행한 결과 전체 의존성에서 취약점이 보고된 패키지가 49개(높음 3, 보통 45, 낮음 1)입니다. 높음 항목은 `sharp`(아이콘 생성용 직접 devDependency), `zod`(`@expo/cli` 빌드 도구의 전이 의존성), `@expo/cli`입니다. release JS 번들의 소스 맵(1,348개 모듈, npm 패키지 50개)에는 보고된 패키지와 빌드·테스트 도구(`sharp`, `zod`, `glob`, `minimatch`, `deepmerge`, `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/prebuild-config`, `@expo/metro-config`, `@expo/fingerprint`, `jest`, `eslint`)가 하나도 들어 있지 않습니다.
    - 이 결과는 특정 시점의 점검이며 취약점이 앱에 영향을 주지 않는다는 보증이 아닙니다. 네이티브 라이브러리(AAR)는 `npm audit`의 대상이 아닙니다. 출시 전에 모바일 lock을 Dependabot 대상에 추가할지, 별도 점검을 CI에 둘지 소유자가 정해야 합니다. `sharp`는 앱 번들에 포함되지 않는 개발 도구이며 더 새 버전(0.35.5)이 나와 있습니다. 0.x 마이너 상승이므로 올릴 때는 아이콘 생성 스크립트(`apps/mobile/scripts/generate-icons.mjs`)로 결과를 확인해야 합니다.

## 11. Google Play 공개 전 검토 자료 (#274 완료 조건)

#274는 Play 공개 전에 개인정보·권한·앱 링크·버전 업데이트 정책을 검토하도록 요구합니다. 아래는 현재 코드와 빌드 결과로 확인한 사실이며, 검토와 결정은 소유자가 합니다. Play Console의 양식 작성이나 심사를 대신하지 않습니다.

### 권한

- release 변형 병합 매니페스트의 권한은 `INTERNET`, `VIBRATE`입니다(앱 자체 서명 권한 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` 제외). `VIBRATE`는 Expo 기본 템플릿이 넣는 권한이며 앱 코드는 진동 API를 쓰지 않으므로 유지할지는 소유자가 정합니다.
- 위 권한 목록은 병합 매니페스트(`processReleaseManifest`)와 실제로 컴파일한 release APK(arm64-v8a)의 `aapt2 dump badging`에서 모두 확인했습니다.
- 쓰지 않는 `SYSTEM_ALERT_WINDOW`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`는 `blockedPermissions`로 제거합니다. 파일은 앱 캐시와 시스템 문서 선택기만 사용하므로 저장소 권한이 필요 없습니다.
- release는 평문 HTTP를 허용하지 않습니다(`usesCleartextTraffic=false`와 네트워크 보안 설정).

### 개인정보·데이터 안전

- 서버로 보내는 정보: 로그인 때 이메일·비밀번호와 기기 정보 중 `platform`·`appVersion`만 보냅니다(`deviceName`은 보내지 않습니다). 서버는 세션 행에 `platform`·`app_version`·`device_name`을 저장할 수 있습니다.
- 기기에 저장하는 정보: 갱신 토큰·갱신 만료 시각·최소 프로필(id·이름·역할)과 제출 재개 기록은 SecureStore에만 저장합니다. 액세스 토큰은 메모리에만 둡니다.
- 백업: `expo-secure-store`가 포함하는 자동 백업 규칙(`secure_store_backup_rules.xml`, `secure_store_data_extraction_rules.xml`)은 SecureStore가 쓰는 SharedPreferences 파일(`SecureStore`)을 클라우드 백업과 기기 이전에서 제외합니다. 규칙 파일의 내용과 AOSP의 백업 규칙 해석 코드로 확인했습니다(`path="SecureStore"` 규칙은 `SecureStore.xml`도 함께 제외하도록 처리되며, 이 처리는 minSdk 24인 Nougat부터 Android 14까지의 소스에 모두 있습니다). 실제 기기에서 백업·복원을 해 보지는 못했습니다. 비공개 PDF 다운로드와 제출 선택 사본은 앱 캐시(`Paths.cache`)에만 두며, Android는 캐시 디렉터리를 자동 백업에서 기본 제외합니다.
- 분석·광고·충돌 수집 SDK는 직접 의존성에 없습니다(`apps/mobile/package.json` 기준). 전이 의존성 전체를 조사한 것은 아니므로 Data safety 양식을 쓰기 전에 최종 AAB 기준으로 SDK 목록을 확인해야 합니다.
- 개인정보 처리방침 URL은 아직 없습니다(위 §10 5번).

### 앱 링크

- 현재 `hra://` 사용자 지정 스킴만 등록합니다(release 병합 매니페스트의 VIEW·BROWSABLE 인텐트 필터 1개, `autoVerify` 없음). 도메인 검증 기반 https App Links(`assetlinks.json`)는 구성하지 않았습니다.
- 라우트 가드는 딥링크 쿼리의 `redirect` 값을 읽지 않고 고정된 내부 목적지로만 이동합니다(`src/auth/route-guard.tsx`). 로그아웃 상태의 딥링크는 로그인 화면으로 보냅니다.
- 공개 도메인과 App Links를 도입할지는 소유자가 결정해야 합니다. 도입하려면 패키지 ID와 서명 인증서 지문이 먼저 확정되어야 합니다.

### 버전 업데이트 정책

- `version`(0.1.0)과 `android.versionCode`(1)는 수동 값입니다(§10 4번).
- 앱은 로그인 때 `appVersion`을 서버로 보내고 서버는 세션에 저장하지만 **최소 지원 버전 검사나 강제 업데이트 응답은 없습니다**.
- OpenAPI 계약은 append-only 게이트로 기존 계약을 깨지 않게 지킵니다. 그래도 호환되지 않는 변경이 필요해질 때 구버전 앱에 어떻게 알릴지(앱 내 안내, 서버의 최소 버전 응답, Play 앱 내 업데이트 중 무엇을 쓸지)는 정해지지 않았습니다.
