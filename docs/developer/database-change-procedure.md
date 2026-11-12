# 데이터베이스 변경 절차

이 문서는 저장소의 **DB 구조를 실제 환경에 적용하는 기준**입니다. `schema.ts`를 수정하는 일, DB를 변경하는 일, 앱을 배포하는 일은 각각 다른 작업입니다. 먼저 [DB 입문 안내](../DATABASE.md)에서 테이블·외래 키·마이그레이션 용어를 확인할 수 있습니다.

버전 SQL 등록 디렉터리(`scripts/db/versioned/`)는 있으나 실제 SQL은 없고 manifest도 미설정입니다. 공통 DB 적용 이력은 아직 없으며 범위별 legacy SQL·스크립트는 `scripts/migrate-*`에 있습니다. 자동 적용 이력과 Production migration gate는 [#280](https://github.com/yeongseon/hra-website/issues/280)의 후속 작업입니다. 아래 수동 절차가 이미 Production 배포 차단 장치로 구현됐다는 뜻은 아닙니다.

`scripts/db/source-inventory.json`은 **현재 소스 스냅샷**입니다. 기존 SQL 18개(읽기 전용 학사 preflight 포함), 신규 설치 검증 전용 후보 SQL 19개, 이름 패턴으로 관리하는 MJS 18개의 역할·원본 바이트 해시·기본 동작을 기록합니다. 후보는 `fresh_candidate` 역할과 전용 경로·ID·후보끼리의 선행 관계로 구분하며, 기존 SQL의 적용 이력으로 등록하지 않습니다. `node scripts/check-db-source-inventory.mjs`는 Git 추적 파일과 로컬의 미추적·비무시 SQL/MJS를 대조합니다. CI에서는 PR에 포함된 새 SQL이 Git 추적 파일이므로 목록 밖이면 실패합니다. 로컬의 무시된 미추적 파일은 검사하지 않으며, 임의 이름의 JS·앱 내 SQL·직접 `psql` 명령을 전수 탐지하는 장치는 아닙니다.

이 목록은 **DB에 적용됐다는 ledger나 전체 설치 순서가 아닙니다.** 뷰의 현행 정의처럼 정상적으로 갱신하는 파일도 새 바이트와 목록 해시를 함께 검토합니다. 같은 PR에서 SQL과 해시를 둘 다 수정하면 검사가 통과할 수 있으므로 변경 의미는 리뷰어가 확인합니다. G1의 9개 순서는 기존 테스트 배열과 정확히 대조하며 적용기는 대체하지 않습니다. #287 인덱스 SQL은 `public.rate_limit_events`와 UUID `reservation_id`가 필요하지만, 그 준비가 특정 SQL 파일의 운영 적용을 증명하지는 않습니다. 잠금 방식·대상·백업을 검토하기 전에는 운영 자동 적용 대상이 아닙니다. 새 DB 적용·재실행·catalog 확인, 운영 백업·승격 차단은 여전히 #280 후속 단계입니다.

검사는 `npm ci` 뒤에 실행합니다. 이미 사용하는 TypeScript 파서로 G1의 실제 최상위 `export const` 문자열 배열만 읽으며, 주석·문자열 속 가짜 선언과 실행식·중복 선언·문법 오류는 인정하지 않습니다. 소스 모듈이나 SQL을 실행하지 않으며 새 의존성도 추가하지 않습니다.

정본별 책임과 중복 필드, 수동 수정 지점의 비교는 [DB 변경 검증 정본별 책임과 중복 필드](db-contract-responsibilities.md)에 있습니다(#364, 현황 정리이며 구현된 단순화가 아닙니다).

### 신규 설치 소스 대응표

`scripts/db/installation-contract.json`은 위 source inventory의 항목을 참조해 신규 설치에 필요한 객체·선행 조건·검증 내용과 제외 이유를 기록합니다. 경로·역할·원본 해시·선행 관계의 정본은 기존 inventory입니다. `node scripts/check-db-installation-contract.mjs`는 모든 inventory 항목의 양방향 대응을 검사하며 SQL·관리 스크립트·DB를 실행하지 않습니다.

대응표의 `coverageComplete`는 확인된 소스를 빠짐없이 분류했는지, `freshReady`는 신규 설치에 필요한 정의·중복 관계·선행 조건이 모두 해결됐는지를 구분합니다. 분석만으로 확정할 수 없는 동적 SQL이나 schema export와 legacy SQL의 중복은 `unresolved`로 남깁니다. 필요한 객체의 정의 소스가 제외됐거나 미해결 조건이 남아 있으면 신규 설치 bundle의 승격을 차단합니다. 이 표의 성공도 실제 DB 적용·운영 baseline을 증명하지 않습니다.

`scripts/db/candidates/db-fresh/`의 19개 SQL은 **소유 로컬 PostgreSQL에서만 비교하는 고정 후보**입니다. 현재 Drizzle export 후보는 원본 생성 SQL의 `CREATE TABLE` 대상 47곳만 `public`으로 한정합니다. G1·추가 정의 후보는 파일별로 검토한 최외곽 transaction과 일부 timeout 행만 제외하고, 함수 본문·권한·제약은 원본과 바이트 단위로 대조합니다. 특히 enrollment-links 원문의 잠금 한도 10초는 후보에서 제외되어 적용기의 5초 한도가 적용되므로 시간 정책은 동등하지 않습니다. 독립 원문 reference의 20개 catalog 단계와 후보 적용기의 결과·재개·실패 롤백은 `HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin node --test tests/integration/db-fresh-reference.test.mjs tests/integration/db-fresh-bundle.test.mjs`로 검사합니다. 경로는 해당 환경의 PostgreSQL 실행 파일 디렉터리로 바꿉니다. 이 시험은 합성 DB만 만들며 운영 대상·기존 DB upgrade/restore·백업·승격 승인을 확인하지 않습니다. 대응표의 미해결 항목과 `freshReady:false`, 실제 manifest의 `unset`·0개 상태를 유지합니다.

G1 학생·기수 등록 테이블은 [학생 명부 스키마 적용](academic-students-migration.md)의 범위 SQL과 읽기 전용 preflight를 사용합니다.
예약 ID 정리 인덱스는 [#287 변경 절차](rate-limit-reservation-index.md)의 범위 SQL·카탈로그 검증을 따릅니다. **이 SQL과 인덱스가 운영 DB에 적용됐다는 뜻은 아닙니다.** 운영 대상·백업·허용 잠금 시간·적용 승인은 별도로 확인합니다.

### 버전 SQL manifest와 전달된 이력 검사

`node scripts/check-db-migration-manifest.mjs`는 `scripts/db/migration-manifest.json`과 `scripts/db/versioned/`의 소스 계약을 확인합니다. 원본 SQL bytes의 SHA256·순서·ID·경로를 검증하고, Git 추적 파일 누락과 해당 디렉터리의 미등록 SQL을 거부합니다. 이 범위에서는 ignore된 미추적 SQL도 검사합니다. SQL을 실행하거나 DB에 접속하지 않습니다.

현재 manifest는 **`unset`·0개**입니다. 이 검사의 성공은 초기 설치·baseline·migration 적용 성공을 뜻하지 않습니다. 기존 SQL18개를 새 migration이나 이미 적용된 이력으로 자동 변환하지 않습니다. 향후 versioned SQL을 추가할 때는 저장소 전체 SQL을 확인하는 기존 source inventory와 새 manifest의 등록 책임을 함께 검토합니다.

선택 인자 `--prior-manifest <상대경로.json>`과 `--ledger-snapshot <상대경로.json>`은 전달된 입력 사이의 일관성만 비교합니다. 이전 manifest의 prefix 변경, 알 수 없는 이력·순서·checksum과 native ledger 테이블 존재를 거부하지만, JSON이 실제 DB 관측이나 승인 근거임을 증명하지는 않습니다. 출력의 `observedDatabase`와 `readyToApply`는 항상 `false`입니다. 입력 schema·크기·경로 제한은 `scripts/db/versioned/README.md`에 있습니다.

### 임시 DB의 적용기 검증

Linux의 `/dev/shm`과 PostgreSQL 실행 파일을 준비하고 `HRA_TEST_PG_BIN`을 해당 실행 파일 디렉터리로 지정한 뒤 `node --test --test-concurrency=1 scripts/tests/db-migration-*.test.mjs tests/integration/db-migration-local.test.mjs`로 로컬 적용기 계약을 확인합니다. 테스트가 직접 생성한 Unix socket 전용 클러스터에서 적용은 비슈퍼유저 migration 역할로 실행하고, 관리 역할은 임시 클러스터·권한 준비와 고정 합성 대상의 metadata 장애 주입에만 사용합니다. 임의 URL·대상 JSON·운영 DB를 받는 적용 명령은 제공하지 않습니다.

같은 물리 세션의 DB 공통 잠금, manifest와 성공 이력의 전체 prefix·checksum, 파일별 SQL과 ledger의 원자성을 검사합니다. COMMIT 응답 유실은 새 연결에서 동일 대상·잠금·관측 prefix에 대응하는 사전 catalog 계약을 대조한 뒤 판정합니다. 이미 COMMIT이 성공한 후 catalog 검증이 실패하면 committed 상태를 보존하면서 차단하며 자동 rollback·재실행을 하지 않습니다. 검증된 prefix 뒤에 pending 파일이 있으면 전체 migration 완료로 보고하지 않습니다.

카탈로그 비교는 로컬 fixture의 `public`·`hra_migrations`에 있는 검토된 객체 종류와 고정 합성 데이터 불변식에 한정합니다. 함수·ACL·제약·인덱스·뷰·트리거·RLS 등의 지문을 비교하며 전체 운영 PostgreSQL 객체나 실제 hosted Neon의 연결·TLS·pooling을 검증했다는 뜻은 아닙니다. 임시 SQL helper는 transaction 제어를 PostgreSQL에서 거부하게 하는 경계이며, 신뢰하지 않는 임의 SQL의 sandbox가 아닙니다. migration 소스 자체의 검토가 필요합니다.

로컬 transport는 설치된 Neon 1.2.0의 [공개 WebSocket 설정](https://github.com/neondatabase/serverless/blob/v1.2.0/CONFIG.md)을 사용합니다. 파손된 연결은 [PoolClient 해제 계약](https://node-postgres.com/apis/pool#releasing-clients)에 따라 재사용하지 않으며, pool 종료뿐 아니라 실제 socket 종료도 확인합니다. 클라이언트 timeout은 서버의 SQL 취소나 rollback 확정이 아니므로 서버 timeout과 실제 이력·catalog 재검증을 함께 사용합니다. driver 갱신 시에는 최신 웹 문서만 보지 말고 설치본의 공개 API와 이 장애 회귀를 다시 확인합니다.

결과의 `productionReady`는 항상 `false`입니다. 적용기 단독 성공이나 위 로컬 후보 비교는 전체 웹/G1 설치의 운영 승격을 뜻하지 않습니다. 현재 운영 manifest·baseline은 미설정으로 유지하며, upgrade·restore와 실제 대상·백업/복구·승인·플랫폼 승격 차단은 별도 후속 검증입니다. 원본 SQL·catalog·회원 데이터는 공개 결과로 저장하지 않습니다.

## 1. 대상과 명령의 효과부터 확인하기

| 상황·명령 | 용도 | 현재 주의할 동작 |
| --- | --- | --- |
| 새 빈 개발·테스트 DB | 검토한 초기 SQL·추가 제약 준비 | 기존 격리 fixture 또는 검토·승인한 별도 적용 절차 사용 |
| 기존·운영 DB | 이미 저장된 데이터 보존하며 변경 | 검토된 범위별 SQL·스크립트 적용 |
| `npm run db:push` | 검증되지 않은 전체 차이 적용 차단 | 접속·환경 조회 없이 안내하고 실패 종료; 적용 인자도 지원하지 않음 |
| `db:migrate-rate-limit-reservations` | 요청 제한 설치 대상 표시 | 인자 없이는 DB에 접속하지 않고 URL의 호스트·DB명만 표시; 적용 시 부모 `PG*` 접속 설정은 전달하지 않음 |
| `db:migrate-alumni-featured`·`db:migrate-user-session-version` | 두 한정 컬럼의 구조 확인·적용 | 무인자는 DB에 접속하지 않는 계획; `--confirm-apply`에서만 소유 표·정확한 컬럼 정의 검증 후 적용 |
| `db:migrate-atomic-application-questions` | 질문 저장 버전·저장/제출 검증 함수의 설치 계획 | DB 접속 없는 계획만 제공하며, `--confirm-apply`도 신뢰된 적용 대상이 없어 접속 전에 차단 |
| `db:migrate-add-markdown-image-assets` | 본문 이미지 원장·인덱스·참조 뷰의 설치 계획 | DB 접속 없는 계획만 제공하며, `--confirm-apply`도 신뢰된 적용 대상이 없어 접속 전에 차단 |
| `db:migrate-recruitment-singleton` | 모집설정 고정 키·기본행의 설치 계획 | DB 접속 없는 계획만 제공. 순수 기본행 SQL 선언은 유지하지만 `--confirm-apply`도 접속 전에 차단 |
| `db:migrate-add-application-unique` | 같은 양식·이메일의 지원서 중복 제약 설치 계획 | DB 접속 없는 계획만 제공. 기존 catalog·중복 검사·ALTER·경합 재확인·사후 조회는 미제공 |
| `db:migrate-add-rate-limit-tables` | 과거 로그인·업로드 로그 테이블과 인덱스의 설치 계획 | DB 접속 없는 계획만 제공. 기존 사전 검사·대상별 설치·사후 조회는 미제공이며 현재 예약 함수 설치 도구와 별개 |
| `seed-cohorts` | 과거 기수 선언 19건을 보존한 초기 데이터 계획 | 접속 없는 계획만 제공. 선언 건수는 실제 DB 건수가 아니며 조회·건너뛰기·누락 행 입력은 미제공 |
| `node scripts/seed-faculty.mjs`·`node scripts/seed-press.mjs`·`node scripts/seed-alumni.mjs` | 과거 교수진 21건·언론보도 26건·수료생 이야기 3건 선언을 보존한 초기 데이터 계획 | npm 별칭 없음. 접속 없는 계획만 제공하며 이름·내용·외부 URL은 출력하지 않음. 선언 건수는 실제 DB 건수가 아니며 조회·건너뛰기·누락 행 입력은 미제공 |
| `node scripts/migrate-html-to-markdown.mjs` | 과거 HTML 본문 5개 열의 Markdown 변환 계획 | npm 별칭 없음. 접속 없는 계획만 제공. 이전 무인자 즉시 UPDATE와 실제 본문을 조회·출력하던 `--dry-run` 미리보기는 미제공이며 `--dry-run`도 접속 전에 거부 |
| 그 밖의 `db:migrate-*` | 스크립트별 구조 변경 | 이름만으로 dry-run이라 가정하지 않음; 실행 즉시 변경하는 스크립트가 있음 |

두 한정 컬럼 명령은 `.env`가 없어도 무인자 계획을 출력합니다. 적용하려면 승인된 대상의 명시적 DB URL과 `--confirm-apply`를 전달해야 합니다. 이 인자는 실행 의도를 표시할 뿐 실제 DB identity·백업·운영 승인을 증명하지 않습니다. 기존 컬럼의 타입·NOT NULL·기본값·소유권이 다르면 자동 보정하지 않고 실패하며, 이미 저장된 `session_version` 값은 변경하지 않습니다.

질문 저장 버전·본문 이미지 원장·모집설정 명령도 `.env` 없이 계획을 출력하지만, 실제 적용 기능은 비활성입니다. `--confirm-apply`만 지정해도 `TARGET_UNTRUSTED`로 실패하며 URL·환경 플래그·자체 작성 승인 JSON으로 이를 해제할 수 없습니다. 기존 DB의 질문 컬럼·두 함수, 이미지 원장 테이블·인덱스·뷰, 모집설정 컬럼·제약·기본행을 각각 결합 설치하던 경로는 사용할 수 없습니다. 원본 SQL 선언과 소유 로컬 신규 설치 후보는 유지하지만, 이 후보·격리 회귀는 해당 기존 DB 업그레이드 경로를 대체하지 않습니다. 실제 대상·복구·승인이 검증된 결합 업그레이드는 [#280](https://github.com/yeongseon/hra-website/issues/280)에 남아 있습니다.

지원서 중복 제약 명령도 `.env` 없이 계획만 출력하고 `--confirm-apply`를 접속 전에 차단합니다. 현재 명령은 기존 제약·동명 relation·동등 index·중복 행을 조회하거나 단일 `ALTER`, 경합 오류 후 재확인, 사후 검증을 수행하지 않습니다. 이전 경로도 이 단계 전체를 한 transaction으로 묶지는 않았습니다. 실제 제약 선언과 앱의 특정 이름 `23505` 오류 처리는 유지하지만, 이 회귀를 비활성화한 기존 DB 설치 경로의 동등성 증거로 사용하지 않습니다. 필요한 제약이 없는 DB에는 관련 앱 기능을 배포하지 말고 [#280](https://github.com/yeongseon/hra-website/issues/280)의 검증된 업그레이드 경계를 먼저 마련합니다. 계획 출력은 DB 상태 검사나 적용 완료를 뜻하지 않습니다.

과거 로그 설치 명령도 `.env` 없이 계획만 출력하고 `--confirm-apply`를 접속 전에 차단합니다. 대상은 `login_attempts`·`upload_rate_limit_log` 두 테이블과 인덱스 세 개입니다. 기존 사전 검사·대상별 테이블/인덱스 transaction·사후 조회는 미제공입니다. 이전에도 두 대상 전체를 한 transaction으로 묶지 않아 첫 대상만 반영될 수 있었습니다. 이 변경은 해당 로그 테이블의 불필요함이나 실제 DB의 준비 상태를 판정하지 않습니다. 현재 요청 제한의 `rate_limit_events`·예약 함수·별도 `db:migrate-rate-limit-reservations` 도구와 런타임은 유지하며, 필요한 객체가 없는 DB의 준비는 [#280](https://github.com/yeongseon/hra-website/issues/280)의 검증된 경계를 먼저 마련합니다. schema export·현재 요청 제한 회귀를 비활성화한 기존 DB 설치 경로의 동등성 증거로 사용하지 않습니다.

기수 seed도 `.env` 없이 접속 없는 계획만 출력하고 `--confirm-apply`를 차단합니다. 같은 MJS의 순수 선언 19건은 과거 초기값을 보존한 것이며 현재 운영 DB의 건수·내용·적용 가능성을 증명하지 않습니다. 이전의 항목별 name 조회 후 건너뛰기/INSERT는 미제공이며, 그 경로도 upsert·`ON CONFLICT`·전체 transaction은 아니어서 일부 행만 반영될 수 있었습니다. 기존 행 수정·회원/학적/권한 연결을 수행하던 도구로 해석하지 않습니다. 현재 화면·service는 계속 DB를 정본으로 사용하며 새 export를 파일 기반 fallback이나 CMS로 연결하지 않습니다. 선언·hash·합성 조회 회귀를 실제 seed나 운영 승인으로 사용하지 말고 [#280](https://github.com/yeongseon/hra-website/issues/280)의 검증된 데이터 적용 경계를 먼저 마련합니다. 기존 `seed-admin` 보호 조건은 유지합니다.

교수진·언론보도·수료생 이야기 seed도 같은 방식입니다. 세 MJS는 `.env`·`DATABASE_URL`을 읽지 않고 접속 없는 계획만 출력하며 `--confirm-apply`를 접속 전에 차단합니다. 각 MJS의 순수 선언(교수진 21건·언론보도 26건·수료생 이야기 3건)은 과거 초기값의 보존일 뿐 현재 운영 DB의 건수·내용·외부 링크 유효성·적용 가능성을 증명하지 않습니다. 계획·거부 출력에는 선언 건수와 고정 코드만 있으며 이름·직책·인용·본문·기사 URL을 포함하지 않습니다. 이전의 이름+카테고리(교수진)·URL(언론보도)·이름(수료생 이야기) 조회 후 건너뛰기/INSERT는 미제공이며, 그 경로도 upsert·`ON CONFLICT`·전체 transaction은 아니어서 일부 행만 반영될 수 있었습니다. 교수진 선언은 출결·학사 운영 권한이나 승인 계정의 근거가 아니며, 관리자가 편집한 운영 행·이미지 metadata를 덮어쓰는 도구로 해석하지 않습니다. 새 export를 Page·service·fallback에 연결하지 않으며 누락 행 입력은 [#280](https://github.com/yeongseon/hra-website/issues/280)의 검증된 데이터 적용 경계 뒤 별도로 수행합니다.

HTML→Markdown 변환 명령(`node scripts/migrate-html-to-markdown.mjs`, npm 별칭 없음)도 `.env`·`DATABASE_URL`을 읽지 않고 접속 없는 계획만 출력하며 `--confirm-apply`를 접속 전에 차단합니다. 이전에는 인자 없이 실행하면 `notices.content`·`class_logs.content`·`weekly_texts.body`·`report_templates.body`·`recruitment_settings.details_markdown`의 전체 행을 조회해 HTML로 보이는 행마다 즉시 UPDATE했습니다. 대상 확인·백업·승인·전체 transaction이 없어 일부 행만 반영될 수 있었습니다. 선택 인자 `--dry-run`은 같은 실제 조회 뒤 행 id와 변환 결과 앞 200자를 출력하는 미리보기(UPDATE 없음)였지만, 운영 본문을 읽고 출력하므로 더 이상 제공하지 않으며 `DRY_RUN_UNAVAILABLE`로 접속 전에 거부합니다. HTML 판정 휴리스틱과 기존 Turndown 설정은 같은 MJS의 순수 export(`looksLikeHtml`·`createHtmlToMarkdownConverter`)로 보존했지만 DB에 연결되지 않습니다. 이 변환 회귀를 실제 본문 변환 완료·HTML 잔존 여부·운영 승인의 증거로 사용하지 않으며, 남은 HTML 본문 변환이 필요하면 [#280](https://github.com/yeongseon/hra-website/issues/280)의 검증된 데이터 적용 경계를 먼저 마련합니다.

기본 `drizzle.config.ts`는 `.env`·`DATABASE_URL`과 DB credentials를 읽지 않습니다. 따라서 기본 설정의 `npx drizzle-kit push`·`npx drizzle-kit migrate`도 접속 정보 부족으로 중단합니다. `npm run db:push -- --isolated`·`--apply`·URL·자체 승인 JSON으로 이를 활성화할 수 없습니다. 도구가 소유한 일회성 DB에 대한 별도 push 기능도 아직 제공하지 않습니다.

이 보호는 저장소의 **기본 실행 경로**에 적용됩니다. 운영자가 `drizzle-kit push --url ...` 또는 별도 `--config`·직접 `psql`을 실행할 권한까지 막는 sandbox는 아닙니다. 그런 우회가 승인된다는 뜻도 아닙니다. 외부에서 별도 도구·설정을 실행할 권한과 Production migration/promotion gate는 #280의 별도 경계로 남습니다. 환경의 URL이 원격·기존 DB를 가리켜도 기본 명령은 접속하지 않으며, 현재 모든 `db:migrate-*`가 같은 보호를 받는다는 뜻은 아닙니다.

`dry-run`은 실제 변경 없이 확인하는 단계입니다. 모든 스크립트가 `--confirm-apply`를 지원하지 않습니다. 실행하려는 파일의 인자 처리와 적용 범위를 읽고, 이슈·PR에 대상 환경·순서·사후 검증을 남깁니다. 연결 문자열·비밀번호·운영 데이터는 공개 기록에 넣지 않습니다.

`schema.ts`만으로는 `DEFERRABLE INITIALLY DEFERRED` 외래 키와 일부 저장 함수·뷰를 모두 표현할 수 없습니다. `push`가 모든 함수를 무조건 삭제한다는 뜻은 아닙니다. **도구가 표현하지 않는 DB 객체까지 올바르게 설치·보존됐다고 보장할 수 없고, FK 재생성 시 별도 속성을 재확인해야 한다는 뜻**입니다.

## 2. 새 빈 개발·테스트 Neon DB

다음은 기본 웹 기능을 준비하는 절차입니다. 운영 DB의 갱신이나 학사 전체 설치 목록으로 사용하지 않습니다. 학사는 [G1 품질 게이트](academic-g1-quality-gate.md)의 단계별 SQL·검증을 따르며 준비 전에는 관련 기능을 열지 않습니다.

1. 자동 검증은 `tests/support/resource-qa-postgres.mjs`가 만든 폐기 가능한 PG와 기존 QA fixture를 사용합니다. 실제 개발 DB를 준비하는 경우에는 별도 대상·검토·승인 절차부터 정하고 기존 설정 파일을 덮어쓰지 않습니다.
2. `npx drizzle-kit export`는 접속 없이 스키마 SQL을 출력하고 `npx drizzle-kit generate`는 로컬 migration 파일을 생성합니다. `generate`의 `drizzle/` 산출물은 검토 대상이며 실제 적용 이력이 아닙니다. 검토한 SQL을 별도로 적용하는 행위는 `push` 실행과 구분하고, 실제 대상·빈 DB·백업/복구·적용 권한을 확인합니다. `npm run db:push`는 현재 모든 대상에서 비활성입니다.
3. 아래 후속 항목별로 실제 적용 경로가 제공되는지 확인합니다. 계획만 제공하는 명령은 DB 준비를 완료하지 않습니다. `psql`을 쓰는 단계는 PostgreSQL 클라이언트 실행 파일도 준비합니다.
4. 카탈로그 확인 SQL과 관련 격리 테스트를 통과시킵니다. 카탈로그는 실제 테이블·제약·함수의 구조 정보를 뜻합니다.
5. 관리자 계정이 필요하면 [최초 관리자 준비](../DATABASE.md)를 수행하고 합성 데이터로 앱 기능을 확인합니다.

| 순서 | 적용 항목 | 명령·문서 |
| --- | --- | --- |
| 1 | 질문 저장·제출 버전 확인 함수 | `npm run db:migrate-atomic-application-questions`는 접속 없는 계획만 제공. 실제 적용은 검토된 별도 절차가 필요하며 기존 DB 결합 업그레이드 경로는 미제공 |
| 2 | 파일 소유권 원장·현재 참조 뷰 | `npm run db:migrate-add-markdown-image-assets`는 접속 없는 계획만 제공. 실제 적용은 검토된 별도 절차가 필요하며 기존 DB 결합 업그레이드 경로는 미제공 |
| 3 | 요청 제한 테이블·예약 함수 | [요청 제한 운영 절차](../operations/rate-limits.md)의 대상 표시 후 `--confirm-apply` |
| 4 | 모집설정 고정 키·기본 행 | `npm run db:migrate-recruitment-singleton`은 접속 없는 계획만 제공. 실제 적용은 검토된 별도 절차가 필요하며 기존 DB 결합 업그레이드 경로는 미제공 |
| 5 | 답변 보호와 지연 FK 검사 | `psql -X -v ON_ERROR_STOP=1 -f scripts/migrate-protect-application-answers.sql` |

`psql` 연결 정보는 안전한 `PG*` 환경변수나 PostgreSQL 서비스 파일로 전달합니다. 위 명령문 자체에는 접속 주소를 넣지 않습니다. 앱의 `DATABASE_URL`을 준비했다고 별도로 실행한 `psql`도 자동으로 같은 DB에 연결되는 것은 아니므로 둘의 대상을 확인합니다.

### 기본 카탈로그 확인

다음 SQL은 구조를 읽고 변경하지 않습니다.

```sql
SELECT conname, confdeltype, condeferrable, condeferred, convalidated
FROM pg_constraint
WHERE conrelid = 'public.application_answers'::regclass
  AND conname = 'application_answers_question_id_application_questions_id_fk';
-- 기대: confdeltype=a, condeferrable=true, condeferred=true, convalidated=true

SELECT to_regprocedure('save_application_form_questions(uuid,integer,jsonb)');
SELECT to_regprocedure('assert_application_form_questions_revision(uuid,integer)');
SELECT to_regprocedure('reserve_rate_limit(text[],text[],integer[],integer[])');
SELECT to_regclass('public.markdown_image_references');
SELECT to_regclass('public.rate_limit_events');
-- 모두 NULL이 아니어야 합니다.

SELECT conname FROM pg_constraint
WHERE conrelid = 'public.recruitment_settings'::regclass
  AND conname IN (
    'recruitment_settings_singleton_key_unique',
    'recruitment_settings_singleton_key_check'
  );
-- 두 제약이 있어야 합니다.
```

`NULL`은 해당 이름·인자의 객체를 찾지 못했다는 뜻입니다. 존재 확인만으로 함수 내용이 최신인지 검증되지는 않으므로 적용한 SQL과 기능 테스트도 확인합니다. 함수 인자가 바뀌면 이 확인 SQL도 함께 갱신합니다. 지연 FK의 이유와 상세 복구 기준은 [P1 답변 보호 적용 기록](p1-security-rollout.md)에 있습니다.

## 3. 기존 DB와 운영 DB

1. 연결할 환경과 변경 대상, 백업 시점, 복구 가능한 경로를 확인합니다. 적용 전 실제 카탈로그와 `schema.ts` 차이를 검토합니다.
2. 변경 이슈에 포함된 **범위가 한정된** 스크립트·SQL을 격리 DB에서 먼저 실행합니다. 기존 데이터 형태를 재현할 때에는 합성 데이터나 승인된 비식별 데이터를 사용합니다.
3. 잠금·기존 데이터 영향·앱과의 호환성을 확인하고 적용 순서와 실패 시 행동을 기록합니다. DB 변경을 Vercel build 명령에 끼워 넣지 않습니다.
4. 승인된 대상에 같은 절차를 적용하고 스크립트별 사후 검사와 관련 카탈로그 검증을 통과시킵니다.
5. 코드 검증과 관련 기능 스모크를 확인한 버전을 배포합니다. 스모크는 로그인·조회·저장처럼 핵심 기능이 작동하는지 간단히 확인하는 검사입니다.

```bash
npm run typecheck
npm test
npm run build
```

자동 테스트의 성공·실패·건너뜀을 구분합니다. 필요한 PostgreSQL 테스트가 건너뛰어졌다면 DB 변경 검증이 완료된 것으로 기록하지 않습니다.

## 4. 실패했을 때

| 상황 | 다음 행동 |
| --- | --- |
| 스크립트 오류 | 어느 단계까지 적용됐는지 사후 조회. 트랜잭션 범위는 해당 파일에서 확인 |
| 기대 함수·제약 없음 | 대상 DB와 적용 SQL을 확인한 뒤 누락 범위의 복구 계획 수립 |
| 기존 데이터·구조 불일치 | 결과를 보존하고 차이를 설명하는 별도 수정 SQL을 검토 |
| 실수로 기존 DB에 전체 push 실행 | 추가 변경을 멈추고 카탈로그·데이터 영향 확인. 전체 스크립트 일괄 재실행으로 복구하지 않음 |
| 앱만 롤백 | DB·파일 변경은 자동 복구되지 않으므로 이전 앱과의 호환성도 확인 |

각 실행은 환경·커밋·스크립트·시각·확인 결과를 기록합니다. 이 기록은 현재 공통 이력 테이블을 대신하는 운영 근거이며, 추후 자동 이력이 마련되면 절차를 갱신합니다.

## 코드 근거

`package.json`, `drizzle.config.ts`, `src/lib/db/schema.ts`, `scripts/migrate-atomic-application-questions.mjs`, `scripts/migrate-add-markdown-image-assets.mjs`, `scripts/migrate-rate-limit-reservations.mjs`, `scripts/sql/rate-limit-reservations.sql`, `scripts/migrate-recruitment-singleton.mjs`, `scripts/migrate-protect-application-answers.sql`.
