# HRA Web → Android → iOS 플랫폼 전환 로드맵

> 이 문서는 출시일을 약속하지 않는다. 구조 개편의 의존 순서와 완료 조건을 관리한다. 전체 추적 이슈는 #277이다.

## 현재 구현과 이 계획의 관계

이 문서는 앞으로의 Web·Android·iOS 전환 순서를 읽으려는 개발자를 위한 목표 문서다. 현재 Next.js 앱은 저장소 루트에 있고 순수 계약은 `packages/contracts` workspace에 있으며 `GET /api/v1/notices`, Web 세션 기반 `GET /api/v1/me`, `GET /api/v1/schedule`을 제공한다. 모바일 Bearer 인증 서버 로직(#273)과 `apps/mobile` MVP 화면(#274)도 코드에 있다. [현재 API v1 범위](developer/api-v1.md), OpenAPI 정본, [모바일 앱 개발 안내](developer/mobile-app.md)에서 구현 상태를 확인한다. `apps/web`, 나머지 공용 API와 OpenAPI 완성은 이 계획의 후속 경계다.

이 구현은 로컬 개발 환경과 실제 서버 하네스에서 검증한 상태다. 모바일 세션 DB 변경은 실제 DB에 적용하지 않았고, `apps/mobile`은 미출시 상태이며 독립 보안 검토, 실기기 E2E, 릴리스 빌드 게이트가 아직 남아 있다.

API-first는 화면 종류가 달라도 같은 요청·응답 약속을 사용한다는 뜻이다. 모듈러 모놀리스는 기능을 나누되 서버는 하나의 배포 단위로 유지한다는 뜻이고, monorepo는 여러 앱과 공용 코드를 한 저장소에서 관리한다는 뜻이다. 세부 용어는 [용어집](getting-started/glossary.md)에 있다.

현재 결함·운영 보호와 신규 확장의 우선순위는 [전체 추적 #300](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)을 따른다. 이 단계 표는 출시일이나 운영 준비 완료를 보장하지 않는다.

## 결정

- 환경 기본값: **Local Development → PR Preview/Test → Production**
- 고정 Staging: 모바일 내부 테스트/Store 검수 등 명확한 목적이 생길 때만 추가
- 비운영 환경에서 Production DB·Blob·PII·session/token 공유 금지
- 환경 전략 정본: [환경 분리 및 배포 전략](developer/environment-strategy.md)

- 목표: Web + Android + iOS
- 모바일: **React Native + Expo 단일 코드베이스**
- 서버: **API-first modular monolith**
- 저장소: **monorepo**
- 출시 순서: **Web 구조 개편 → Android 첫 출시 → iOS 출시**
- 운영 Admin: 당분간 Web 유지
- Microservice: 도입하지 않음

## Phase 0 — 보안 선행

구조 개편 전에 현재 알려진 기반 취약점을 먼저 없앤다.

- #266 Next.js 보안 버전 업데이트
- #267 Auth.js/next-auth 보안 업데이트
- #268 보호 자료 Private Blob 운영 검증
- #269 Public 저장소 보안 hardening
- #279 환경 분리, #280 DB migration gate, #282 운영 설정 문서 확인

Phase 0은 새 구조가 취약한 dependency를 그대로 확대하지 않기 위한 선행 조건이다.

## Phase 1 — 기존 Web과 서버 구조 전환

실서비스 전이므로 점진적 호환 layer를 장기간 유지하기보다 목표 경계를 한 번에 확정한다. 단, 한 PR에 모든 module을 무제한 혼합하지 않고 module 단위로 완료한다.

### #271 API-first modular monolith

- monorepo 기본 구조
- Application Service
- Repository
- infrastructure adapter
- Page/Server Action 직접 DB 접근 제거
- 기존 Web을 새 service에 연결

### #272 API v1 / OpenAPI

- `/api/v1`
- `/api/internal`
- DTO mapping
- error code
- pagination/date-time
- OpenAPI/contract compatibility

### #273 공용 인증

- Principal
- Web Auth.js adapter
- Mobile bearer adapter
- access/rotating refresh token
- revoke/sessionVersion
- Google/Kakao/향후 Apple identity

### Phase 1 종료 게이트

다음을 모두 만족해야 Android 구현을 시작한다.

- 기존 Web 기능/권한/자료실/학사 E2E 통과
- 모바일이 DB나 Server Action을 몰라도 OpenAPI만 보고 주요 기능 구현 가능
- Application Service를 Web과 API가 공통 사용
- auth principal이 Web/Mobile transport와 분리
- 직접 DB access 예외가 문서화된 infrastructure/repository에 한정

## Phase 2 — Android 첫 출시

### #274 React Native + Expo / Android MVP

구현 상태: `apps/mobile` MVP 화면 구현, 미출시 상태.

MVP 화면:

- 로그인 (`app/(auth)/login.tsx`)
- 홈 (`app/(app)/(tabs)/index.tsx`)
- 공지 (`app/(app)/(tabs)/notices.tsx`, 상세 `app/(app)/notices/[id].tsx`)
- 일정 (`app/(app)/(tabs)/schedule.tsx`)
- 자료실 (`app/(app)/(tabs)/resources.tsx`, 가이드북 목록과 보호 PDF 다운로드)
- 내 정보 (`app/(app)/(tabs)/profile.tsx`)
- 내 과제 (`app/(app)/assignments/index.tsx`, 상세 `[id].tsx`)
- 과제 제출 (`app/(app)/assignments/[id]/submit.tsx`)

운영 기능은 Web Admin에 유지한다.

Android 전용 코드를 먼저 만들고 iOS를 나중에 재작성하지 않는다. 앱 코드는 처음부터 `apps/mobile` 공통 codebase이고 Android만 먼저 Store에 공개한다.

검증 범위와 미검증 범위는 [모바일 앱 개발 안내](developer/mobile-app.md)를 정본으로 한다.

### #275 Device / Push

- Android/iOS 공용 device model
- NotificationService
- token rotation/revoke
- provider failure와 business transaction 분리
- 첫 알림 이벤트

### Phase 2 종료 게이트

상태: 게이트 열려 있음 (실기기 검증, 독립 보안 검토, 릴리스 빌드 대기).

- Android 실기기 핵심 E2E
- 보조기술(TalkBack) 음성 출력과 접근성 실기기 검증
- 보호 자료 직접 URL 우회 불가
- 과제 private upload/finalize 복구 흐름 통과
- mobile token logout/revoke 통과
- Android release build (현재는 debug APK만 CI에서 빌드)
- iOS build/compile check도 계속 통과
- Play Store 공개 준비 완료

## Phase 3 — iOS

### #276 동일 React Native 앱의 iOS 출시

주요 추가 범위:

- Sign in with Apple 요구사항
- iOS Keychain
- APNs/선택한 push provider
- Universal Links/deep link
- iOS permission/privacy metadata
- App Store review

### Phase 3 종료 게이트

- iPhone 실기기 로그인→자료→과제 제출 핵심 E2E
- Android와 공통 feature/network/domain 유지
- Android 회귀 없음
- App Store release build/심사 완료

## 이후 확장

이 구조에서는 다음 기능이 생겨도 서버 핵심 구조를 다시 만들지 않는 것을 목표로 한다.

- iPad/tablet UI
- 출결 Advisor/조교 모바일 기능
- 교수 과제 검토
- 관리자 전용 모바일 기능(필요 시)
- 외부 시스템 연동
- 제한된 공개 API
- background worker 분리

실제 독립 scaling이나 장애 격리가 필요한 workload가 확인되면 그때 notification/file processing 같은 일부 infrastructure를 분리한다. 처음부터 microservice로 전환하지 않는다.

## 변경 금지 원칙

구조 개편 때문에 다음 안전장치를 약화하지 않는다.

- OAuth binding
- sessionVersion
- 권한별 object ownership 검사
- rate limit
- private Blob
- upload intent / verify / finalize
- DB UNIQUE/FK/CHECK/transaction
- audit/observability
- 기존 PostgreSQL integration 및 HTTP security test

