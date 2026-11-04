# API v1 현재 제공 범위

공용 HTTP 계약의 정본은 [`packages/contracts/openapi.json`](https://github.com/yeongseon/hra-website/blob/main/packages/contracts/openapi.json)입니다. 이 파일은 OpenAPI 3.1.1 JSON 형식이며 기존 공지·본인 프로필·공개 일정·가이드북 목록, 강의자료·주차별 텍스트 목록/상세와 자료 파일, 학사 MVP와 모바일 인증 계약을 기록합니다. 모바일 인증과 기존 경로의 Bearer 수용은 서버 작업 반영 후 사용할 수 있으며 계약 추가만으로 배포 완료를 뜻하지 않습니다. 수업일지·보고서 양식 등 나머지 자료 유형과 모바일 소셜 로그인은 후속 범위입니다.

## 모바일 인증

서버 작업 반영 후 `/api/v1/me`, `/api/v1/resources/guidebooks`, 아래 「승인 회원 강의자료·주차별 텍스트·자료 파일」의 7경로, `/api/v1/assignments` 및 그 상세·제출 조회, `/api/v1/submissions`, `/api/v1/uploads` 및 발급·검증·취소, `/api/v1/submissions/{id}/files/{fileId}`는 **Web 쿠키 또는 모바일 Bearer**를 받습니다. 공개 공지·일정은 계속 익명 조회입니다. Bearer는 `/api/v1` 어댑터에서만 처리하며 Server Action·페이지·관리자·legacy `/api/*`에는 적용하지 않습니다. 보호 경로에 `Authorization` 헤더가 있으면 쿠키보다 우선합니다. 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식도 401이며 유효한 쿠키가 함께 있어도 대체하지 않습니다. 쿠키 변경 요청의 동일 출처 Origin 방어는 유지하고 **검증된 모바일 Bearer** 요청만 해당 검사를 생략합니다. SDK 업로드 완료 callback의 권한은 Bearer나 쿠키가 아니라 기존 SDK 서명 검증에만 있습니다.

| 요청 | 입력·결과 | 전체 HTTP 상태 |
| --- | --- | --- |
| `POST /api/v1/auth/login` | `{ email, password, device? }` → 200 `{ session, user }`. 사용자 DTO는 `/me`와 동일 | 200/400/401/413/429/503 |
| `POST /api/v1/auth/refresh` | `{ refreshToken }` → 200 `{ session }`. 두 토큰 모두 회전 | 200/400/401/413/429/503 |
| `POST /api/v1/auth/logout` | `{ refreshToken }` → 본문 없는 204. 알 수 없거나 이미 폐기된 토큰도 204. 갱신과 같은 IP 예산 소진 시 429 | 204/400/413/429/503 |
| `POST /api/v1/auth/logout-all` | Bearer 필수, 본문 없음 → 204. 본인의 모든 **모바일** 세션만 폐기하며 Web 쿠키 세션은 변경하지 않음 | 204/400/401/503 |

로그인은 이메일·비밀번호만 사용합니다. 이메일은 trim 후 3~320자 이메일 형식, 비밀번호는 trim하지 않고 1~256자입니다. 선택적 `device`는 필수 `platform: "ANDROID" | "IOS"`, 선택적 `appVersion`(1~32자)·`deviceName`(1~64자)만 받습니다. 모든 입력·기기·응답 객체는 추가 키를 거부합니다. ADMIN·PENDING도 로그인할 수 있지만 기존 API의 역할별 인가는 유지합니다. PENDING은 자기 프로필만 조회하고 자료·학사 권한을 얻지 않으며 ADMIN 로그인도 학생 과제 권한을 추가하지 않습니다. 잘못된 자격 증명은 계정 존재 여부를 구별하지 않는 일반 401 `UNAUTHENTICATED`입니다.

네 인증 경로 모두 query를 거부합니다. 로그인·갱신·단일 로그아웃은 `application/json`이 필수이며 실제 본문 16KiB 초과는 413 `AcademicTooLargeError`입니다. 쿠키를 읽거나 설정하지 않고 Origin 없이 사용할 수 있습니다. 전체 로그아웃은 쿠키 단독 인증을 받지 않으며 **어떤 본문이나 query도 400**입니다(빈 JSON 객체 `{}`도 금지). 잘못된 JSON·입력은 400 `InvalidInputError`, 인증 실패는 401 `UnauthenticatedError`, 저장소 제공 불가는 503 `UnavailableError`입니다. 로그인 제한은 계정 조회·bcrypt 전에 429로 거부하고 갱신은 IP·세션 예산을 적용하며 성공한 갱신도 계산합니다. 제한 저장소 장애는 429가 아니라 503입니다. 로그인·갱신 429는 `MobileRateLimitedError`와 `Retry-After`에 같은 `retryAfterSeconds`(1~900초)를 제공합니다. 기존 `AcademicRateLimitedError`의 60초 상한과 구분합니다. 인증 응답과 오류 및 본문 없는 204는 모두 `Cache-Control: private, no-store`입니다. 보호 경로의 성공·오류에는 `Vary: Cookie, Authorization`을 기존 Vary 값과 병합합니다.

`MobileSession`은 `tokenType: "Bearer"`, 불투명한 `accessToken`·`refreshToken`과 각각의 `accessTokenExpiresAt`·`refreshTokenExpiresAt`을 제공합니다. 만료 시각은 UTC 밀리초 ISO 문자열입니다. **클라이언트는 수명을 하드코딩하지 않고 이 필드들을 사용합니다.** 설계상 access 15분·refresh 30일 sliding·로그인 후 절대 90일은 비계약 운영 지침이며 변경될 수 있습니다. 토큰 접두어·길이·내부 형식을 클라이언트에서 해석하지 않습니다.

갱신 성공 시 access와 refresh를 함께 교체합니다. 갱신의 일반 401 `UNAUTHENTICATED`는 잘못된 토큰·만료·철회·세션 버전 불일치·재사용뿐 아니라 **정상 동시 회전 경합**도 포함합니다. 바로 직전 소비 토큰은 회전 후 **10초 유예 안에서 401만 반환하고 세션을 폐기하지 않습니다.** 직전 소비 토큰을 그 유예 밖에서 제시하거나 더 오래전에 소비된 어느 세대의 토큰을 제시해도 계열 재사용 감지로 **해당 모바일 세션 전체**를 폐기합니다. 이전 토큰 재전송은 복구 수단이 아닙니다. 더 오래된 세대에는 직전 회전의 유예를 적용하지 않습니다.

### 모바일 클라이언트 필수 계약

- **하나의 갱신 조정자(single flight)** 를 앱 시작·HTTP 인터셉터·전경 복귀·백그라운드 작업이 모두 공유합니다. 각 호출이 별도로 refresh를 보내지 않습니다.
- 로그인·갱신·로그아웃의 로컬 세션 전환마다 **세션 세대(session generation)** 를 갱신하고 작업 시작 당시의 세대를 붙입니다. 오래된 요청의 성공·실패가 더 최신 로그인·갱신 토큰을 덮어쓰거나 지우지 못하게 합니다. 갱신 401 뒤 토큰·개인 캐시 제거와 재로그인은 그 요청의 세대가 여전히 현재일 때만 수행합니다. 늦게 도착한 경합 실패가 승자의 새 토큰을 삭제해서는 안 됩니다.
- access token은 **메모리에만**, refresh token은 **Android Keystore 기반 보안 저장소에만** 보관합니다. 일반 파일·AsyncStorage·로그·분석 이벤트·URL에는 넣지 않습니다. 앱 재시작은 저장된 refresh와 같은 조정자를 사용합니다.
- 회전된 refresh의 보안 저장이 끝난 뒤 두 토큰을 함께 현재 세션으로 공개합니다. 저장 실패 시 새 세션을 계속 사용하지 않으며 오래된 세션에 대한 정리가 새 세대에 영향을 주지 않게 합니다. 로그아웃도 서버 폐기 결과와 별개로 해당 로컬 세대의 토큰·개인 캐시를 제거합니다.
- **전송 결과가 불명확한 갱신은 자동 재시도하지 않습니다.** 타임아웃·연결 단절로 응답을 못 받아도 서버는 이미 회전했을 수 있습니다. 503·통신 실패를 401로 간주하지 않으며 이전 refresh를 자동 재전송하지 않습니다. 상태를 확정할 수 없으면 명시적인 재로그인으로 복구합니다.
- **변경 요청은 자동 재전송하지 않습니다.** 보호 GET 등 안전한 조회만 유효한 현재 세대에서 갱신 후 최대 한 번 재시도할 수 있습니다. POST·DELETE·업로드·제출은 인증 갱신을 이유로 자동 재실행하지 않고 기존 멱등키·명시적 복구 절차를 따릅니다. 403은 권한 거부이므로 갱신 루프를 돌리지 않습니다.
- 429는 본문 `retryAfterSeconds`와 동일한 `Retry-After`만큼 대기하며 즉시 반복하지 않습니다. 갱신 재시도는 명시적으로 거부된 429와 전송 결과 불명확 실패를 구별하고 같은 조정자와 세대 검사를 사용합니다.

모바일 Google·Kakao OAuth는 이번 계약 범위가 아닙니다.

**OpenAPI 인증 표기 정정 정책(#439):** 추가 전용 gate(`scripts/check-openapi-compat.mjs`)는 기존 path item을 그대로 보존하는 것이 원칙입니다. Bearer 이중 전송(#438)으로 어긋난 표기만 바로잡기 위해 `scripts/_lib/openapi-append-only.mjs`의 `authWordingRevisions`에 **고정된 11개 operation**(`GET /me`, `GET /resources/guidebooks`, 본인 과제 3개 조회, `POST /submissions`, 업로드 4개 경로, 제출 파일 `GET`)만 예외로 등록했습니다. 이 operation에서는 `description`, `security`, `Origin` 헤더 매개변수의 `required`·`description`, 응답 `Vary` 헤더만 바뀔 수 있고 나머지(경로·상태 코드·스키마·operationId)가 달라지면 기존처럼 `OPENAPI_PATH_CHANGED`로 실패합니다. 정정 후 값은 `security: [{ bearerAuth: [] }]`(쿠키 대안은 설명에 기록), `Vary: Cookie, Authorization`, 선택(`required: false`) `Origin`이어야 합니다. 목록은 확장하지 않으며 새 operation은 처음부터 정확한 표기로 추가합니다. `info.version`은 계약 구조가 바뀌지 않으므로 올리지 않습니다. 쿠키 이름은 환경마다 달라 고정하지 않습니다. 향후 Bearer 보호 operation을 새로 추가할 때 OpenAPI의 `{}` 대안은 익명 허용이므로 쿠키 인증 표현에 사용하지 않습니다.

## 본인 프로필

`GET /api/v1/me`는 서버 작업 반영 후 Auth.js **Web 세션 쿠키 또는 모바일 Bearer**를 사용합니다. 인증 상태가 없으면 401 `UNAUTHENTICATED`로 끝나고 매 요청 현재 인증 상태를 확인합니다. 쿠키 이름은 배포 환경과 보안 접두어·분할에 따라 달라지므로 계약에 하나로 고정하지 않습니다.

세션 확인 뒤 현재 사용자의 표시용 행을 다시 조회합니다. 응답은 `{ user: { id, name, email, role, cohortId, imageUrl } }` 여섯 필드만 허용하며 비밀번호 해시·OAuth binding·세션 버전은 반환하지 않습니다. 내부 placeholder 이메일은 `null`입니다. `PENDING`도 **자기 프로필만** 읽을 수 있고 자료실·학사 인가는 이 API로 부여하지 않습니다. 사용자 행이 없어졌거나 세션의 역할과 다르면 401로 거부합니다.

이 경로는 query를 받지 않아 전달되면 400 `INVALID_INPUT`입니다. Auth.js가 오류를 명시적으로 전파하거나 세션 인증 이후 별도 프로필 조회가 실패하면 503 `UNAVAILABLE`을 반환합니다. Auth.js JWT 콜백의 DB 오류는 라이브러리가 세션을 지워 무세션 401로 끝날 수도 있으므로 모든 DB 오류를 503으로 분류한다고 주장하지 않습니다. 모든 응답은 `Cache-Control: private, no-store`이며 오류에도 개인 정보·SQL 원문을 포함하지 않습니다.

## 공개 일정

`GET /api/v1/schedule`은 `year`(1900~2100)와 `month`(1~12)를 모두 요구합니다. 중복·미등록 query와 범위 밖 값은 400 `INVALID_INPUT`, 일정 저장소 장애는 503 `UNAVAILABLE`로 처리합니다. Web 캘린더의 잘못된 연·월을 현재 달로 보정하는 규칙과 달리 API 입력은 엄격히 거부합니다. 공개 표시된 일정만 한 달 범위로 조회하며 응답은 `{ year, month, timeZone: "Asia/Seoul", events }`입니다.

각 이벤트의 `calendarDate`는 `YYYY-MM-DD`, `startTime`과 선택적 `endTime`은 한국 벽시계 `HH:MM`입니다. `endTime`만으로 종료 날짜·자정 넘김·지속 시간을 추정하지 않습니다. `event_date`는 PostgreSQL의 **시간대 없는 timestamp**에 한국 달력의 벽시계 필드를 저장하므로 실제 UTC 순간으로 해석하거나 9시간을 더하지 않습니다. 예를 들어 한국 시각 10월 31일 23:30 수업은 API에서 그대로 `calendarDate: "2026-10-31"`, `startTime: "23:30"`입니다. Web 달력의 기존 ISO 직렬화는 Web 표시 규칙으로 유지하며 API에는 `eventDate` ISO를 내보내지 않습니다. [PostgreSQL 시간 타입 설명](https://www.postgresql.org/docs/current/datatype-datetime.html)에 따르면 시간대 없는 timestamp는 입력의 시간대 표시를 조정 값으로 보관하지 않습니다.

이벤트·세션에는 제목/내용·순서와 공개 기수/교수의 ID·이름만 들어갑니다. 기수 시트 주소·폼 URL과 교수 내부 열은 조회·응답에서 제외합니다. 이 공개 GET은 캐시하지 않으며 관리자 일정 쓰기나 개인 출결 인가와 관계없습니다.

## 공개 공지 목록

| Query | 기본값 | 범위·처리 |
| --- | --- | --- |
| `page` | `1` | 1부터 시작하는 정수 |
| `pageSize` | `10` | 1~50 정수 |
| `q` | 없음 | 앞뒤 공백 제거 후 제목 검색, 최대 100자, 대소문자 무시 |

알 수 없는 query key와 중복 key, 안전한 정수 범위를 넘는 페이지 offset은 400 `INVALID_INPUT`으로 거부합니다. API의 범위 밖 `page`는 **요청한 페이지 번호**와 빈 `notices` 목록을 반환합니다. Web `/notices` 화면은 마지막 페이지로 보정하므로 두 입력 정책을 혼동하지 않습니다.

성공 응답은 `{ notices, page }`입니다. 공지 항목에는 `id`, `title`, Markdown을 평문으로 줄인 `excerpt`, `pinned`, `viewCount`, `createdAt`, `updatedAt`만 들어갑니다. 본문 원문·작성자 ID·초안 상태는 반환하지 않습니다. 시각은 UTC 밀리초 ISO 문자열이고 한국 시간대 표시는 클라이언트가 결정합니다.

입력 오류는 400 `INVALID_INPUT`, DB 등 제공 불가 오류는 503 `UNAVAILABLE`입니다. 오류 본문은 `{ error: { code, message, requestId } }`만 담고 SQL·검색어·내부 오류 원문은 보내지 않습니다. 이 공개 GET은 응답 캐시를 사용하지 않으며 현재 Web 화면과 같은 공지 서비스·게시 정책을 호출합니다. Web 서버가 자기 API로 HTTP 요청을 보내지는 않습니다.

OpenAPI의 JSON 표현은 [OpenAPI 3.1.1 명세](https://spec.openapis.org/oas/v3.1.1.html)의 문서 형식에 따릅니다.

## 공개 공지 상세

`GET /api/v1/notices/{id}`는 UUID 경로 ID가 가리키는 **게시된 공지**만 반환합니다. 성공 응답은 `{ notice: { id, title, content, viewCount, createdAt } }`로 고정합니다. `content`는 공개 Markdown 원문이고 `createdAt`은 UTC 밀리초 ISO 문자열입니다. 내부 작성자 ID, 게시 상태, 이전·다음글, 그 밖의 DB 열은 API 응답에 포함하지 않습니다. Web 상세 화면은 같은 서비스에서 이전·다음글을 받아 표시합니다.

형식이 틀린 ID나 미지원 query는 400 `INVALID_INPUT`, 없는 공지·초안은 404 `NOT_FOUND`, 조회 저장소 장애는 503 `UNAVAILABLE`입니다. 모든 응답은 `Cache-Control: no-store`이며 오류 원문·SQL을 노출하지 않습니다. 성공 응답을 보낸 뒤 `after()` 수명주기에서 조회수를 원자적으로 1 증가시키므로 응답의 `viewCount`는 갱신 전 값일 수 있습니다. 요청당 갱신이며 방문자 중복 제거나 정확히 한 번 집계는 보장하지 않습니다.

## 승인 회원 가이드북 목록

`GET /api/v1/resources/guidebooks`는 서버 작업 반영 후 Auth.js Web 쿠키 또는 모바일 Bearer로 승인된 `ADMIN`, `FACULTY`, `MEMBER`에게 가이드북 **메타데이터만** 제공합니다. Route 안에서 세션을 확인하고 Application Service가 현재 계정 행과 역할을 다시 대조합니다. 익명·삭제 또는 역할이 바뀐 계정은 401 `UNAUTHENTICATED`, 현재 승인 대기 계정은 403 `FORBIDDEN`입니다. Auth.js가 DB 오류를 무세션으로 바꾸는 경우는 `/api/v1/me`와 동일하게 401이 될 수 있습니다.

`page`(기본 1)와 `pageSize`(기본 10, 최대 50)만 받으며 중복·미등록 key와 PostgreSQL offset 범위 밖 값은 400 `INVALID_INPUT`으로 거부합니다. 범위 밖 페이지는 요청 번호를 유지한 빈 `guidebooks` 배열과 공통 `page` 메타를 반환합니다. 목록은 작성 시각·ID 역순으로 안정 정렬합니다. 각 항목은 `id`·`title` 두 필드뿐이고 원본 파일 URL·파일명·Blob 토큰·시간대 없는 `createdAt`은 보내지 않습니다. 실제 파일은 기존 인증 다운로드 경로와 아래 `GET /api/v1/resources/guidebooks/{id}/file`에서만 서버가 읽습니다. 모든 응답은 `Cache-Control: private, no-store`와 `Vary: Cookie`이며 저장소 장애는 원문 없는 503 `UNAVAILABLE`입니다.

`/resources` 화면은 별도 통합 목록 Application Service를 사용하며 기수·다른 자료 유형과 기존 전체 정렬을 유지합니다. 가이드북 API는 페이지 조회에 필요한 최소 메타데이터만 제공하므로 화면의 통합 목록을 HTTP로 재호출하지 않습니다.

## 승인 회원 강의자료·주차별 텍스트·자료 파일

| 메서드·경로 | 제공하는 결과 |
| --- | --- |
| `GET /api/v1/resources/guidebooks/{id}/file` | 가이드북 원본 첨부 스트림 |
| `GET /api/v1/resources/class-materials` | 역할에 허용된 강의자료 메타데이터 페이지 |
| `GET /api/v1/resources/class-materials/{id}` | 강의자료 메타데이터와 원본 파일명 |
| `GET /api/v1/resources/class-materials/{id}/file` | 강의자료 원본 첨부 스트림 |
| `GET /api/v1/resources/weekly-texts` | 주차별 텍스트 메타데이터 페이지 |
| `GET /api/v1/resources/weekly-texts/{id}` | 주차별 텍스트 Markdown 본문과 첨부 파일명 |
| `GET /api/v1/resources/weekly-texts/{id}/file` | 주차별 텍스트 첨부 원본 스트림 |

인증은 위 「모바일 인증」의 보호 경로와 같습니다. **모바일 Bearer 또는 Web 쿠키**를 받으며 `Authorization` 헤더가 있으면 쿠키보다 우선하고, 잘못된 토큰·형식·지원하지 않는 방식·회수된 모바일 세션은 유효한 쿠키가 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하고 세션 저장소 장애는 503입니다. Route 전용 `src/app/api/v1/resources/_lib/principal.ts`가 `withApiV1Principal`로 주체를 해석하고, Application Service(`src/features/{class-materials,weekly-texts}/member`, `src/features/guidebooks/file-download`)가 현재 계정 행과 역할을 다시 대조합니다. 익명·삭제·역할 변경은 401 `UNAUTHENTICATED`, 승인 대기 `PENDING`은 현재 계정 조회 전에 403 `FORBIDDEN`입니다. OpenAPI에는 `security: [{ bearerAuth: [] }]`를 선언하고 쿠키 대안은 설명에 기록합니다(`{}`는 익명 허용이라 사용하지 않습니다). Route는 Drizzle을 직접 호출하지 않습니다.

권한 범위는 기존 Web 자료실과 같습니다.

- **강의자료**: `MEMBER`는 학생용(`STUDENT`)만, `ADMIN`·`FACULTY`는 학생용·교수용(`FACULTY`)을 받습니다. 기존 `classMaterialReadFilter`를 목록·상세·파일 SQL WHERE에 적용하므로 MEMBER가 교수용 자료를 요청하면 없는 자료와 같은 404 `NOT_FOUND`입니다.
- **주차별 텍스트**: 공동 자료 정책(#100)에 따라 승인 회원은 **기수와 무관하게** 열람합니다(허용 범위 정책 확인은 #441). Web 통합 목록·상세·기존 다운로드 경로와 같은 범위이며, 본인 기수만 보여 주는 `/resources/weekly-texts` 업로드 화면의 목록 필터는 표시용으로 API에 적용하지 않습니다.
- **가이드북 파일**: 승인 회원은 모든 가이드북 원본을 받습니다.

목록은 `page`(기본 1)·`pageSize`(기본 10, 최대 50)만 받고 가이드북 목록과 같은 400·범위 밖 빈 배열 규칙을 따릅니다. 정렬은 Web 통합 목록과 같은 수업일 역순(없으면 마지막)·작성 시각 역순이며 ID 역순으로 안정화합니다. 수업일 `classDate`는 Web 화면과 같은 KST 변환의 `YYYY-MM-DD` 달력 날짜이고, 시간대 없는 `createdAt`은 보내지 않습니다.

- 강의자료 항목은 `id`·`title`·`audience`·`weekNumber`·`lectureTitle`·`classDate`이고 상세에만 `fileName`을 추가합니다. 업로더 계정·이름과 원본 URL은 반환하지 않습니다.
- 주차별 텍스트 항목은 `id`·`title`·`textType`·`cohort{id,name}`·`classDate`·`hasBody`·`hasFile`이고 상세에만 Markdown `body`와 `fileName`을 추가합니다. 빈 본문·파일명·분류는 `null`이며 첨부 사진은 이 API 범위에 포함하지 않습니다.

상세·파일 경로는 query를 받지 않으며 잘못된 UUID와 함께 400 `INVALID_INPUT`입니다. 파일 경로는 기존 Web 다운로드(`/api/resources/[kind]/[id]/download`)와 같은 `resourceBlobAccess`·`resourceBlobToken` 규칙으로 프로젝트 공개 저장소 또는 지정 비공개 저장소의 원본만 **서버가 읽어 첨부 스트림으로** 전달합니다. 원본 URL로 리다이렉트하거나 서명 URL을 발급하지 않고 `inline` 미리보기도 제공하지 않습니다. 성공 응답은 저장된 MIME(알 수 없으면 `application/octet-stream`)·안전한 `attachment` 파일명·`nosniff`·`sandbox; default-src 'none'` CSP를 사용하며, 같은 CSP를 `next.config.ts`의 정적 헤더로도 고정합니다. 없는 자료·첨부 없는 텍스트·허용되지 않은 저장 위치·공급자 304는 404, 비공개 토큰 누락·공급자 장애·응답 헤더 대기 60초 상한 초과는 원문 없는 503 `UNAVAILABLE`입니다. 요청 취소는 공급자 SDK 요청과 본문 스트림까지 전파하고, 응답 시작 뒤의 전송 오류는 고정 문구로 스트림을 중단합니다. 기존 Web 다운로드 경로와 마찬가지로 별도 요청 한도는 두지 않습니다.

모든 응답은 `Cache-Control: private, no-store`, `Vary: Cookie, Authorization`, `X-Request-Id`를 포함합니다.

## 본인 과제·제출·파일 MVP

OpenAPI의 `Origin` 헤더는 쿠키 요청에서만 필수이며(`required: false`로 표기) 검증된 Bearer 요청은 Origin 검사를 생략합니다. 인증별 응답 구분은 `Vary: Cookie, Authorization`입니다. JSON 크기·서명 callback·소유권·파일 감사 등 나머지 보호는 전송 방식과 무관하게 유지합니다.

모든 학사 경로는 서버 작업 반영 후 Auth.js **Web 세션 쿠키 또는 모바일 Bearer**를 사용합니다. 이 계약 추가가 모바일 인증 배포나 학사 운영 활성화를 뜻하지 않습니다. 기존 `ACADEMIC_ENABLED`·쓰기/업로드 gate와 현재 학적·과제 대상·개인 파일 인가를 그대로 적용합니다. 일반 `ADMIN`·`FACULTY` 역할에 학생 과제 권한을 추가하지 않습니다.

| 메서드·경로 | 제공하는 결과 |
| --- | --- |
| `GET /api/v1/assignments` | 본인 공개 과제 목록과 다음 페이지 여부 |
| `GET /api/v1/assignments/{id}` | 본인 과제 지침·최종 제출·PDF 메타 |
| `GET /api/v1/assignments/{id}/submission` | 해당 과제의 본인 최종 제출·PDF 메타만 조회 |
| `POST /api/v1/submissions` | 비공개 PDF 검증 후 제출 확정 또는 같은 키의 성공 복구 |
| `POST /api/v1/uploads/intents` | PDF 업로드 발급 ID·불투명 경로·만료 시각 |
| `DELETE /api/v1/uploads/intents/{id}` | 본인 업로드 원장 취소 |
| `POST /api/v1/uploads/{id}/verify` | 실제 비공개 원본 PDF 검증 |
| `POST /api/v1/uploads` | Vercel SDK 토큰·서명된 완료 영수증 교환 |
| `GET /api/v1/submissions/{id}/files/{fileId}` | 현재 인가·감사를 통과한 개인 파일 첨부 스트림 |

과제 목록은 `page`(기본 1, 최대 10,000)·`pageSize`(기본 20, 최대 50)만 받습니다. 중복·미등록 query는 400이고 범위를 넘으면 요청 번호와 빈 배열을 반환합니다. 응답은 `{ assignments, page: { page, pageSize, hasNextPage } }`입니다. 기존 학생 서비스는 다음 페이지 존재만 조회하므로 공지의 `PageMeta`와 달리 추정 `totalCount`·`totalPages`를 추가하지 않습니다. 상세·파일 및 모든 변경 경로는 query를 받지 않습니다. 시각은 UTC 밀리초 ISO 문자열이며 KST 표시 변환은 클라이언트 책임입니다.

과제 DTO에는 과제/대상 식별자·제목·게시 상태·마감/게시 시각과 본인 최종 제출 식별자/시각만 포함합니다. 상세에만 지침과 PDF 파일 식별자·원본명·MIME·크기를 추가합니다. 다른 학생·계정·학적 식별자·Blob URL·저장 토큰은 반환하지 않습니다. 제출 전에는 `submission`과 `file`이 `null`이며 업로드 원장의 중간 상태는 최종 제출로 표시하지 않습니다.

제출 POST 입력은 `{ assignmentId, uploadIntentId, submissionKey }` 세 UUID만 허용합니다. 최초 제출과 같은 `submissionKey`의 성공 복구는 모두 HTTP 200이며 `{ submission: { assignmentId, submissionId, submittedAt, replayed, file } }`에서 `replayed`로 구분합니다. 원자 SQL·쓰기 gate·실제 파일 검증·검증 후 재인가는 기존 서비스가 담당하며 Web Server Action과 API가 같은 서비스를 호출합니다.

업로드 발급 입력은 `{ assignmentId, requestId, originalName, sizeBytes, mimeType }`입니다. 앞뒤 공백을 제거한 PDF 파일명(최대 255자), 빈 파일 제외, 50MiB 이하, `application/pdf`만 허용합니다. 발급 결과의 `pathname`은 `academic-uploads/v1/{uploadIntentId}/document.pdf`와 일치하는 불투명 SDK 전송 값이며 공개 다운로드 URL이나 권한 증명이 아닙니다. 검증·취소 JSON은 `{ assignmentId }`만 받고 업로드 ID는 경로에서 결합합니다. `VERIFIED`는 파일 검증 완료이며 제출 확정은 별도 POST입니다. `CANCELLED`는 발급 원장 종료이며 유효한 토큰이 남은 객체를 즉시 삭제하지 않습니다.

변경 요청은 동일 출처 `Origin`·`application/json`과 실제 16KiB 본문 상한을 요구합니다. `POST /uploads`는 **SDK 서명이 확인된 `blob.upload-completed` callback에만** Origin·사용자 세션 예외가 있습니다. 클라이언트 토큰 생성은 기존 Origin·현재 MEMBER 대상·발급 소유권·정확한 pathname·단일 PUT·요청 예산을 모두 확인합니다. 토큰 프로토콜의 Origin 거부는 기존 서비스의 불투명 404 `NOT_FOUND`를 유지하며, 나머지 변경 경로의 Origin 거부는 403 `FORBIDDEN`입니다. 서명용 JSON은 추가 속성과 원본 키 순서를 보존해 SDK에 전달합니다. 성공은 SDK의 `{ type: "blob.generate-client-token", clientToken }` 또는 `{ type: "blob.upload-completed", response: "ok" }` 그대로입니다. callback은 원장 수신을 멱등 기록할 뿐 검증·최종 제출 상태로 승격하지 않습니다.

오류는 기존 학사 Web 422/404 표현 대신 공통 v1 `{ error: { code, message, requestId, retryAfterSeconds? } }`를 사용합니다. 입력 400 `INVALID_INPUT`, 인증 401 `UNAUTHENTICATED`, 역할·Origin 403 `FORBIDDEN`, 없는/다른 대상·잘못된 경로 UUID 404 `NOT_FOUND`, 마감·만료·검증 대기·동시 변경 409 `CONFLICT`, JSON 크기 413 `TOO_LARGE`, 요청 예산 429 `RATE_LIMITED`, 기능 비활성 503 `DISABLED`, 업로드 저장소 실패 503 `STORAGE_UNAVAILABLE`, 기타 제공 불가 503 `UNAVAILABLE`로 매핑합니다. 요청 한도 응답은 `Retry-After`와 같은 `retryAfterSeconds`를 제공합니다. 오류 원문·SQL·파일 URL·토큰은 반환하지 않습니다.

모든 학사 응답은 `Cache-Control: private, no-store`, `Vary: Cookie`, 요청 참조 헤더를 사용합니다. 개인 파일은 현재 소유권 또는 지정 학사 책임자 권한과 감사가 확정된 뒤에만 읽으며, 파일 성공 응답에는 `application/octet-stream`·안전한 `attachment` 파일명·`nosniff`·sandbox CSP·검증된 크기를 유지합니다. 응답 시작 이후의 스트림 오류는 JSON으로 바꿀 수 없으므로 전송을 중단하고 내부 정보 없는 감사 이벤트를 기록합니다. 실제 운영 OAuth·Private Blob 이행·모바일 인증 완료를 이 합성/격리 검증으로 대신하지 않습니다.

`npm run test:academic-g1`은 기존 Web 여정과 함께 위 9경로를 실제 production 앱·정상 로그인·격리 PostgreSQL·로컬 private 저장소로 검증합니다. 업로드 취소/재발급·SDK 전송·검증·최종 제출·같은 키 복구·파일 해시/보안 헤더, 역할·기수·학적/세션 철회 및 테이블 설치 전 기능 비활성을 확인합니다.

## 계약 변경 검사

`node scripts/check-openapi-compat.mjs --self`는 현재 OpenAPI의 로컬 참조와 실제 `/api/v1` Route 경로를 읽기 전용으로 대조합니다. PR에서는 base commit, `main` push에서는 직전 commit의 OpenAPI와 비교해 **기존 path와 component를 정확히 보존하고 새 항목만 추가**하도록 필수 CI에서 검사합니다. 동적 `[id]` Route는 OpenAPI `{id}` 경로에 대응하며 catch-all·Route Group 아래의 `/api/v1` 등 아직 지원하지 않는 배치는 조용히 무시하지 않고 검사 실패로 남깁니다.

이 정책은 보수적이어서 기존 설명 문구만 고쳐도 차단합니다. 의도된 계약 수정·삭제는 별도 버전/전환 방안을 검토해야 합니다. 이 검사는 실제 HTTP 동작이나 모든 JSON Schema 호환성을 완전하게 판정하지 않으며, PR이 검사 코드 자체를 변경하는 적대적 우회까지 막는 승인 장치가 아닙니다.
