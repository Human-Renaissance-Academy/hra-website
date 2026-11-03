# 환경변수 계약 목록

> 생성 정본: `scripts/_lib/environment-inventory.mjs`. 직접 수정하지 말고 `node scripts/check-environment-contract.mjs --write-reference`로 갱신합니다.

이 문서는 #282의 저장소 정적 계약입니다. 실제 Vercel·Neon·Blob 설정이나 환경 분리 완료를 증명하지 않습니다. 배포 절차는 [배포 안내](../DEPLOYMENT.md)를 따릅니다.

Production·Preview·Development는 DB·공개/비공개 Blob·OAuth·세션 비밀값을 서로 공유하지 않습니다. Preview에서 Production 값을 상속하지 않으며, 필요한 격리 자원이 없으면 기능을 끄거나 검증을 중단합니다. 이는 적용할 정책이며 실제 연결을 자동 검증했다는 뜻은 아닙니다.

## 동작을 해석할 때

- 보호 자료는 `RESOURCE_PRIVATE_BLOB_ENABLED`가 true가 아니면 기존 공개 저장소를 선택합니다. true인 상태에서 private 호스트·토큰이 없거나 잘못되면 업로드를 거부하고 공개 저장소로 되돌리지 않습니다. 기존 공개 파일 이전은 별도 #268입니다.
- 학사 제출은 항상 명시한 Private Blob만 사용합니다. 업로드는 학사·업로드 gate가 모두 true여야 합니다. 정리는 사용자 기능과 독립된 cleanup gate로 실행하며 실제 삭제에는 별도 delete gate가 필요합니다. 기본은 비활성·dry-run입니다.
- 사이트 메타데이터 주소는 VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL → production 고정 주소 → 개발 NEXT_PUBLIC_APP_URL/localhost 순서입니다. NEXT_PUBLIC_APP_URL을 바꿔도 production 주소의 우선순위를 덮지 않습니다.
- `vercel.json`의 유일한 일정은 `/api/cron/cleanup-rate-limits`, `0 3 * * *` (03:00 UTC/12:00 KST)입니다. 두 cleanup API는 CRON_SECRET 누락 시 503, 인증 실패 시 401입니다. 학사 cleanup 예약은 승인 전 자동 등록하지 않습니다.
- 웹 OAuth callback은 환경별 `/api/auth/callback/google`·`/api/auth/callback/kakao`입니다. 향후 Mobile deep link·토큰 세션은 별도 설계이며 현재 웹 callback 설정이 모바일 인증 구현을 뜻하지 않습니다.
- 인증 URL 선택은 위 metadataBase 주소 선택과 별도입니다. Auth.js는 AUTH_URL ?? NEXTAUTH_URL로 origin/basePath를 선택합니다. canonical 값의 빈 문자열도 nullish가 아니므로 호환 별칭을 막습니다. 새 설정은 AUTH_URL·AUTH_SECRET을 사용하며 NEXTAUTH_URL·NEXTAUTH_SECRET은 기존 호환 입력으로 구분합니다.
- Auth.js의 trustHost 기본값은 !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production')입니다. 먼저 선택된 비어 있지 않은 문자열은 false라는 문자열도 true이며, 먼저 선택된 빈 문자열은 false입니다. 미설정과 빈 문자열은 다르므로 예시를 임의로 false 문자열로 채우지 않습니다.
- Auth.js의 redirect proxy·secret rotation이나 Blob의 OIDC/store ID 등 모든 SDK 옵션을 지원하거나 열거하는 계약은 아닙니다. 새 옵션을 도입하려면 목록·문서·검증을 함께 변경합니다. 공급자 내부의 임의 환경변수까지 정적으로 전수 검사했다고 주장하지 않습니다.
- 저장소는 `.nvmrc`와 `package.json`에 Node 24를 지정하며 앱 CI는 `.nvmrc`를 읽습니다. 앱 CI의 checkout/setup-node Action은 SHA로 고정하고 작업에는 저장소 읽기 권한만 부여합니다. 이는 저장소 설정의 확인이며 실제 Vercel 실행 버전이나 배포 성공을 증명하지 않습니다.
- `scripts/verify-auth-proxy-http.mjs`와 `scripts/verify-markdown-boundary.mjs`의 여섯 시스템 값 복사는 각각 파일 경로와 전체 식이 일치할 때만 예외로 허용합니다. 새 키·동적 접근은 계약 검사에서 거부합니다. 이 정적 검사는 QA 실행기의 런타임 격리나 작업 디렉터리의 `.env` 파일 부재까지 증명하지 않습니다.

## 앱 설정

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `ACADEMIC_APPROVER_USER_ID` | 검증된 학사 운영 책임자 UUID; 값 공개 금지 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 학사 승인·운영 인가 및 적용 backfill | 누락·유효하지 않은 UUID면 승인자 인가 거부; 홈페이지 ADMIN으로 대체하지 않음 | 앱 예시 |
| `ACADEMIC_ENABLED` | 학사 사용자 기능 공개 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 학사 정책·테이블·함수 준비 후 true | 정확한 true가 아니면 사용자 학사 기능 차단/준비 안내; cleanup은 독립 | 앱 예시 |
| `ACADEMIC_ENROLLMENT_WRITES_ENABLED` | 학적 개인정보 쓰기 별도 승인 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | #142 보존·파기 정책과 운영 승인 후 true | 정확한 true가 아니면 쓰기 차단; 화면 공개와 별도 조건 | 앱 예시 |
| `ACADEMIC_SUBMISSION_BLOB_HOST` | 학사 제출 전용 Private Blob 호스트 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 학사 파일 업로드·다운로드·cleanup | 누락·잘못된 private 호스트면 UNAVAILABLE; public 대체 없음 | 앱 예시 |
| `ACADEMIC_SUBMISSION_READ_WRITE_TOKEN` | 학사 제출 전용 서버 token | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 학사 파일 업로드·다운로드·cleanup | 미설정이면 저장소 작업 불가; 공개/보호 자료 token 재사용 금지 | 앱 예시 |
| `ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED` | cleanup 실물 삭제 추가 승인 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | cleanup 활성화와 별도 삭제 승인 후 true | 정확한 true가 아니면 dry-run. true여도 cleanup 실행 gate가 필요 | 앱 예시 |
| `ACADEMIC_UPLOAD_CLEANUP_ENABLED` | 미완료 제출 파일 cleanup 실행 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | cleanup 별도 운영 승인·DB/private 저장소 준비 | 정확한 true가 아니면 저장소·DB 작업 전 skipped; 사용자 기능 gate와 독립 | 앱 예시 |
| `ACADEMIC_UPLOADS_ENABLED` | 학생 PDF 업로드 공개 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | ACADEMIC_ENABLED와 함께 true; DB·저장소 준비 필요 | 정확한 true가 아니면 업로드 DISABLED; cleanup을 자동 제어하지 않음 | 앱 예시 |
| `AUTH_GOOGLE_ID` | Google OAuth client ID | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | Google 로그인을 제공할 때 secret과 함께 | ID·secret 중 하나라도 없으면 Google 제공자·버튼 비활성 | 앱 예시 |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | Google 로그인을 제공할 때 ID와 함께 | ID·secret 중 하나라도 없으면 Google 제공자·버튼 비활성 | 앱 예시 |
| `AUTH_KAKAO_EMAIL_SCOPE` | 승인한 Kakao 이메일 동의 요청 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 제공자 콘솔·계정 연결 정책 확인 후 true | 정확한 true가 아니면 이메일 동의를 추가 요청하지 않음 | 앱 예시 |
| `AUTH_KAKAO_ID` | Kakao OAuth REST client ID | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | Kakao 로그인을 제공할 때 secret과 함께 | ID·secret 중 하나라도 없으면 Kakao 제공자·버튼 비활성 | 앱 예시 |
| `AUTH_KAKAO_SECRET` | Kakao OAuth client secret | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | Kakao 로그인을 제공할 때 ID와 함께 | ID·secret 중 하나라도 없으면 Kakao 제공자·버튼 비활성 | 앱 예시 |
| `CRON_SECRET` | cleanup API Bearer 인증 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 승인된 환경의 예약/수동 cleanup 호출 | 두 cleanup API에서 누락 503, 인증 실패 401; 학사 cleanup 일정은 미등록 | 앱 예시 |
| `DATABASE_URL` | Neon DB 접속 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | DB 기능·상태 점검·DB 운영 명령 | 미설정 시 DB 호출 오류, health 503. 앱은 Neon HTTP 드라이버이며 일반 로컬 PG URL로 대체하지 않음 | 앱 예시 |
| `HEALTH_CHECK_SECRET` | health 상세 응답 인증 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 허용한 운영자가 상세 상태를 조회할 때만 | 없으면 상세 정보 숨김; 기본 DB 점검과 HTTP 200/503은 수행 | 앱 예시 |
| `NEXT_PUBLIC_APP_URL` | 개발 메타데이터 URL fallback; 비밀값 금지 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | Vercel URL이 없는 개발 환경에서 주소 변경 시 | Vercel production URL·배포 URL 우선; production은 고정 주소, 개발 기본 localhost | 앱 예시 |
| `RESOURCE_PRIVATE_BLOB_ENABLED` | 새 보호 자료의 private 쓰기 전환 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 저장소 준비와 기존 파일 이전 검토 후 true | 정확한 true가 아니면 기존 public 쓰기 저장소 선택; 기존 공개 파일 보호 완료를 뜻하지 않음 | 앱 예시 |
| `RESOURCE_PRIVATE_BLOB_HOST` | 보호 자료 전용 Private Blob 호스트 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 보호 자료 private 모드·private 파일 읽기/이전 | private 모드에서 누락·잘못된 private 호스트면 오류; 공개 fallback 없음 | 앱 예시 |
| `RESOURCE_PRIVATE_READ_WRITE_TOKEN` | 보호 자료 전용 서버 token | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 보호 자료 private 업로드·읽기·정리 | private token 누락 시 해당 작업을 거부 | 앱 예시 |

## 명시적으로 지원하는 SDK 설정

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `AUTH_SECRET` | Auth.js 세션 보호 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 실제 로그인·세션 검증 | 명시 config secret이 없으면 AUTH_SECRET ?? NEXTAUTH_SECRET. 빈 AUTH_SECRET은 호환 별칭도 막음; 지원 secret 누락 시 production 인증 오류 | 앱 예시 |
| `AUTH_TRUST_HOST` | Auth.js의 호스트 신뢰 입력 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 신뢰하는 프록시·호스팅의 Host 정책을 검토한 경우만 | 명시 config가 없으면 !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== 'production'). 먼저 선택된 빈 문자열은 false, false 문자열은 true; 임의 활성화 금지 | 주석 예시·실행 시에만 지정 |
| `AUTH_URL` | Auth.js 요청 origin 및 기본 인증 경로 override | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 승인한 프록시·고정 origin 구성이 필요할 때만; QA preload도 사용 | 미설정이면 NEXTAUTH_URL. 둘 다 미설정이면 요청 기반 URL; 명시한 빈 문자열은 별칭을 건너뜀. 잘못된 URL은 인증 오류 가능 | 주석 예시·실행 시에만 지정 |
| `BLOB_READ_WRITE_TOKEN` | 공개 콘텐츠 Blob의 서버 인증 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 공개 업로드·공개 원본 조회/삭제 운영 명령 | 앱의 토큰 없는 SDK 호출이 읽음. 지원 계약은 별도 public 저장소 token이며 private token으로 대체하지 않음 | 앱 예시 |

## 기존 선택 코드

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `GOOGLE_SHEETS_API_KEY` | 기존 선택 Sheets helper; 현재 앱 호출 참조 없음 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 별도 검토 후 외부 시트 helper를 사용하는 경우만 | 미설정이면 helper가 빈 결과와 설정 오류 반환. 내장 지원서 관리에 불필요 | 주석 예시·실행 시에만 지정 |
| `NEXTAUTH_SECRET` | Auth.js 기존 세션 secret 호환 별칭 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 기존 배포 설정을 canonical AUTH_SECRET으로 전환 검토할 때만 | AUTH_SECRET이 nullish일 때만 사용. 빈 AUTH_SECRET은 별칭을 막음; 지원 secret 누락 시 production 인증 오류 | 앱 예시에 넣지 않음 |
| `NEXTAUTH_URL` | Auth.js 기존 URL 호환 별칭 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 기존 배포 설정을 canonical AUTH_URL로 전환 검토할 때만 | AUTH_URL이 nullish일 때만 사용. 빈 AUTH_URL은 별칭을 막음; 둘 다 미설정이면 요청 기반 URL | 앱 예시에 넣지 않음 |

## 일회성 운영 명령

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `ADMIN_EMAIL` | 초기 관리자 생성/승격 대상; 값 공개 금지 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 승인된 seed-admin 명령에서 대상 확인 | 없으면 기존 기본 관리자 이메일 사용; 확인 인자 없으면 DB 조회 전 중단 | 주석 예시·실행 시에만 지정 |
| `ADMIN_NAME` | 초기 관리자 표시 이름 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | seed-admin에서 기본 이름을 변경할 때만 | 미설정이면 관리자라는 기본 이름 | 주석 예시·실행 시에만 지정 |
| `ADMIN_PASSWORD` | 초기 관리자 credentials 비밀번호 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 예 | 승인된 seed-admin 생성/승격 실행 | 없으면 중단. 기존 관리자 비밀번호 재설정 수단이 아님 | 주석 예시·실행 시에만 지정 |
| `HRA_CONTENT_WRITES_STOPPED` | 콘텐츠 쓰기를 실제 중단했다는 운영 확인 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | markdown 이미지 cleanup --apply 실행에만 1 | 미설정이면 실제 삭제 거부. 이 값 자체가 앱 쓰기를 잠그지 않음 | 주석 예시·실행 시에만 지정 |
| `HRA_PSQL_BIN` | 검증한 psql 실행 파일 경로 | Development / Preview / Production; 환경별 독립 설정; Preview에 Production 자격정보·연결 상속 금지 | 아니요 | 학적 backfill·rate-limit migration의 psql 위치 변경 시 | 미설정이면 PATH의 psql. DB 대상은 DATABASE_URL에서 분리하여 전달 | 주석 예시·실행 시에만 지정 |

## 플랫폼 제공 값

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Node/Next 실행 모드 | Development / Preview / Production; 플랫폼이 해당 실행에 제공; 직접 복제하지 않음 | 아니요 | 실행 도구가 제공 | production일 때 메타데이터 URL의 production fallback 선택; 임의 설정으로 보안 기능을 우회하지 않음 | 앱 예시에 넣지 않음 |
| `VERCEL` | Vercel 신뢰 프록시 경계 표시 | Development / Preview / Production; 플랫폼이 해당 실행에 제공; 직접 복제하지 않음 | 아니요 | Vercel 플랫폼에서 제공 | 1이면 x-vercel-forwarded-for만 신뢰; 아니면 검증된 일반 프록시 헤더도 순서대로 확인 | 앱 예시에 넣지 않음 |
| `VERCEL_PROJECT_PRODUCTION_URL` | Vercel production 도메인 메타데이터 우선값 | Development / Preview / Production; 플랫폼이 해당 실행에 제공; 직접 복제하지 않음 | 아니요 | Vercel에서 제공하는 경우만 | 없으면 VERCEL_URL, 그다음 실행 모드별 fallback | 앱 예시에 넣지 않음 |
| `VERCEL_URL` | 현재 Vercel 배포 도메인 | Development / Preview / Production; 플랫폼이 해당 실행에 제공; 직접 복제하지 않음 | 아니요 | Vercel에서 제공하는 경우만 | production URL보다 낮은 우선순위; 없으면 실행 모드별 fallback | 앱 예시에 넣지 않음 |

## 격리 QA 입력

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `HRA_ACADEMIC_QA_CALLBACK_URL` | 격리 앱에 연결되는 QA callback 터널 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 실제 공급자 callback 전달을 검증할 때 | 없으면 .invalid 주소로 callback 유실 후 verify 복구만 검사 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_QA_COHORT_ID` | 합성 QA 기수 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 admin/roster 검사 | 없으면 해당 시나리오 준비 불가; 운영 기수 사용 금지 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_QA_EVENT_ID` | 합성 QA 학사 이벤트 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 과제 관리자 검사 | 없으면 해당 QA 시나리오 준비 불가 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_QA_PRIVATE_STORE_CONFIRMED` | 승인한 QA namespace·격리 원장 사용 확인 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 실제 private 공급자 업로드 QA에서 true | true가 아니면 중단; 물리 저장소 분리 완료를 뜻하지 않음 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_QA_SESSION_ID` | 합성 QA 수업 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 과제 관리자 검사 | 없으면 해당 QA 시나리오 준비 불가 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_QA_STATE` | 합성 QA 로그인 상태 파일 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 예 | 전용 academic admin/roster 브라우저 검사 | 없으면 해당 QA 시나리오를 실행하지 않음; 실행·skip을 구분 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_EMAIL` | 이번 실행의 합성 학생 이메일 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 학생 UI 로그인 | 없으면 합성 계정 로그인 불가; 실제 계정 사용 금지 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_MANIFEST_PATH` | 이번 학생 UI 실행의 합성 fixture 목록 경로 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 학생 UI 실행기 | 없으면 상태·대상 복구 정보 확인 불가 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_OPEN_ID` | 합성 열린 과제 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 학생 UI 기본·마감 시나리오 | 없으면 해당 합성 과제 검사 불가 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_PASSWORD` | 이번 실행의 합성 학생 비밀번호 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 예 | 전용 학생 UI 로그인 | 없으면 합성 계정 로그인 불가; 운영 비밀번호 재사용 금지 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_PROVIDER_QA` | 실제 공급자 학생 UI QA 모드 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 승인된 전용 provider QA 실행 | true가 아니면 로컬 합성 저장소 모드; 공급자 검증과 구분 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_QA` | 학생 화면 격리 QA 시나리오 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 학생 UI 실행기가 true로 전달 | true가 아니면 학생 UI QA skip; 통과 증거 아님 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_REPLACEMENT_ID` | 합성 교체 제출 과제 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 공급자 교체 제출 QA | 없으면 교체 검사 불가 | 앱 예시에 넣지 않음 |
| `HRA_ACADEMIC_UI_UPLOAD_ID` | 합성 공급자 업로드 과제 ID | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 공급자 학생 UI QA | 없으면 공급자 업로드 검사 불가 | 앱 예시에 넣지 않음 |
| `HRA_G1_APP_ORIGIN` | G1 격리 앱 origin | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | G1 실행기가 생성 | 없거나 준비되지 않으면 G1 네트워크 검증 불가 | 앱 예시에 넣지 않음 |
| `HRA_G1_STORE_ORIGIN` | G1 로컬 private 저장소 origin | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | G1 실행기가 생성 | 없거나 준비되지 않으면 로컬 저장소 검증 불가; 운영 저장소 사용 금지 | 앱 예시에 넣지 않음 |
| `HRA_PUBLIC_E2E_LIST` | 확장 공개 reporter의 수집 전용 구분 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 격리 실행기의 --list 단계에서만 true | true가 아니면 필수 14개 사례의 실제 완료까지 검증 | 앱 예시에 넣지 않음 |
| `HRA_PUBLIC_E2E_ORIGIN` | 확장 공개 브라우저의 허용 원점 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 격리 공개 실행기가 생성한 숫자 루프백 HTTP 원점 | 미설정이면 일반 Playwright 동작; 확장 실행기는 반드시 자체 앱 주소를 전달 | 앱 예시에 넣지 않음 |
| `HRA_QA_CHROME` | Markdown 경계 브라우저 검증에 사용할 Chrome 실행 파일 경로 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 전용 Markdown 브라우저 검증에서 설치한 Chrome 위치가 기본값과 다를 때 | 미설정이면 /usr/bin/google-chrome 사용; 지정 경로를 신뢰할 수 없거나 실행할 수 없으면 검증 실패 | 앱 예시에 넣지 않음 |
| `HRA_QA_PRIVATE_BLOB_SHA256` | 합성 QA PDF의 선택 기준 해시 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 알려진 QA PDF 해시를 명시할 때 | 없으면 내장 합성 PDF 기준 사용; 다르면 중단 | 앱 예시에 넣지 않음 |
| `HRA_QA_PRIVATE_BLOB_URL` | 승인된 합성 보호 자료의 private QA URL | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 실제 공급자 resource QA 실행 | 미설정·허용 호스트 불일치 시 검증 중단; 실제 자료 URL 공개 금지 | 앱 예시에 넣지 않음 |
| `HRA_QA_SUBMISSION_STORAGE_KEY` | 이번 승인 QA 제출 객체의 키 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 제출 파일 공급자 검증 실행 | 전용 QA 조건을 충족하지 않으면 중단; 실제 사용자 객체 키 공개 금지 | 앱 예시에 넣지 않음 |
| `HRA_RESOURCE_QA_ROOT` | 이번 격리 PG fixture 디렉터리 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | QA preload·transport 실행기 | 없거나 scope 파일과 다르면 격리 DB 연결 거부 | 앱 예시에 넣지 않음 |
| `HRA_SITE_ROUTE_ORIGIN` | 사이트 route 검사 전용 앱 origin | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | site-route 실행기가 생성 | 없으면 QA 전용 AUTH_URL fallback; 둘 다 없으면 실패 | 앱 예시에 넣지 않음 |
| `HRA_TEST_DATABASE_URL` | OAuth binding 검증 전용 DB | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 예 | 전용 검증 스크립트 실행 | 없거나 운영 DB 대상과 같으면 검증 중단 | 앱 예시에 넣지 않음 |
| `HRA_TEST_PG_BIN` | 격리 테스트 PostgreSQL 실행 파일 디렉터리 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 로컬 PG 기반 회귀 검사 | 미설정 시 실행기/테스트별 실패·skip 가능; 통과로 간주하지 않음 | 주석 예시·실행 시에만 지정 |
| `PGPORT` | 격리 실행기가 생성한 로컬 PG 소켓 포트 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | QA preload에서만 전달 | 없거나 격리 scope와 다르면 QA 연결 실패; 운영 앱 설정 아님 | 앱 예시에 넣지 않음 |
| `PLAYWRIGHT_BASE_URL` | Playwright의 합성 검증 앱 주소 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 외부에서 준비한 검증 서버를 사용할 때 | 미설정이면 로컬 webServer 준비와 기본 localhost 사용 | 앱 예시에 넣지 않음 |

## 개발·CI 도구

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `CI` | Playwright CI 실행 모드 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | CI 도구가 제공 | 없으면 로컬 설정; 있으면 forbidOnly·재시도·worker 제한 적용 | 앱 예시에 넣지 않음 |
| `GITHUB_EVENT_PATH` | GitHub event JSON 파일 경로 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | process-format --event를 GitHub runner에서 실행 | runner가 제공하지 않으면 event 모드 읽기 실패 | 앱 예시에 넣지 않음 |
| `GITHUB_REPOSITORY` | 형식 검사 대상 저장소 이름 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | GitHub runner 또는 명시한 대상 | 미설정이면 gh repo view로 저장소 조회 | 앱 예시에 넣지 않음 |
| `GITHUB_STEP_SUMMARY` | Actions가 제공하는 단계별 Markdown 요약 파일 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 운영 smoke 또는 명시적 합성 알림 경로의 요약 작성 | 없으면 정제 JSON과 종료 코드만 제공; 이메일 수신을 의미하지 않음 | 앱 예시에 넣지 않음 |
| `RELEASE_PLEASE_BOT_LOGIN` | 정확한 릴리스 PR 작성자 login | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 별도 릴리스 token 작성자를 사용할 때 | 미설정이면 github-actions[bot]. 이름에 bot이 있다는 이유만으로 면제하지 않음 | 앱 예시에 넣지 않음 |

## 허용한 시스템 전달 값

| 이름 | 목적 | 적용 환경·격리 | 비밀값 | 필수 조건 | 기본·누락 동작 | 예시 |
| --- | --- | --- | --- | --- | --- | --- |
| `HOME` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |
| `PATH` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |
| `SYSTEMROOT` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |
| `TEMP` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |
| `TMP` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |
| `TMPDIR` | 격리 자식 프로세스에 허용한 시스템 실행 값 | Development 합성 검증 / CI 격리 실행; 합성 계정·격리 DB; 공급자 QA는 승인한 전용 namespace·원장만 | 아니요 | 해당 OS/프로그램에서 필요할 때만 전달 | 미설정 값은 복사하지 않음; 앱 자격정보 상속을 허용하는 목록이 아님 | 앱 예시에 넣지 않음 |

## 동적 접근의 제한된 예외

전체 환경 전달은 일반 허용하지 않습니다. 아래 경로의 정확한 토큰 구조만 예외로 검사하며, 공백·주석 외의 변경은 재검토합니다. 이는 범용 데이터 흐름 분석기가 아닙니다. 환경 객체를 받는 기존 QA 어댑터의 libpq 값은 격리 실행기가 만드는 내부 입력이며 운영 환경변수로 승격하지 않습니다.

| 경로 | 검토한 이유 | 수집할 이름 |
| --- | --- | --- |
| `tests/support/csp-browser.mjs` | CSP 합성 Chromium 프로세스에 기존 여섯 시스템 값만 전달; 세션·운영 자격정보는 환경으로 전달하지 않음 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/measure-authentication.mjs` | 인증 비용 측정기의 여섯 시스템 값만 별도 합성 DB·서버 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/backfill-academic-enrollments.mjs` | 기존 PG 접속 상속값을 제외한 뒤 확인한 접속 필드를 생성하는 운영 명령 | 새 설정 이름을 만들지 않는 전달 |
| `scripts/migrate-rate-limit-reservations.mjs` | 검증한 URL의 접속 필드와 고정 제한만 psql 자식 환경에 전달해 부모 PG*·DATABASE_URL·NODE_OPTIONS 상속을 차단하는 운영 명령 | `PATH`, `HOME`, `SYSTEMROOT`, `TMPDIR`, `TMP`, `TEMP` |
| `scripts/verify-academic-assignment-admin-http.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-academic-g1.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-academic-private-upload-http.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-academic-roster-http.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-academic-student-ui.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-academic-submission-file-http.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-resource-access-http.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-site-routes.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-auth-proxy-http.mjs` | Proxy HTTP 격리 실행기의 기존 여섯 시스템 값만 새 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `scripts/verify-markdown-boundary.mjs` | Markdown 경계 검증 실행기의 기존 여섯 시스템 값만 새 자식 환경으로 복사; 작업 디렉터리의 .env 파일 로딩까지 차단한다는 뜻은 아님 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `tests/support/qa-schema-export.mjs` | 기존 여섯 시스템 값만 새 격리 자식 환경으로 복사 | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT` |
| `tests/support/resource-qa-preload.mjs` | 검증된 격리 PG 설정을 받는 기존 QA 어댑터 진입점; 일반 별칭 허용이 아님 | 새 설정 이름을 만들지 않는 전달 |
| `tests/e2e/academic-g1.spec.mts` | 검증된 격리 PG 설정을 받는 기존 QA 어댑터 진입점; 일반 별칭 허용이 아님 | 새 설정 이름을 만들지 않는 전달 |

## 검사 범위와 한계

검사는 src, scripts, tests/support, tests/e2e와 명시한 루트 설정 파일의 JS/TS/TSX를 AST로 읽습니다. 단위 테스트의 변조 fixture, 의존성 내부, 실제 .env 및 외부 비밀 저장소를 읽지 않습니다. 운영 스크립트도 목록에 포함하지만 실행하지 않습니다. 새 계산식·별칭·환경 객체 전달은 실패하며 근거 있는 정확한 예외만 추가합니다. 이름 분류와 필수 조건·누락 동작의 의미는 코드 리뷰로 확인합니다.

`node scripts/check-environment-contract.mjs`는 실제 값이나 예시의 잘못된 값을 오류에 출력하지 않습니다. 앱 CI에서 npm ci 이후 실행하며 설치 없는 PR/릴리스 정책 job의 계약은 유지합니다. 기존 문서 전체 정비나 #282의 실제 운영 확인까지 완료 처리하지 않습니다.
