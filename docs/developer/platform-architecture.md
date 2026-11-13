# HRA 멀티클라이언트 플랫폼 아키텍처

> 상태: **목표 아키텍처**. 현재 `main`의 디렉터리 구조를 설명하는 문서가 아니라 #277에서 진행하는 구조 개편의 정본이다.

HRA는 Web만 제공하는 사이트에서 **Web + Android + iOS**를 지원하는 하나의 서비스 플랫폼으로 확장한다. 실서비스 전 구조 변경 비용이 낮은 시점을 활용하되, 이미 검증된 학사 도메인·DB 제약·인가·Private Blob·감사·테스트를 버리지 않는다.

## 처음 읽는 분을 위한 안내

아키텍처는 프로그램을 어떤 부분으로 나누고 각 부분이 무엇을 책임질지 정하는 구조다. 이 문서는 **앞으로 코드를 만들거나 재편할 때의 기준**이며 현재 모든 파일이 이미 이 구조라는 뜻은 아니다.

- **API-first:** Web과 모바일이 함께 사용할 입력·출력 약속을 먼저 정한다.
- **모듈러 모놀리스:** 기능은 나누고 서버 배포는 하나로 유지한다.
- **monorepo:** Web·모바일·공통 코드를 한 Git 저장소에서 관리한다.

3절의 계층별 역할을 읽은 뒤 필요한 기능의 계약과 10절의 환경 구분으로 이동한다. 현재 경로는 [폴더 안내](../GUIDE.md), 용어는 [용어집](../getting-started/glossary.md), 착수 순서는 [플랫폼 로드맵](../PLATFORM-ROADMAP.md)을 참고한다.

## 1. 아키텍처 결정

HRA의 목표는 **API-first modular monolith + monorepo**다.

- 서버는 하나의 배포 단위와 하나의 PostgreSQL을 유지한다.
- 기능별 모듈의 책임과 호출 경계를 분명히 나눈다.
- Web, Android, iOS가 같은 업무 서비스(Application Service)와 권한 정책을 사용한다.
- Android/iOS는 별도 앱 두 개가 아니라 **React Native + Expo 단일 코드베이스**를 사용한다.
- Microservice, Kafka/RabbitMQ, 분산 트랜잭션은 실제 독립 확장 필요가 생기기 전까지 도입하지 않는다.

| 요청의 출발점 | 서버에 들어오는 방식 | 함께 사용하는 핵심 기능 |
| --- | --- | --- |
| 웹 브라우저 | Next.js 페이지·Server Action | 인증된 사용자 정보와 같은 Application Service |
| Android·iOS 앱 | 공개 계약인 `/api/v1` HTTP API | 웹과 같은 Application Service와 권한 검사 |

서버의 업무 기능은 Repository를 통해 PostgreSQL을 읽고 쓴다. 파일 저장·알림 같은 외부 서비스 연결은 Infrastructure가 맡는다. 웹 서버 내부에서 함수를 직접 호출할 수 있는 경우에도 자기 API에 다시 HTTP 요청하도록 강제하지 않는다.

```text
       Web (Next.js)            Android / iOS (React Native + Expo)
             │                                  │
      Web Server Action                      API v1
             │                                  │
    Web session → Principal        Mobile authentication → Principal
             │                                  │
             └─────── Application Services ─────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
             Academics      Content      Identity
                 │            │            │
                 └────── Repositories ─────┘
                              │
                         PostgreSQL
                              │
                   Blob / Push / External
```

## 2. 목표 저장소 구조

구조 전환 완료 뒤의 기준 형태다. 세부 폴더 이름은 PR에서 조정할 수 있지만 계층 책임은 유지한다.

| 목표 경로 | 넣을 코드와 책임 |
| --- | --- |
| `apps/web/` | Next.js 화면과 웹 입력·출력 처리 |
| `apps/mobile/` | React Native + Expo의 Android·iOS 공통 앱 |
| `packages/contracts/` | OpenAPI, 주고받는 데이터 형식(DTO), 오류 코드 |
| `packages/schemas/` | 클라이언트에도 전달할 수 있는 순수 입력 검증 |
| `packages/shared/` | 날짜·상수·부작용 없는 공통 함수 |
| `packages/design-tokens/` | 필요한 경우 공유할 색상·간격 값 |
| `packages/config/` | TypeScript·ESLint 등의 공통 설정 |
| `server/modules/` | 계정, 사용자, 학적, 과제, 자료, 공지, 일정, 지원서별 업무 기능 |
| `server/infrastructure/` | DB·인증 제공자·Blob·알림·로그 연결 |
| `server/api/v1/` | 웹·모바일이 사용하는 공개 HTTP 계약 |
| `server/api/internal/` | 상태 확인·예약 작업 등 운영 전용 API |
| `docs/` | 현재 동작, 구조 결정, 운영 절차 |

이 표의 경로를 만들었다는 이유만으로 전환이 완료되지는 않는다. 같은 규칙이 여러 화면에 중복되지 않고, 권한·데이터 제약과 기존 테스트가 유지되는지 확인한다.

## 3. 계층별 책임

### Client / Adapter

Web page, Web Server Action, API route, React Native 화면은 각 화면·통신 방식의 입력과 출력을 변환하는 adapter(연결 계층)다.

Web Server Action은 다음 역할까지만 담당한다.

1. Web 입력(FormData 등)을 contract 입력으로 변환
2. Web session에서 Principal 생성
3. Application Service 호출
4. `revalidatePath` / redirect처럼 Web 전용 후처리

Server Action 안에서 핵심 정책을 새로 만들거나 UI에서 DB를 직접 읽고 쓰지 않는다.

### Application Service

Application Service는 “과제를 공개한다”, “제출을 확정한다”처럼 HRA의 업무 동작을 담당한다. 화면이나 통신 방식이 달라도 같은 규칙을 적용한다.

다음은 목표 역할을 설명하는 호출 예시다. 현재 함수의 인자를 그대로 옮긴 코드는 아니다.

```ts
finalizeSubmission({
  actor,
  assignmentId,
  uploadIntentId,
  requestId,
})
```

동일 service를 Web Server Action과 `/api/v1` route가 함께 호출한다. HTTP self-call을 통해 Web이 자기 API를 호출하도록 강제하지 않는다.

### Repository

Repository는 PostgreSQL/Drizzle을 통한 데이터 읽기·쓰기를 맡는다. 여기서 Repository는 GitHub 저장소가 아니라 데이터 접근 코드를 뜻한다.

- Page/API가 직접 Drizzle row를 contract로 반환하지 않는다.
- DB row와 API DTO는 mapping한다.
- transaction, lock, SQL function, UNIQUE/FK/CHECK 등 현재 검증된 DB 안전장치는 repository/infrastructure 아래에서 유지한다.

### Infrastructure

Infrastructure는 DB, Auth.js, Vercel Blob, 알림 제공자와 연결하는 세부 코드를 모은다. 업무 서비스가 특정 회사의 SDK 사용법에 직접 의존하지 않도록 한다.

## 4. API-first 원칙

모바일은 Next.js Server Action이나 DB schema를 알지 않는다. 공용 계약은 `/api/v1`과 OpenAPI가 정본이다.

초기 MVP 계약:

```text
GET    /api/v1/me
GET    /api/v1/notices
GET    /api/v1/notices/{id}
GET    /api/v1/schedule
GET    /api/v1/resources
GET    /api/v1/resources/{id}
GET    /api/v1/me/assignments
GET    /api/v1/me/assignments/{id}
POST   /api/v1/.../uploads/intents
POST   /api/v1/.../uploads/{id}/verify
POST   /api/v1/.../submissions
```

health/cron/운영 API는 `/api/internal` 계열로 분리한다.

### API와 DB 모델 분리

DB의 내부 상태를 그대로 반환하지 않는다.

Repository가 읽은 **DB 행**에서 필요한 필드만 골라 **API DTO**로 변환한 뒤 웹·Android·iOS에 반환한다. 저장용 구조가 바뀌어도 앱의 약속된 응답 형식에 미치는 영향을 따로 검토할 수 있다.

### 오류 계약

클라이언트는 한국어 문구를 파싱하지 않는다.

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "로그인이 필요합니다.",
    "requestId": "..."
  }
}
```

error code, HTTP status, retry 가능 여부를 contract test로 고정한다.

## 5. 인증·인가

Web과 Mobile의 세션 방식은 달라도 authorization은 같아야 한다.

웹의 Auth.js 쿠키와 모바일의 Bearer 토큰은 서로 다른 인증 수단이다. 서버는 각 인증 결과를 공통 사용자 정보인 **Principal**로 바꾼 뒤, 같은 권한 검사와 업무 기능을 호출한다.

서버가 사용하는 공통 주체는 대략 다음 정보를 가진다.

```ts
type Principal = {
  userId: string;
  role: UserRole;
  sessionVersion: number;
};
```

> **G2 출결 인가 경계(설계 중·미구현):** 위 `Principal.role`만으로 출결을 허용하지 않는다. `ADMIN`은 홈페이지 관리 권한이며, `FACULTY`는 출결 담당자가 아니다.
> 출결은 검증된 로그인 계정과 해당 기수에 대한 유효한 기간 배정을 함께 확인해야 한다. 운영 인력은 어드바이저 1명과 조교 2명이며 교체·배정 종료 이력을 반영한다. 이를 새 전역 사용자 역할 신설로 해석하지 않는다.
> [학사관리 로드맵](../ACADEMIC-MANAGEMENT-ROADMAP.md)과 [데이터 모델](../ACADEMIC-DATA-MODEL.md)의 경계를 유지한다. 보존·파기 정책 [#142](https://github.com/Human-Renaissance-Academy/hra-website/issues/142), 정정·최종 승인 및 학사 운영 권한 정책 [#143](https://github.com/Human-Renaissance-Academy/hra-website/issues/143)은 미정이다.

Web은 Auth.js cookie를 유지할 수 있다. Mobile은 short-lived access token + rotating refresh token을 사용한다. refresh token 원문은 서버 DB에 저장하지 않고 hash, 만료, 회전, revoke 상태를 관리한다.

사용자 삭제·role/sessionVersion 변경은 Web/Mobile 세션 모두에 동일한 무효화 정책을 적용한다.

Google/Kakao identity는 이메일과 동일시하지 않고 `provider + providerAccountId` 바인딩을 유지한다. iOS 출시를 위해 Apple identity 확장이 가능한 구조를 처음부터 보존한다.

## 6. React Native 공유 범위

Android와 iOS는 `apps/mobile` 하나를 사용한다. 가능한 모든 feature/network/domain 코드는 공통이다.

공유 권장:

- API contracts와 generated client
- error code
- pure validation
- 날짜/상수/pure utility
- design token

억지로 공유하지 않는 것:

- Next.js UI component
- React Native component 구현
- navigation 구현
- browser cookie / iOS Keychain / Android secure storage 세부 구현

필요한 경우에만 `.android.ts`, `.ios.ts`를 사용한다.

## 7. 파일/Blob

Private Blob server token은 Web 브라우저나 모바일 앱에 노출하지 않는다.

기존 학사 제출의 안전한 흐름을 유지한다.

1. 클라이언트가 특정 과제에 파일을 올리겠다는 요청을 보낸다.
2. 서버가 현재 사용자와 제출 대상의 권한을 확인한다.
3. 경로·종류·크기·만료가 제한된 업로드 권한을 발급한다.
4. 클라이언트가 파일을 올린다.
5. 서버가 저장된 실물의 형식·크기·파일 시그니처·해시를 검증한다.
6. 검증된 파일과 학생의 제출 기록을 원자적으로 확정한다.

Android/iOS에서도 같은 서버 검증을 사용하되, 현재 브라우저용 파일 업로드 코드가 그대로 작동한다고 가정하지 않는다. 모바일 파일 API에 맞는 연결 코드를 만들고 HTTP 업로드 계약으로 검증한다. 서버의 검증·원자성 정책은 유지한다.

## 8. Push와 Device

Android 먼저 출시하더라도 Android 전용 DB 모델을 만들지 않는다.

```text
device_installations
- id
- user_id
- platform: ANDROID | IOS
- push_token
- app_version
- last_seen_at
- revoked_at
```

NotificationService는 FCM/APNs/Expo provider와 application event를 분리한다. 핵심 transaction 성공이 push 성공에 의존하지 않는다.

## 9. 테스트 전략

중심은 Application Service + 실제 PostgreSQL integration test다.

| 검사 | 확인하는 내용 |
| --- | --- |
| Unit, 단위 검사 | 순수 업무 규칙과 입력 검증 |
| Integration, 통합 검사 | Service와 격리 PostgreSQL의 실제 동작 |
| Contract, 계약 검사 | OpenAPI와 API v1의 입력·출력 약속 |
| Web E2E | 브라우저에서 이어지는 Next.js 사용자 흐름 |
| Mobile E2E | Android·iOS의 사용자 흐름 |

기존 auth/DB race/private upload/route audit 테스트는 구조 변경 과정에서도 삭제하거나 완화하지 않는다.

## 10. 환경 및 배포 경계

환경 분리는 [환경 분리 및 배포 전략](environment-strategy.md)을 정본으로 한다.

기본은 **Local Development → PR Preview/Test → Production**이며, 고정 Staging은 Android/iOS 내부 배포나 반복 pre-production 검수가 실제로 필요해질 때만 추가한다.

- Preview는 Production DB/Blob/PII를 사용하지 않는다.
- DB migration은 Vercel build와 분리한다.
- monorepo 전환 뒤 `apps/web`은 Vercel, `apps/mobile`은 Expo EAS가 담당한다.
- Web/Android/iOS release는 서로 독립적으로 실행·롤백 가능해야 한다.

## 11. CI 목표

monorepo PR 하나에서 가능한 범위로 다음을 검증한다.

- 코드 규칙과 타입 검사
- 서버 단위 검사와 격리 PostgreSQL 통합 검사
- API 계약·OpenAPI 검사
- 웹 빌드와 브라우저 검사
- 모바일 타입 검사
- Android 빌드
- iOS 컴파일·빌드 검사

Android를 먼저 출시해도 iOS 코드가 장기간 깨진 상태로 방치되지 않게 한다.

## 12. 의도적으로 하지 않는 것

- Microservice 선도입
- Web UI와 React Native UI 강제 공유
- DB row를 그대로 API 모델로 사용
- Android 전용 auth/API/device 구조
- iOS 별도 재작성
- 기존 검증된 학사 보안 경계를 구조 개편 편의를 위해 완화

## 13. 추적

전체 전환 순서와 출시 게이트는 #277 및 [플랫폼 전환 로드맵](../PLATFORM-ROADMAP.md)을 따른다.

