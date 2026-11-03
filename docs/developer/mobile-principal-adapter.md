# API v1 모바일 요청 주체 어댑터

## 경계와 설계

`src/lib/api-v1-principal.ts`는 #273의 임시 전송 어댑터다. 기존 Auth.js 쿠키 세션이나 전역 `auth()`, `getRequestSession`을 바꾸지 않는다. 보호 v1 경로만 `withApiV1Principal(request, handler, failure)`를 호출한다. 공개 공지·일정, 페이지, 관리자, Server Action, legacy API는 Bearer를 받아들이지 않는다.

| Authorization 상태 | 처리 |
| --- | --- |
| 헤더 없음 (`NO_BEARER`) | override 없이 기존 쿠키 처리 경로 실행 |
| 검증 성공 (`VALID`) | 모바일 주체가 우선하며 쿠키를 읽지 않고 ALS 범위에서 처리 |
| 빈 헤더·형식 오류·미지원 스킴·알 수 없음·만료·회수 (`INVALID_BEARER`) | 401 `UNAUTHENTICATED`; 유효한 쿠키가 있어도 대체하지 않음 |
| 모바일 세션 저장소 장애 | 503 `UNAVAILABLE`; 쿠키로 대체하지 않음 |

주체는 `userId`, 현재 `role`, `sessionVersion`, `sessionId`, `transport: "mobile"`만 포함한다. 인가에는 캐시된 신원 대신 `revalidateMobilePrincipalOverride()`를 호출한다. 결과는 `NO_OVERRIDE`(쿠키 경로), `VALID`(DB의 현재 역할 신원), `REVOKED`(401, 쿠키 대체 금지)다. `freshMobilePrincipalIdentity()`는 각각 undefined/신원/null로 투영하며 호출마다 재조회한다. 기존 동기 accessor는 전송 컨텍스트 호환용일 뿐 인가 근거가 아니다. 전체 Auth.js Session을 합성하지 않는다. MEMBER·지정 승인자·gate·소유권 검사는 그대로 유지한다.

학생·과제 대상·제출 파일·me·가이드북 및 Origin 생략 체크포인트마다 회수·세션과 계정 버전·갱신/절대 수명을 DB 시계로 확인한다. 접근 토큰 15분 수명은 최초 인증에서만 요구한다. Blob 검증 동안 회수되거나 비밀번호 버전이 바뀌면 최종 제출 전 두 번째 검사에서 401로 중단한다. 재검증 결과는 요청 단위로도 memoize하지 않는다.

## 왜 AsyncLocalStorage인가

기존 서비스의 깊은 호출에 actor 인자가 없으므로 요청 범위 `AsyncLocalStorage.run(Object.freeze({ ...principal }), handler)`로만 연결한다. `enterWith()`와 모듈 전역 가변 주체는 사용하지 않는다. override는 cookie `auth()`보다 먼저 확인한다. 쿠키 요청에는 컨텍스트를 설치하지 않는다. 64개 요청을 같은 barrier에서 교차 실행하는 회귀가 신원 격리·불변성·호출 범위 밖 override 부재를 검사한다.

ALS는 인가 증명서가 아니다. 분리 작업·타이머·응답 후 스트림에 상속될 수 있으므로 그 컨텍스트로 새 인가를 수행하면 안 된다. 모든 객체 인가는 응답 스트림을 만들기 전에 완료한다. 스트림은 공급자 오류 원문을 숨기고 취소를 전파하며 인가를 다시 실행하지 않는다.

## Origin 정책

| 요청 | 쿠키 | 검증된 모바일 Bearer |
| --- | --- | --- |
| 보호 조회 | 기존 인증·인가 | 같은 인가, Origin 불필요 |
| 제출·의도 생성·검증·취소 | 실제 Host 기준 동일 Origin 필수, 거부 403 `FORBIDDEN` | Origin 검사만 생략; 입력·역할·gate·소유권·예산 검사는 동일 |
| Blob `blob.generate-client-token` | 기존 `assertUploadOrigin()` 유지, 거부 404 `NOT_FOUND` | 인증 성공 범위에서 두 번째 Origin 검사만 생략 |
| Blob `blob.upload-completed` | 쿠키 사용 안 함 | Bearer 사용 안 함; SDK 서명만 권한 근거 |

헤더의 존재만으로 Origin을 생략하지 않는다. 유효한 Bearer와 쿠키가 섞이면 Bearer가 우선하고, 무효 Bearer와 유효 쿠키는 401이다. native 요청을 위해 CORS를 넓히지 않는다.

Blob protocol은 크기 제한 JSON을 **한 번만** 읽고 원본 객체를 SDK에 전달한다. 스키마로 재구성하면 서명에 사용한 키 순서·추가 속성이 바뀔 수 있다. 어댑터가 `tokenTransport.run`과 `tokenTransport.assertOrigin`을 제공하며 callback에는 이를 적용하지 않는다. callback의 type 주장은 권한이 아니며 SDK 서명 통과 후에만 기존 원장 수신을 기록한다. VERIFIED/최종 제출로 직접 전환하지 않는다. legacy 호출의 기본 정책은 변경하지 않는다.

## 캐시와 파일

모든 보호 성공·오류는 `private, no-store`와 `Vary: Cookie, Authorization`을 사용한다. 공통 어댑터는 기존 framework Vary 토큰을 지우지 않고 중복 없이 병합한다. 정적 Vary를 고정해 프레임워크 토큰을 덮어쓰지는 않는다.

가이드북 파일 다운로드 경로는 이 서버 인증 묶음에 포함하지 않는다(#272 후속).

## 허용 import 경로

- `src/app/api/v1/**` (인증 전송 설치)
- `src/lib/academic-permissions.ts` (학생 최소 신원 소비)
- `src/features/academics/**` (현재 사용: `api-v1/http.ts`, `submission-files/access.ts`)
- `src/features/guidebooks/**`, `src/features/users/me/**` (향후 명시 actor 이행용 허용 경계, 현재 직접 import 없음)

`tests/unit/api-v1-principal-architecture.test.ts`가 `src/**`의 정적 import·동적 import·require·재수출을 TypeScript AST로 검사한다. alias·상대 경로 모두 허용 경계 밖 브리지 참조를 거부하며 actions 파일은 별도로 금지한다.

## #271 후속 이행

module 단위 전환 시 Route가 명시적 Principal을 만들고 Application Service가 actor를 입력으로 받도록 바꾼다. Repository에는 인가된 actor/조회 범위만 전달한다. 페이지·Server Action도 자체 쿠키→actor 변환을 수행하되 Bearer 파싱은 하지 않는다. 한 module의 모든 호출자가 명시 actor로 전환된 후 해당 ALS 소비를 제거한다. 마지막 소비 제거 후 브리지·허용 예외를 삭제한다. 이행 편의를 위해 현재 DB 제약·감사·rate limit·권한 검사를 완화하지 않는다.
