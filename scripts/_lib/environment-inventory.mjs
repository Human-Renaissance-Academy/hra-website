/**
 * 환경변수의 공개 운영 계약 정본입니다. 실제 값·실제 호스트·사용자 ID는 저장하지 않습니다.
 * 앱·운영 명령과 플랫폼/SDK/격리 QA 입력을 구분하며 생성 문서와 예시를 함께 검사합니다.
 */
const applicationEnvironments = ["Development", "Preview", "Production"];
const isolatedEnvironments = ["Development 합성 검증", "CI 격리 실행"];

/** 공통 적용 정책만 공유합니다. 변수별 필수 조건과 누락 동작은 각 항목에서 명시합니다. */
function variable(name, category, purpose, secret, requiredWhen, missing, options = {}) {
  const operational = ["application", "sdk", "legacy", "operator", "platform"].includes(category);
  return {
    name, category, purpose, secret, requiredWhen, missing,
    environments: operational ? applicationEnvironments : isolatedEnvironments,
    isolation: category === "platform" ? "플랫폼이 해당 실행에 제공; 직접 복제하지 않음" : operational
      ? "환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지" : "합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만",
    example: { mode: "omitted", value: "" }, ...options,
  };
}
const active = (value = "") => ({ example: { mode: "active", value } });
const commented = (value = "") => ({ example: { mode: "commented", value } });

export const environmentInventory = {
  variables: [
    variable("DATABASE_URL", "application", "Neon DB 접속", true, "DB 기능·상태 점검·DB 운영 명령", "미설정 시 DB 호출 오류, health 503. 앱은 Neon HTTP 드라이버이며 일반 로컬 PG URL로 대체하지 않음", active("postgresql://user:password@ep-example.us-east-1.aws.neon.tech/hra?sslmode=require")),
    variable("AUTH_SECRET", "sdk", "Auth.js 세션 보호", true, "실제 로그인·세션 검증", "명시 config secret이 없으면 AUTH_SECRET ?? NEXTAUTH_SECRET. 빈 AUTH_SECRET은 호환 별칭도 막음; 지원 secret 누락 시 production 인증 오류", { ...active(), implicit: true, owner: "src/lib/auth.ts → next-auth의 setEnvDefaults; node_modules 전체 옵션은 계약 대상 아님" }),
    variable("AUTH_URL", "sdk", "Auth.js 요청 origin 및 기본 인증 경로 override", false, "승인한 프록시·고정 origin 구성이 필요할 때만; QA preload도 사용", "미설정이면 NEXTAUTH_URL. 둘 다 미설정이면 요청 기반 URL; 명시한 빈 문자열은 별칭을 건너뜀. 잘못된 URL은 인증 오류 가능", { ...commented(), owner: "src/lib/auth.ts → next-auth/lib/env의 reqWithEnvURL·setEnvDefaults; tests/support/site-route-preload.mjs도 직접 사용" }),
    variable("AUTH_TRUST_HOST", "sdk", "Auth.js의 호스트 신뢰 입력", false, "신뢰하는 프록시·호스팅의 Host 정책을 검토한 경우만", "명시 config가 없으면 !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production'). 먼저 선택된 빈 문자열은 false, false 문자열은 true; 임의 활성화 금지", { ...commented(), implicit: true, owner: "src/lib/auth.ts → @auth/core/lib/utils/env의 trustHost 기본값; QA 실행기도 값을 명시" }),
    variable("NEXTAUTH_URL", "legacy", "Auth.js 기존 URL 호환 별칭", false, "기존 배포 설정을 canonical AUTH_URL로 전환 검토할 때만", "AUTH_URL이 nullish일 때만 사용. 빈 AUTH_URL은 별칭을 막음; 둘 다 미설정이면 요청 기반 URL", { implicit: true, owner: "next-auth/lib/env 및 @auth/core의 AUTH_URL ?? NEXTAUTH_URL 처리" }),
    variable("NEXTAUTH_SECRET", "legacy", "Auth.js 기존 세션 secret 호환 별칭", true, "기존 배포 설정을 canonical AUTH_SECRET으로 전환 검토할 때만", "AUTH_SECRET이 nullish일 때만 사용. 빈 AUTH_SECRET은 별칭을 막음; 지원 secret 누락 시 production 인증 오류", { implicit: true, owner: "next-auth/lib/env의 AUTH_SECRET ?? NEXTAUTH_SECRET 처리" }),
    variable("AUTH_GOOGLE_ID", "application", "Google OAuth client ID", false, "Google 로그인을 제공할 때 secret과 함께", "ID·secret 중 하나라도 없으면 Google 제공자·버튼 비활성", active()),
    variable("AUTH_GOOGLE_SECRET", "application", "Google OAuth client secret", true, "Google 로그인을 제공할 때 ID와 함께", "ID·secret 중 하나라도 없으면 Google 제공자·버튼 비활성", active()),
    variable("AUTH_KAKAO_ID", "application", "Kakao OAuth REST client ID", false, "Kakao 로그인을 제공할 때 secret과 함께", "ID·secret 중 하나라도 없으면 Kakao 제공자·버튼 비활성", active()),
    variable("AUTH_KAKAO_SECRET", "application", "Kakao OAuth client secret", true, "Kakao 로그인을 제공할 때 ID와 함께", "ID·secret 중 하나라도 없으면 Kakao 제공자·버튼 비활성", active()),
    variable("AUTH_KAKAO_EMAIL_SCOPE", "application", "승인한 Kakao 이메일 동의 요청", false, "제공자 콘솔·계정 연결 정책 확인 후 true", "정확한 true가 아니면 이메일 동의를 추가 요청하지 않음", active("false")),
    variable("NEXT_PUBLIC_APP_URL", "application", "개발 메타데이터 URL fallback; 비밀값 금지", false, "Vercel URL이 없는 개발 환경에서 주소 변경 시", "Vercel Production은 운영 URL, Preview는 배포 URL 우선; Vercel 밖 production은 고정 주소, 개발 기본 localhost. 색인 허용과 무관", active("http://localhost:3000")),
    variable("BLOB_READ_WRITE_TOKEN", "sdk", "공개 콘텐츠 Blob의 서버 인증", true, "공개 업로드·공개 원본 조회/삭제 운영 명령", "앱의 토큰 없는 SDK 호출이 읽음. 지원 계약은 별도 public 저장소 token이며 private token으로 대체하지 않음", { ...active(), owner: "src/app/api/upload-image/route.ts 등의 @vercel/blob 호출; 운영 명령은 직접 읽음" }),
    variable("RESOURCE_PRIVATE_BLOB_HOST", "application", "보호 자료 전용 Private Blob 호스트", false, "보호 자료 private 모드·private 파일 읽기/이전", "private 모드에서 누락·잘못된 private 호스트면 오류; 공개 fallback 없음", active()),
    variable("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "application", "보호 자료 전용 서버 token", true, "보호 자료 private 업로드·읽기·정리", "private token 누락 시 해당 작업을 거부", active()),
    variable("RESOURCE_PRIVATE_BLOB_ENABLED", "application", "새 보호 자료의 private 쓰기 전환", false, "저장소 준비와 기존 파일 이전 검토 후 true", "정확한 true가 아니면 기존 public 쓰기 저장소 선택; 기존 공개 파일 보호 완료를 뜻하지 않음", active("false")),
    variable("HEALTH_CHECK_SECRET", "application", "health 상세 응답 인증", true, "허용한 운영자가 상세 상태를 조회할 때만", "없으면 상세 정보 숨김; 기본 DB 점검과 HTTP 200/503은 수행", active()),
    variable("CRON_SECRET", "application", "cleanup API Bearer 인증", true, "승인된 환경의 예약/수동 cleanup 호출", "세 cleanup API(요청 제한·학사 제출 파일·모바일 세션)에서 누락 503, 인증 실패 401; 학사·모바일 세션 cleanup 일정은 미등록", active()),
    variable("ACADEMIC_ENABLED", "application", "학사 사용자 기능 공개", false, "학사 정책·테이블·함수 준비 후 true", "정확한 true가 아니면 사용자 학사 기능 차단/준비 안내; cleanup은 독립", active("false")),
    variable("ACADEMIC_SUBMISSION_BLOB_HOST", "application", "학사 제출 전용 Private Blob 호스트", false, "학사 파일 업로드·다운로드·cleanup", "누락·잘못된 private 호스트면 UNAVAILABLE; public 대체 없음", active()),
    variable("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "application", "학사 제출 전용 서버 token", true, "학사 파일 업로드·다운로드·cleanup", "미설정이면 저장소 작업 불가; 공개/보호 자료 token 재사용 금지", active()),
    variable("ACADEMIC_UPLOADS_ENABLED", "application", "학생 PDF 업로드 공개", false, "ACADEMIC_ENABLED와 함께 true; DB·저장소 준비 필요", "정확한 true가 아니면 업로드 DISABLED; cleanup을 자동 제어하지 않음", active("false")),
    variable("ACADEMIC_UPLOAD_CLEANUP_ENABLED", "application", "미완료 제출 파일 cleanup 실행", false, "cleanup 별도 운영 승인·DB/private 저장소 준비", "정확한 true가 아니면 저장소·DB 작업 전 skipped; 사용자 기능 gate와 독립", active("false")),
    variable("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED", "application", "cleanup 실물 삭제 추가 승인", false, "cleanup 활성화와 별도 삭제 승인 후 true", "정확한 true가 아니면 dry-run. true여도 cleanup 실행 gate가 필요", active("false")),
    variable("ACADEMIC_APPROVER_USER_ID", "application", "검증된 학사 운영 책임자 UUID; 값 공개 금지", false, "학사 승인·운영 인가 및 적용 backfill", "누락·유효하지 않은 UUID면 승인자 인가 거부; 홈페이지 ADMIN으로 대체하지 않음", active()),
    variable("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "application", "학적 개인정보 쓰기 별도 승인", false, "#142 보존·파기 정책과 운영 승인 후 true", "정확한 true가 아니면 쓰기 차단; 화면 공개와 별도 조건", active("false")),
    variable("GOOGLE_SHEETS_API_KEY", "legacy", "기존 선택 Sheets helper; 현재 앱 호출 참조 없음", true, "별도 검토 후 외부 시트 helper를 사용하는 경우만", "미설정이면 helper가 빈 결과와 설정 오류 반환. 내장 지원서 관리에 불필요", commented()),
    variable("ADMIN_EMAIL", "operator", "초기 관리자 생성/승격 대상; 값 공개 금지", false, "승인된 seed-admin 명령에서 대상 확인", "없으면 기존 기본 관리자 이메일 사용; 확인 인자 없으면 DB 조회 전 중단", commented()),
    variable("ADMIN_PASSWORD", "operator", "초기 관리자 credentials 비밀번호", true, "승인된 seed-admin 생성/승격 실행", "없으면 중단. 기존 관리자 비밀번호 재설정 수단이 아님", commented()),
    variable("ADMIN_NAME", "operator", "초기 관리자 표시 이름", false, "seed-admin에서 기본 이름을 변경할 때만", "미설정이면 관리자라는 기본 이름", commented()),
    variable("HRA_CONTENT_WRITES_STOPPED", "operator", "콘텐츠 쓰기를 실제 중단했다는 운영 확인", false, "markdown 이미지 cleanup --apply 실행에만 1", "미설정이면 실제 삭제 거부. 이 값 자체가 앱 쓰기를 잠그지 않음", commented()),
    variable("HRA_PSQL_BIN", "operator", "검증한 psql 실행 파일 경로", false, "학적 backfill·rate-limit migration의 psql 위치 변경 시", "미설정이면 PATH의 psql. DB 대상은 DATABASE_URL에서 분리하여 전달", commented("/path/to/postgresql/bin/psql")),
    variable("NODE_ENV", "platform", "Node/Next 실행 모드", false, "실행 도구가 제공", "production일 때 메타데이터 URL의 production fallback 선택; 임의 설정으로 보안 기능을 우회하지 않음"),
    variable("VERCEL", "platform", "Vercel 신뢰 프록시 경계 표시", false, "Vercel 플랫폼에서 제공", "1이면 x-vercel-forwarded-for만 신뢰; 아니면 검증된 일반 프록시 헤더도 순서대로 확인"),
    variable("VERCEL_ENV", "platform", "Vercel 배포 환경 구분(production·preview·development)", false, "Vercel에서 제공하는 경우만", "정확한 production일 때만 운영 canonical·검색 색인 허용; 다른 값이나 미설정이면 noindex와 robots 전체 차단"),
    variable("VERCEL_PROJECT_PRODUCTION_URL", "platform", "Vercel production 도메인 메타데이터 우선값", false, "Vercel에서 제공하는 경우만", "VERCEL_ENV=production에서만 사용; 없으면 고정 운영 주소. Preview에서는 사용하지 않음"),
    variable("VERCEL_URL", "platform", "현재 Vercel 배포 도메인", false, "Vercel에서 제공하는 경우만", "VERCEL_ENV가 production이 아닐 때의 기준 주소; 없으면 NEXT_PUBLIC_APP_URL/localhost"),
    variable("CI", "tooling", "Playwright CI 실행 모드", false, "CI 도구가 제공", "없으면 로컬 설정; 있으면 forbidOnly·재시도·worker 제한 적용"),
    variable("PLAYWRIGHT_BASE_URL", "qa", "Playwright의 합성 검증 앱 주소", false, "외부에서 준비한 검증 서버를 사용할 때", "미설정이면 로컬 webServer 준비와 기본 localhost 사용"),
    variable("HRA_PUBLIC_E2E_ORIGIN", "qa", "확장 공개 브라우저의 허용 원점", false, "격리 공개 실행기가 생성한 숫자 루프백 HTTP 원점", "미설정이면 일반 Playwright 동작; 확장 실행기는 반드시 자체 앱 주소를 전달"),
    variable("HRA_PUBLIC_E2E_LIST", "qa", "확장 공개 reporter의 수집 전용 구분", false, "격리 실행기의 --list 단계에서만 true", "true가 아니면 필수 24개 사례의 실제 완료까지 검증"),
    variable("GITHUB_EVENT_PATH", "tooling", "GitHub event JSON 파일 경로", false, "process-format --event를 GitHub runner에서 실행", "runner가 제공하지 않으면 event 모드 읽기 실패"),
    variable("GITHUB_REPOSITORY", "tooling", "형식 검사 대상 저장소 이름", false, "GitHub runner 또는 명시한 대상", "미설정이면 gh repo view로 저장소 조회"),
    variable("GITHUB_STEP_SUMMARY", "tooling", "Actions가 제공하는 단계별 Markdown 요약 파일", false, "운영 smoke 또는 명시적 합성 알림 경로의 요약 작성", "없으면 정제 JSON과 종료 코드만 제공; 이메일 수신을 의미하지 않음"),
    variable("RELEASE_PLEASE_BOT_LOGIN", "tooling", "정확한 릴리스 PR 작성자 login", false, "별도 릴리스 token 작성자를 사용할 때", "미설정이면 github-actions[bot]. 이름에 bot이 있다는 이유만으로 면제하지 않음"),
    variable("PGPORT", "qa", "격리 실행기가 생성한 로컬 PG 소켓 포트", false, "QA preload에서만 전달", "없거나 격리 scope와 다르면 QA 연결 실패; 운영 앱 설정 아님"),
    variable("HRA_TEST_PG_BIN", "qa", "격리 테스트 PostgreSQL 실행 파일 디렉터리", false, "로컬 PG 기반 회귀 검사", "미설정 시 실행기/테스트별 실패·skip 가능; 통과로 간주하지 않음", commented("/path/to/postgresql/bin")),
    variable("HRA_QA_CHROME", "qa", "Markdown 경계 브라우저 검증에 사용할 Chrome 실행 파일 경로", false, "전용 Markdown 브라우저 검증에서 설치한 Chrome 위치가 기본값과 다를 때", "미설정이면 /usr/bin/google-chrome 사용; 지정 경로를 신뢰할 수 없거나 실행할 수 없으면 검증 실패"),
    variable("HRA_TEST_DATABASE_URL", "qa", "OAuth binding 검증 전용 DB", true, "전용 검증 스크립트 실행", "없거나 운영 DB 대상과 같으면 검증 중단"),
    variable("HRA_QA_PRIVATE_BLOB_URL", "qa", "승인된 합성 보호 자료의 private QA URL", false, "실제 공급자 resource QA 실행", "미설정·허용 호스트 불일치 시 검증 중단; 실제 자료 URL 공개 금지"),
    variable("HRA_QA_PRIVATE_BLOB_SHA256", "qa", "합성 QA PDF의 선택 기준 해시", false, "알려진 QA PDF 해시를 명시할 때", "없으면 내장 합성 PDF 기준 사용; 다르면 중단"),
    variable("HRA_QA_SUBMISSION_STORAGE_KEY", "qa", "이번 승인 QA 제출 객체의 키", false, "제출 파일 공급자 검증 실행", "전용 QA 조건을 충족하지 않으면 중단; 실제 사용자 객체 키 공개 금지"),
    variable("HRA_ACADEMIC_QA_PRIVATE_STORE_CONFIRMED", "qa", "승인한 QA namespace·격리 원장 사용 확인", false, "실제 private 공급자 업로드 QA에서 true", "true가 아니면 중단; 물리 저장소 분리 완료를 뜻하지 않음"),
    variable("HRA_ACADEMIC_QA_CALLBACK_URL", "qa", "격리 앱에 연결되는 QA callback 터널", false, "실제 공급자 callback 전달을 검증할 때", "없으면 .invalid 주소로 callback 유실 후 verify 복구만 검사"),
    variable("HRA_ACADEMIC_QA_STATE", "qa", "합성 QA 로그인 상태 파일", true, "전용 academic admin/roster 브라우저 검사", "없으면 해당 QA 시나리오를 실행하지 않음; 실행·skip을 구분"),
    variable("HRA_ACADEMIC_QA_COHORT_ID", "qa", "합성 QA 기수 ID", false, "전용 admin/roster 검사", "없으면 해당 시나리오 준비 불가; 운영 기수 사용 금지"),
    variable("HRA_ACADEMIC_QA_EVENT_ID", "qa", "합성 QA 학사 이벤트 ID", false, "전용 과제 관리자 검사", "없으면 해당 QA 시나리오 준비 불가"),
    variable("HRA_ACADEMIC_QA_SESSION_ID", "qa", "합성 QA 수업 ID", false, "전용 과제 관리자 검사", "없으면 해당 QA 시나리오 준비 불가"),
    variable("HRA_ACADEMIC_UI_QA", "qa", "학생 화면 격리 QA 시나리오", false, "전용 학생 UI 실행기가 true로 전달", "true가 아니면 학생 UI QA skip; 통과 증거 아님"),
    variable("HRA_ACADEMIC_UI_PROVIDER_QA", "qa", "실제 공급자 학생 UI QA 모드", false, "승인된 전용 provider QA 실행", "true가 아니면 로컬 합성 저장소 모드; 공급자 검증과 구분"),
    variable("HRA_ACADEMIC_UI_EMAIL", "qa", "이번 실행의 합성 학생 이메일", false, "전용 학생 UI 로그인", "없으면 합성 계정 로그인 불가; 실제 계정 사용 금지"),
    variable("HRA_ACADEMIC_UI_PASSWORD", "qa", "이번 실행의 합성 학생 비밀번호", true, "전용 학생 UI 로그인", "없으면 합성 계정 로그인 불가; 운영 비밀번호 재사용 금지"),
    variable("HRA_ACADEMIC_UI_MANIFEST_PATH", "qa", "이번 학생 UI 실행의 합성 fixture 목록 경로", false, "전용 학생 UI 실행기", "없으면 상태·대상 복구 정보 확인 불가"),
    variable("HRA_ACADEMIC_UI_OPEN_ID", "qa", "합성 열린 과제 ID", false, "학생 UI 기본·마감 시나리오", "없으면 해당 합성 과제 검사 불가"),
    variable("HRA_ACADEMIC_UI_UPLOAD_ID", "qa", "합성 공급자 업로드 과제 ID", false, "공급자 학생 UI QA", "없으면 공급자 업로드 검사 불가"),
    variable("HRA_ACADEMIC_UI_REPLACEMENT_ID", "qa", "합성 교체 제출 과제 ID", false, "공급자 교체 제출 QA", "없으면 교체 검사 불가"),
    variable("HRA_G1_APP_ORIGIN", "qa", "G1 격리 앱 origin", false, "G1 실행기가 생성", "없거나 준비되지 않으면 G1 네트워크 검증 불가"),
    variable("HRA_G1_STORE_ORIGIN", "qa", "G1 로컬 private 저장소 origin", false, "G1 실행기가 생성", "없거나 준비되지 않으면 로컬 저장소 검증 불가; 운영 저장소 사용 금지"),
    variable("HRA_RESOURCE_QA_ROOT", "qa", "이번 격리 PG fixture 디렉터리", false, "QA preload·transport 실행기", "없거나 scope 파일과 다르면 격리 DB 연결 거부"),
    variable("HRA_SITE_ROUTE_ORIGIN", "qa", "사이트 route 검사 전용 앱 origin", false, "site-route 실행기가 생성", "없으면 QA 전용 AUTH_URL fallback; 둘 다 없으면 실패"),
    ...["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"].map((name) => variable(name, "system", "격리 자식 프로세스에 허용한 시스템 실행 값", false, "해당 OS/프로그램에서 필요할 때만 전달", "미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님")),
  ],
  dynamicAccess: [
  {
    "path": "tests/support/csp-browser.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"].filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "CSP 합성 Chromium 프로세스에 기존 여섯 시스템 값만 전달; 세션·운영 자격정보는 환경으로 전달하지 않음",
    "names": ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  },
  {
    "path": "scripts/measure-authentication.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"].filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "인증 비용 측정기의 여섯 시스템 값만 별도 합성 DB·서버 자식 환경으로 복사",
    "names": ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  },
  {
    "path": "scripts/backfill-academic-enrollments.mjs",
    "expression": "pgEnvironment = {\n    // PGHOSTADDR·PGSERVICE 등 상속 접속 옵션이 확인한 DB 대상을 바꾸지 못하게 합니다.\n    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith(\"PG\"))),\n    PGHOST: target.hostname,\n    PGPORT: target.port || \"5432\",\n    PGUSER: decodeURIComponent(target.username),\n    PGPASSWORD: decodeURIComponent(target.password),\n    PGDATABASE: decodeURIComponent(target.pathname.slice(1)),\n    PGSSLMODE: target.searchParams.get(\"sslmode\") || \"require\",\n    PGCHANNELBINDING: target.searchParams.get(\"channel_binding\") || \"prefer\",\n    PGCONNECT_TIMEOUT: \"10\",\n    PGOPTIONS: \"-c statement_timeout=30000 -c lock_timeout=10000 -c standard_conforming_strings=on\",\n  }",
    "reason": "기존 PG 접속 상속값을 제외한 뒤 확인한 접속 필드를 생성하는 운영 명령",
    "names": []
  },
  {
    "path": "scripts/migrate-rate-limit-reservations.mjs",
    "expression": "pgEnvironment = {\n  ...Object.fromEntries([\"PATH\", \"HOME\", \"SYSTEMROOT\", \"TMPDIR\", \"TMP\", \"TEMP\"].filter(key => process.env[key]).map(key => [key, process.env[key]])),\n  LC_ALL: \"C\",\n  PGHOST: host,\n  PGPORT: port,\n  PGUSER: user,\n  PGPASSWORD: password,\n  PGDATABASE: database,\n  PGSSLMODE: sslmode,\n  PGCHANNELBINDING: channelBinding,\n  PGCONNECT_TIMEOUT: \"10\",\n  PGGSSENCMODE: \"disable\",\n  PGOPTIONS: \"-c statement_timeout=60000 -c lock_timeout=5000 -c standard_conforming_strings=on\",\n}",
    "reason": "검증한 URL의 접속 필드와 고정 제한만 psql 자식 환경에 전달해 부모 PG*·DATABASE_URL·NODE_OPTIONS 상속을 차단하는 운영 명령",
    "names": ["PATH", "HOME", "SYSTEMROOT", "TMPDIR", "TMP", "TEMP"]
  },
  {
    "path": "scripts/verify-academic-assignment-admin-http.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-academic-g1.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n  .filter((name) => process.env[name]).map((name) => [name, process.env[name]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-academic-private-upload-http.mjs",
    "expression": "Object.fromEntries([\"PATH\",\"HOME\",\"TMPDIR\",\"TMP\",\"TEMP\",\"SYSTEMROOT\"].filter(key=>process.env[key]).map(key=>[key,process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-academic-roster-http.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-academic-student-ui.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"].filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-academic-submission-file-http.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-resource-access-http.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-site-routes.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n  .filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "scripts/verify-auth-proxy-http.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter((name) => process.env[name]).map((name) => [name, process.env[name]]))",
    "reason": "Proxy HTTP 격리 실행기의 기존 여섯 시스템 값만 새 자식 환경으로 복사",
    "names": ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  },
  {
    "path": "scripts/verify-markdown-boundary.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "Markdown 경계 검증 실행기의 기존 여섯 시스템 값만 새 자식 환경으로 복사; 작업 디렉터리의 .env 파일 로딩까지 차단한다는 뜻은 아님",
    "names": ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  },
  {
    "path": "tests/support/qa-schema-export.mjs",
    "expression": "Object.fromEntries([\"PATH\", \"HOME\", \"TMPDIR\", \"TMP\", \"TEMP\", \"SYSTEMROOT\"]\n    .filter(key => process.env[key]).map(key => [key, process.env[key]]))",
    "reason": "기존 여섯 시스템 값만 새 격리 자식 환경으로 복사",
    "names": [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT"
    ]
  },
  {
    "path": "tests/support/resource-qa-preload.mjs",
    "expression": "createPsqlTransport(process.env)",
    "reason": "검증된 격리 PG 설정을 받는 기존 QA 어댑터 진입점; 일반 별칭 허용이 아님",
    "names": []
  },
  {
    "path": "tests/e2e/academic-g1.spec.mts",
    "expression": "academicG1Sql(process.env)",
    "reason": "검증된 격리 PG 설정을 받는 기존 QA 어댑터 진입점; 일반 별칭 허용이 아님",
    "names": []
  }
],
};
