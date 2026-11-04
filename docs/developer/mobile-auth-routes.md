# 모바일 인증 HTTP 경계

모바일 앱은 이메일·비밀번호로만 로그인한다. 소셜 로그인은 이번 범위가 아니다.
모든 응답은 `Cache-Control: private, no-store`를 사용한다. login/refresh/logout은 `Vary: Authorization`,
logout-all은 성공·400·401·503 모두 기존 Vary와 `Cookie, Authorization`을 병합하며
쿠키를 읽거나 설정하지 않는다. Origin은 요구하지 않는다. 로그인은 PENDING·ADMIN도 허용하되
자료·학사 권한을 추가하지 않는다. Bearer는 기존 v1 허용 경로에서만 사용한다.

## 엔드포인트

| 요청 | 입력 | 성공 | 실패 |
| --- | --- | --- | --- |
| POST `/api/v1/auth/login` | 계약의 email, password, 선택 device | 200 `{ session, user }` | 400, 401, 413, 429, 503 |
| POST `/api/v1/auth/refresh` | `{ refreshToken }` | 200 `{ session }` | 400, 401, 413, 429, 503 |
| POST `/api/v1/auth/logout` | `{ refreshToken }` | 204, 미존재·회수 토큰도 동일 | 400, 413, 429(IP 예산), 503 |
| POST `/api/v1/auth/logout-all` | 유효한 모바일 Bearer, 본문·query 없음 | 204, 해당 사용자의 모든 모바일 세션 회수 | 400, 401, 503 |

JSON 명령은 `Content-Type: application/json`과 실제 스트림 기준 최대 16 KiB를 요구한다.
미지원 미디어 타입(일반 HTTP의 415 상황)은 고정 계약에 따라 400 `INVALID_INPUT`으로 처리한다.
query·추가 키·깨진 JSON도 400이다. logout-all은 실제 스트림 EOF까지 0바이트이면 허용하고
첫 non-empty chunk에서 취소·잠금 해제 후 400으로 거부한다. Content-Length나 body의 null 여부로 판단하지 않는다.
로그아웃 전체는 Web 쿠키만으로 실행할 수 없고 Web 세션 버전도 변경하지 않는다.

## 제한 정책과 근거

로그인은 기존 `reserveLoginAttempt`의 세 축을 그대로 공유한다.
`login-pair` 5회, `login-ip` 50회, `login-email` 15회 / 15분이다.
예약이 막히면 사용자 조회·bcrypt 없이 즉시 429를 반환한다. 허용된 요청은 계정·해시가 없어도
cost 12 dummy bcrypt를 실행한다. 성공한 요청은 해당 예약만 해제한다.
로그인의 재시도 시간은 계정별 잔여 시간을 노출하지 않는 고정 900초다.

| 상수 | scope | 제한 |
| --- | --- | --- |
| `MOBILE_REFRESH_IP_POLICY` | `mobile-refresh-ip` | IP당 120회 / 900초 |
| `MOBILE_REFRESH_SESSION_POLICY` | `mobile-refresh-session` | 세션당 12회 / 900초 |

정상 앱의 갱신은 시간당 몇 회이므로 세션당 15분 12회는 재개·일시적 경쟁을 충분히 허용한다.
IP당 120회는 공유 네트워크 사용자를 고려하면서 미존재 토큰의 대량 조회를 제한한다.
IP 예산은 갱신과 단일 로그아웃 모두 토큰 식별 전에 소비하고, 세션 예산은 현재·직전·과거 해시를 세션 ID로 식별한 후 소비한다.
성공한 갱신도 예산에 남으며 회전된 토큰으로 예산이 초기화되지 않는다.
세션 예산은 예외 대신 `mayRotate`와 재시도 시간을 전달한다. 현재 토큰은 THROTTLED→429이며
교체·이력 변경이 없다. 소비 토큰은 제한 상태에서도 재사용 판정과 가족 회수를 수행하며 일반 401이다.
기존 `reserve_rate_limit` 함수를 사용하고 scope와 NUL로 도메인 분리한 SHA-256 키만 저장한다.
Vercel에서는 기존 `extractClientIp`의 플랫폼 전용 헤더 신뢰 경계를 유지한다.

## 오류 매핑

| 상황 | 상태 / 코드 |
| --- | --- |
| 입력·미디어 타입 오류 | 400 / INVALID_INPUT |
| 실제 본문 16 KiB 초과 | 413 / TOO_LARGE |
| 로그인 실패·발급 전 버전 경합·THROTTLED 외 갱신 실패 사유 | 401 / UNAUTHENTICATED |
| 제한 예산 소진 | 429 / RATE_LIMITED, 본문 retryAfterSeconds와 Retry-After 동일 |
| 제한·세션·프로필 저장소 장애 | 503 / UNAVAILABLE |

갱신의 INVALID·EXPIRED·REVOKED·REUSE_DETECTED·WITHIN_LEEWAY·VERSION_MISMATCH는 동일한
401 코드·고정 한국어 문구를 사용한다. requestId만 요청마다 달라진다.
REVOKED·REUSE_DETECTED 모니터링은 고정 scope, DENIED와 비밀이 아닌 세션 UUID(`sessionId`)만 허용 목록 logger에 전달한다.
토큰·해시·기기명·비밀번호·Authorization은 기록하지 않는다.

## 운영과 정리

`GET /api/cron/cleanup-mobile-sessions`는 기존 `CRON_SECRET`의 Bearer를 길이 확인과
`timingSafeEqual`로 검증한다. 호출당 최대 1,000세션을 정리하고 `{ deletedCount }`를 반환한다.
종속 갱신 이력은 DB의 cascade 정책으로 함께 삭제한다. 인증 실패 401, 설정·저장소 장애 503이다.
**vercel.json에 일정은 등록하지 않았다.** 운영 승인 후 매시간 실행을 권장하며 한 배치가 계속
1,000행이면 적체를 모니터링하고 호출 빈도를 조정한다. 실제 DB 적용·운영 등록은 별도 승인 사항이다.

현재/과거 해시 식별은 세션 서비스와 같은 두 테이블을 전제로 하므로 세션·이력 migration을
함께 적용하기 전에는 요청이 503으로 닫힌다. 검증은 격리된 로컬 PostgreSQL에서만 수행했고 운영 DB에는 접속하지 않았다.
클라이언트는 single-flight 갱신과 세대 검사를 적용하고 모호한 네트워크 실패 후 구 토큰을
자동 재시도하거나 쓰기 요청을 자동 재실행하지 않는다.
비밀번호 변경·초기화는 해시와 `session_version + 1`을 같은 SQL 문장에서 변경해야 한다.
로그아웃 전체와 동시 발생하는 새 로그인은 회수 SQL이 관측하는 모바일 행 범위만 회수하며
향후 로그인까지 영구 차단하는 계정 잠금으로 해석하지 않는다.
