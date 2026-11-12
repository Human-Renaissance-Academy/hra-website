# 모바일 Bearer 로컬 통합 검증

`scripts/verify-mobile-bearer-http.mjs`는 배포용 Next 서버, 폐기 가능한 PostgreSQL,
G1 private 저장소 에뮬레이터와 실제 모바일 코어 모듈을 연결해 모바일 Bearer HTTP 여정을 검증한다. 운영 적용 승인은 아니다.

## 준비와 실행

Node 24, 루트 및 `apps/mobile`의 lock 기반 설치, 로컬 PostgreSQL 바이너리가 필요하다.
실제 `.env*` 실행 파일이 없는 별도 worktree에서 실행한다. 환경 파일을 복사하지 않는다.
하네스는 기존 `.next/BUILD_ID`를 요구하며 자동 빌드하지 않는다. 서버 변경 뒤에는 반드시 재빌드한다.
`src/`, `packages/contracts/`, `next.config.ts`, `package-lock.json`,
`scripts/migrate-mobile-sessions.sql`의 추적·비추적 비무시 파일 중 빌드 식별자보다
수정 시각이 새로운 입력이 있으면 한국어 재빌드 안내와 함께 실패한다.
성공 로그의 `MOBILE_BUILD_PROVENANCE`는 빌드 ID와 파일명·크기·수정 시각의
SHA-256 단축 지문을 남긴다. 이 검사는 내용 기반 재현 빌드 보장이 아니며,
수정 시각을 과거로 조작한 소스를 탐지한다고 주장하지 않는다.

```sh
# 저장소 루트에서 실행한다.
env -i PATH="$PATH" HOME="$HOME" npm run build
HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin node scripts/verify-mobile-bearer-http.mjs
HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin node scripts/verify-mobile-bearer-http.mjs
# 기존 쿠키 브라우저 회귀에는 별도로 설치된 Chromium이 필요하다.
HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin npm run test:academic-g1
```

각 명령의 종료 코드를 확인한다. `PASS MOBILE_*` 중간 출력만으로 전체 성공을 판단하지 않는다.
하네스는 서버 사례 뒤 `npx --no-install jest -c jest.e2e.config.cjs --runInBand`를 `apps/mobile`에서 실행한다.
Node 프로젝트는 `HRA_E2E_BASE_URL`이 없으면 건너뛰며 일반 `npm test`는 기존 `tests/`만 수집한다.
하네스 밖에서 실제 서버 주소나 운영 자격을 전달해 이 테스트를 실행하지 않는다.

## 증명하는 범위

- G1 baseline/순차 migration 뒤 실제 `migrate-mobile-sessions.sql` 적용 및 즉시 재적용.
- 네 역할 로그인, 일반 401, 계정별 제한·다른 계정 독립성, Bearer 우선순위, 정상 Web 쿠키.
- 회전·직전 토큰 유예·유예 밖 및 두 세대 이전 재사용 철회·실제 병렬 refresh 한 승자.
- 실제 refresh 경로에서 세션 예산 12회 회전 후 13번째부터 429·Retry-After,
  세션 자격/이력 불변, 소비 토큰 재사용 후 현재 접근·갱신 거부.
- 멱등 로그아웃, 모바일 전체 로그아웃과 Web 세션 생존, 버전/역할/삭제/만료/cron.
- 공개 공지·일정, 학생 과제, Origin 없는 토큰 교환, 단일 실제 PUT, 서명 callback,
  verify·최종화·같은 키 replay·원본 해시, 가이드북 목록의 PENDING 거부.
- 본인 제출 파일의 attachment/안전한 파일명·nosniff·실제 Next sandbox CSP·
  private no-store·Cookie/Authorization Vary·Set-Cookie 부재와 다른 학생 파일 404.
- 원시 TCP 소켓의 미완료 chunked logout-all 본문 두 종류(무바이트/첫 바이트 뒤 정지).
  6초 관측 상한 내 거부와 후속 공개 요청 생존. 서버 본문 검사 기한은 3초다.
- 실제 Blob GET barrier 중 logout-all 또는 계정 버전 증가 후 최종화 401,
  해당 submission_key의 제출 행 0건. 기존 에뮬레이터의 pauseNextRead를 사용하며
  서명·경로·실제 SQL 검사를 교체하지 않는다. 독립 사례 사이에서만 예산을 초기화한다.
- 실제 `SessionManager/createAuthApi/createApiClient`의 복원·single flight·세대 barrier,
  만료 뒤 보호 GET 단일 재시도 및 변경 요청 미재전송.
- 실제 제출 코어와 fetch Blob 전송, 서버 커밋 후 응답 유실/재개, 취소,
  Node 파일 시스템 다운로드 해시 및 취소 시 부분 파일 삭제.

## 격리와 진단

G1의 Unix 소켓 PostgreSQL·가짜 Neon→로컬 SQL 어댑터·undici 네트워크 가드를 재사용한다.
실제 인가·서비스·SQL·Blob 토큰 서명 함수는 교체하지 않는다. 서버와 Node 클라이언트 모두
정확한 앱/저장소 주소와 허용 공급자 요청만 loopback으로 전달한다. 리다이렉트를 따라가지 않는다.
합성 인증/Blob 키는 실행 메모리에만 두며 외부 환경은 PATH/HOME 등 허용 목록만 상속한다.
독립 시나리오 사이에만 rate-limit 이벤트를 초기화하며 흐름 내부에서는 초기화하지 않는다.

서버 원문 출력은 메모리에서 비밀번호·접근/갱신/Blob 토큰·Authorization·쿠키 패턴을 검사한다.
정상·실패 시 자식 프로세스, 저장소, DB를 정리한다. 원문 HTTP/토큰 로그를 추가하지 않는다.
Jest 실패 원문은 토큰을 포함할 수 있어 안전한 사례명/진단/소스 위치만 출력한다.

`MOBILE_DB_STATEMENTS`는 전용 preload counting proxy가 성공/실패 DB 전송마다
한 바이트만 누적한 전후 차이다. SQL·인자·결과는 기록하지 않는다. 현재 측정은
`GET /api/v1/me` 3문장, `POST /api/v1/auth/logout-all` 2문장이다.
로컬 psql 어댑터의 BEGIN/SET/Describe/형식 조회는 앱 문장 수에 포함하지 않으며,
실제 Neon 전송 횟수·지연·PostgreSQL 함수 내부 하위 문장 수를 의미하지 않는다.
중복 검증을 합치거나 post-Blob 체크포인트를 없애지 않는다.

별도 `mobile-session-persistence.test.mjs`는 강제 회전/계정 삭제 deadlock의
40P01 → 정제된 저장소 예외 → HTTP 503, 토큰·이력 전체 롤백을 20회 검증한다.
PostgreSQL은 `deadlock_timeout`(기본 1초)이 먼저 만료된 백엔드, 즉 먼저 기다린 쪽이 희생자가 되므로,
회전자가 DB 시계로 500ms 먼저 대기한 뒤에만 삭제자가 순환을 닫고 희생자가 회전 문장임을 단언한다.
두 대기자의 시작이 수 ms 차이일 때는 희생자가 뒤바뀔 수 있다. 전체 검증 중 이 사례가 한 번 실패했고 실패 원문이
삭제자 쪽의 원시 40P01로 보여(재현은 하지 못했다) 희생자를 시간차로 확정하고, 뒤바뀌면 원인을 알리는 단언을 두었다.
계정 잠금 대기가 갱신 만료를 넘는 사례와 신규 로그인/전체 회수도 각각 20회다.
전체 회수는 **그 문장 스냅샷에 보이는 세션만** 회수한다. 이후 커밋된 신규 로그인까지
금지하거나 Web session_version을 변경하는 기능은 아니다.

`.github/workflows/mobile-server-e2e.yml`은 관련 서버·계약·모바일 코어/E2E·하네스
변경을 선택해 환경 제거 빌드와 여정을 실행한다. 읽기 전용 권한, 고정 action,
시간 상한을 사용하며 실패 때만 로그 artifact(`/tmp/mobile-server-*.log`: 환경 제거 빌드 출력과 하네스 출력)를 7일 보관한다.
하네스는 고정 사례명·오류 코드·소스 위치와, 토큰·비밀번호 패턴을 걸러낸 모듈 로드 오류 한 줄(`DIAGNOSTIC ...`)만 출력하고 원문 토큰·응답 본문은 출력하지 않는다. 이 로그는 JSON 보고서용
`check-public-artifact.mjs`의 검사 대상이 아니다([공개 산출물 검사](public-artifact-safety.md)).
GitHub-hosted 실행 자체는 로컬에서 미검증이다.

## 한계

실제 Vercel Blob/hosted Neon, 운영 SQL 적용, 네이티브 SecureStore/FileSystem,
기기/에뮬레이터·UI·백그라운드·iOS를 증명하지 않는다. 가이드북 파일 다운로드는 이 범위에 없다.
Node 최소 PDF는 서버의 PDF 시그니처 계약을 만족하지만 PDF 뷰어 렌더링 검사는 아니다.
서버 로그 검사는 알려진 비밀 패턴 검사이지 임의 인코딩 정보 유출의 형식적 증명은 아니다.
일반 모바일 typecheck/lint/Jest와 독립 보안 리뷰는 별도 필수 게이트다.
Node fetch 결과는 네이티브 redirect·재전송·헤더 이후 취소·wire attempt 수를 증명하지 않는다.
실제 Web 그룹 변경 Server Action과 기존 쿠키의 통합 회귀도 이 하네스에는 없다.
Blob 후 재인가는 체크포인트 보장이지 회수와 최종 SQL을 하나의 transaction으로
선형화하는 보장이 아니다. 모든 오류/모든 파일 조합의 헤더 전수검사도 아니다.
