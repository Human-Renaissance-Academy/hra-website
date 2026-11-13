# HRA 배포와 문제 해결

이 문서는 개발한 웹사이트를 검증 환경에 올리고, 확인한 버전을 운영에 반영하는 순서를 설명합니다. **배포 성공은 코드가 실행된다는 뜻이며, DB 변경·파일 보호·로그인 설정까지 완료됐다는 뜻은 아닙니다.**

운영 환경 분리의 **목표 정책**은 [환경 분리 및 배포 전략](developer/environment-strategy.md)을 따릅니다. 목표 흐름은 **Local Development → PR Preview/Test → Production**이며, 모바일 내부 테스트 목적이 생기기 전에는 상시 Staging을 기본으로 두지 않습니다. Preview/Test는 Production DB·Blob·개인정보·운영 세션과 토큰을 사용하지 않아야 합니다. **현재 Preview 자원과 환경변수의 실제 격리 상태는 미확인입니다.** Preview 사용 전 [환경 분리 #279](https://github.com/Human-Renaissance-Academy/hra-website/issues/279)에 따라 연결 대상을 확인합니다.

문서 확인일: 2026-10-18. 현재 앱은 저장소 루트의 `package.json`과 `src/`를 사용합니다. `apps/web` 전환과 자동 migration gate는 [환경 분리 및 배포 전략](developer/environment-strategy.md)의 목표이며, 실제 구축 여부는 각각의 이슈에서 확인합니다.

## 1. 먼저 구분할 세 가지

| 용어 | 의미 | HRA에서 확인할 것 |
| --- | --- | --- |
| 배포 | 특정 코드 버전을 서버에서 실행하는 작업 | 배포 대상 브랜치와 커밋 |
| 환경변수 | 실행 환경마다 다른 설정값 | DB 주소, 로그인 키, 저장소 설정 |
| 마이그레이션 | 기존 DB에 필요한 구조·함수를 적용하는 작업 | 적용 대상, 순서, 검증 결과 |

환경변수에는 비밀값도 있고 공개 가능한 값도 있습니다. 이름에 `NEXT_PUBLIC_`이 붙은 값은 브라우저에 전달될 수 있으므로 비밀번호나 토큰을 넣지 않습니다. 용어가 낯설면 [용어집](getting-started/glossary.md)을 함께 보세요.

## 2. 배포할 환경부터 선택하기

기본 운영 정책은 **Local Development → PR Preview/Test → Production**입니다. 자세한 결정과 아직 구현할 작업은 [환경 전략](developer/environment-strategy.md)에 있습니다.

| 환경 | 목적 | 사용 데이터·저장소 |
| --- | --- | --- |
| Local Development | 내 컴퓨터에서 개발 | 개인 개발 DB와 합성 테스트 자료 |
| PR Preview/Test | 변경 사항을 함께 확인 | Production과 분리된 테스트 DB·Blob |
| Production | 실제 사용자에게 제공 | 운영 DB·운영 저장소 |

같은 설정값을 모든 환경에 체크해서 복사하지 않습니다. Preview가 운영 DB나 운영 파일을 사용하지 않는지 먼저 확인합니다. 현재 앱의 DB 드라이버는 Neon HTTP 방식입니다. 일반 로컬 PostgreSQL 주소만 넣어 앱을 실행할 수 있다고 가정하지 말고, 앱 개발용 Neon DB 또는 문서화된 테스트 실행기를 사용합니다.

**정상 결과:** 배포 대상과 DB·파일 저장소가 같은 환경을 가리킵니다. **대상이 불분명하면:** 배포나 초기화 명령을 실행하기 전에 프로젝트 담당자에게 환경 구성을 확인합니다.

## 3. 필요한 설정값

변수별 적용 환경·비밀 여부·필수 조건·누락 동작은 [환경변수 계약 목록](developer/environment-inventory.md)을 정본으로 확인합니다. `node scripts/check-environment-contract.mjs`가 소스·예시·생성 목록의 차이를 검사하며, 실제 배포 환경의 연결·격리까지 검증하지는 않습니다.

로컬 앱과 여러 npm 스크립트는 `.env`를 사용합니다. 새 작업 폴더에서 `.env.example`을 참고해 만들고, 기존 `.env`를 덮어쓰지 않습니다. Vercel에서는 프로젝트의 환경변수 설정에 **대상 환경별로** 등록한 뒤 새 배포에 반영합니다.

### 웹사이트와 로그인

| 설정 | 목적 | 설정 조건·확인 결과 |
| --- | --- | --- |
| `DATABASE_URL` | Neon DB 연결 문자열 | DB 기능에 필요. 환경에 맞는 DB를 선택 |
| `AUTH_SECRET` | 로그인 세션 보호에 사용하는 비밀 키 | 로그인에 필요. 환경별로 관리 |
| `NEXT_PUBLIC_APP_URL` | 개발 환경의 `metadataBase` 주소 fallback | Vercel production URL·배포 URL이 우선이며 production 고정 주소도 덮지 않음. 개발 기본은 `http://localhost:3000` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | 구글 로그인 | 해당 로그인을 제공할 때 두 값 설정 |
| `AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET` | 카카오 로그인 | 해당 로그인을 제공할 때 두 값 설정 |
| `AUTH_KAKAO_EMAIL_SCOPE` | 카카오 이메일 동의 요청 선택 | 기본 `false`; [이메일 동의 절차](operations/kakao-email-consent.md)의 계정 처리 검토·회귀 확인 뒤 변경 |
| `HEALTH_CHECK_SECRET` | 상태 점검의 상세 응답 확인 | 상세 모니터링에만 필요 |

로그인 제공자의 callback은 로그인 완료 후 돌아오는 주소입니다. 예를 들어 로컬 구글 로그인은 `http://localhost:3000/api/auth/callback/google`, 카카오는 `/api/auth/callback/kakao`를 사용합니다. 운영·검증 환경에는 각각의 실제 앱 주소를 등록합니다. 제공자 설정 방법은 [Google OAuth 문서](https://developers.google.com/identity/protocols/oauth2/web-server)와 [카카오 로그인 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/prerequisite)를 확인합니다.

소셜 로그인 설정이 없으면 해당 버튼을 제공하지 않습니다. 이메일/비밀번호 로그인을 사용하려면 실제로 생성된 해당 계정도 있어야 합니다. `AUTH_SECRET`만 등록한다고 관리자 계정이 생기지는 않습니다.

### 파일 저장소

Blob은 사진·PDF 같은 파일의 실제 내용을 보관하는 저장소입니다. 파일 제목·작성자·연결 정보는 DB에 따로 저장합니다.

| 용도 | 설정 | 운영 조건 |
| --- | --- | --- |
| 공개 사진·포스터 | `BLOB_READ_WRITE_TOKEN` | 공개 콘텐츠용 저장소와 연결 |
| 보호 자료 | `RESOURCE_PRIVATE_BLOB_HOST`, `RESOURCE_PRIVATE_READ_WRITE_TOKEN`, `RESOURCE_PRIVATE_BLOB_ENABLED` | [파일 접근 정책](resource-file-access-policy.md)의 전환·검증 절차 적용 |
| 학사 개인 제출 파일 | `ACADEMIC_SUBMISSION_BLOB_HOST`, `ACADEMIC_SUBMISSION_READ_WRITE_TOKEN` | 명시적으로 지정한 Private Blob만 사용 |

저장소를 새로 만드는 것만으로 앱과 연결이 끝나지 않습니다. 토큰이 속한 저장소와 앱이 허용하는 호스트 설정이 일치하는지 확인합니다. 공개 이미지 호스트는 현재 `src/lib/blob-host.ts`와 이미지 설정에서도 사용하므로 다른 개발 저장소를 연결할 때 함께 검토합니다.

보호 자료는 설정 등록뿐 아니라 기존 파일의 전환까지 확인해야 합니다. 전환 완료 여부는 [#268](https://github.com/Human-Renaissance-Academy/hra-website/issues/268)의 운영 증거로 판단하며, 이 문서는 운영 환경의 현재 상태를 보증하지 않습니다.

### 학사 기능과 예약 작업

`gate`는 준비가 끝난 기능만 열기 위한 설정 스위치입니다. 아래 값을 모두 켜는 것이 설치 절차는 아닙니다.

| 설정 | 의미 | 기본·선행 조건 |
| --- | --- | --- |
| `ACADEMIC_ENABLED` | 학사 화면·기능 공개 | 기본 비활성, 관련 DB 적용 필요 |
| `ACADEMIC_APPROVER_USER_ID` | 학사 운영 책임자 계정 지정 | 검증된 계정 ID를 별도로 지정 |
| `ACADEMIC_ENROLLMENT_WRITES_ENABLED` | 학사 개인정보 쓰기 허용 | 기본 비활성, 보존 정책과 운영 결정 필요 |
| `ACADEMIC_UPLOADS_ENABLED` | 과제 파일 업로드 허용 | 기본 비활성, 제출 저장소·DB 준비 필요 |
| `ACADEMIC_UPLOAD_CLEANUP_ENABLED` | 미완료 학사 업로드 정리 실행 | 기본 비활성 |
| `ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED` | 위 정리에서 실제 파일 삭제 허용 | 없으면 dry-run, 즉 삭제 없이 확인 |
| `CRON_SECRET` | 예약 작업 호출 인증 | 예약 작업을 운영할 환경에 설정 |

현재 `vercel.json`에 등록된 일정은 `/api/cron/cleanup-rate-limits` 한 개이며 매일 **03:00 UTC, 한국 시간 12:00**입니다. 학사 업로드 정리 일정은 자동 등록하지 않는다는 별도 결정이 있습니다. [학사 업로드 운영 조건](developer/academic-assignment-uploads.md)을 확인한 뒤 통합 담당자가 일정을 정합니다.

## 4. 코드와 DB를 준비하기

작업 브랜치에서 잠금 파일에 맞춰 의존성을 설치하고 검증합니다. 아래 명령은 소스 검증용입니다.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

| 명령 | 확인하는 것 | 실패했을 때 |
| --- | --- | --- |
| `lint` | 코드 작성 규칙 | 오류 위치를 수정하고 다시 실행 |
| `typecheck` | 값·함수 사용의 타입 일치 | 해당 타입 오류를 해결 |
| `test` | 자동 테스트 | 실패와 건너뜀을 구분하고 필요한 DB 테스트 환경 확인 |
| `build` | 배포 가능한 앱 생성 | 빌드 로그의 첫 원인부터 확인 |

DB 변경이 필요하면 **앱 배포보다 먼저 적용해야 할 항목**을 [DB 변경 절차](developer/database-change-procedure.md)에서 확인합니다. `npm run db:push`는 현재 모든 대상에서 접속 없이 실패 종료합니다. 기본 Drizzle 설정에도 DB 자격정보가 없으며, SQL 생성과 실제 적용 승인은 위 절차에서 구분합니다. 자동 적용 이력·배포 차단 장치의 구축은 [#280](https://github.com/Human-Renaissance-Academy/hra-website/issues/280)에서 진행할 작업입니다.

## 5. Preview에서 확인한 뒤 운영 반영하기

1. Vercel 프로젝트가 올바른 저장소와 연결됐는지 확인합니다. 현재 앱의 기준 폴더는 저장소 루트입니다.
2. 작업 브랜치의 PR과 Preview를 준비합니다. 실제 자동 배포 조건은 프로젝트 설정에서 확인합니다. **현재 PR 마지막 커밋**의 GitHub CI와 Vercel Preview 결과를 각각 확인합니다.
3. Preview 설치·빌드가 실패하면 해당 커밋의 로그에서 첫 실패 단계를 확인하고 수정한 커밋으로 두 검사를 다시 통과시킵니다. `npm ci`의 peer 충돌은 [빌드·배포 안전 가이드](contributing/build-and-deploy-safety.md)의 의존성 확인 절차를 따릅니다.
4. #279에 따라 Preview 자원이 Production과 분리된 것을 확인한 뒤 아래 확인표를 Preview의 합성 계정·자료로 검사합니다. 격리가 확인되지 않았다면 실사용 자료를 넣지 않고 미검증으로 기록합니다.
5. 리뷰와 필요한 검증을 통과한 PR **한 건**을 프로젝트 절차에 따라 병합합니다.
6. DB 변경 순서와 운영 설정을 확인한 뒤 Production 배포 또는 승격을 진행합니다. 새 `main` 병합 커밋의 Production 배포 성공을 확인한 다음에만 다음 PR을 갱신·푸시합니다. 배포가 대기·실패·횟수 제한이면 다음 작업의 푸시·병합을 멈추고 마지막 성공 배포 커밋을 따로 기록합니다.

브랜치에 `git push`했다고 반드시 운영이 갱신되는 것은 아닙니다. 연결된 Production Branch와 Preview 설정에 따라 대상이 달라집니다. [Vercel 배포 환경 문서](https://vercel.com/docs/deployments/environments)를 참고합니다.

Preview가 `Ready`여도 실제 로그인 제공자·DB·Blob 연결과 운영 환경 설정까지 검증된 것은 아닙니다. 확인한 배포 커밋, CI·Preview 상태, 실행한 기능 검사와 미확인 범위를 PR에 각각 기록합니다.

| 확인 항목 | 기대 결과 |
| --- | --- |
| 공개 홈페이지 | 오류 없이 표시 |
| `/api/health` | 정상 DB 연결에서 HTTP 200과 `status: ok` |
| 로그인 | 준비한 계정으로 로그인 가능 |
| 자료실 | 승인 역할별 정책이 동일하게 적용 |
| 공개 이미지 업로드 | 저장 후 실제 페이지에서 표시 |
| 보호 자료 | 합성 자료로 다운로드·권한 검사 확인 |
| 내부 지원서 | 양식 공개·제출·관리자 조회가 연결 |
| 외부 접수 사용 시 | 모집 날짜·외부 버튼과 외부 서비스의 접수 상태를 각각 확인 |

처음 사용하는 DB라면 [첫 관리자 준비](DATABASE.md)를 **관리자 로그인 검사 전에** 마칩니다. 기수와 공지 작성 방법은 [관리자 가이드](ADMIN-GUIDE.md)를 따릅니다.

## 6. 실패했을 때 무엇부터 볼까요?

| 증상 | 먼저 확인할 것 | 다음 행동 |
| --- | --- | --- |
| `DATABASE_URL is not set` | 실패한 배포 환경에 값이 있는지 | 해당 환경 설정 후 새 배포로 확인 |
| `relation ... does not exist` | 연결 DB와 적용한 변경 목록 | 누락된 범위의 DB 절차 확인; 전체 push로 덮지 않음 |
| 로그인 버튼 없음 | 제공자 ID·Secret 설정과 새 배포 반영 | 설정 조합과 callback을 함께 확인 |
| 관리자 로그인 실패 | 계정 생성 여부·입력값·로그인 오류 | 비밀번호 재설정 목적으로 seed를 반복하지 않음 |
| 업로드 실패 | 파일 종류·크기, 해당 기능의 저장소, 권한 | 오류 메시지와 요청 시각을 기록하고 담당자 확인 |
| 학사 준비 안내 | 기능·쓰기 gate 및 책임자 지정 | 정책과 DB 준비 상태 확인 후 필요한 기능만 활성화 |
| Cron 503 또는 401 | secret 누락 또는 호출 인증 실패 | [요청 제한 운영 절차](operations/rate-limits.md) 확인 |
| `/api/health` 503 | 환경 설정과 DB 연결 | 허용된 상세 점검과 서버 로그로 원인 분리 |
| `Deployment rate limited` | 배포 플랫폼의 제한 메시지와 재시도 가능 시각 | 재배포·수정 푸시·병합 반복을 멈추고 현재 PR 및 `main` 커밋과 마지막 Preview·Production 성공 커밋을 구분해 기록; 제한 해제 뒤 대상 커밋의 배포를 확인 |

상태 점검 HTTP 200은 로그인·업로드·전체 학사 기능의 성공까지 보장하지 않습니다. `HEALTH_CHECK_SECRET`과 일치하는 `x-health-check-secret` 헤더를 보내면 DB 상태·실행 중인 `nodeMajor`·시각을 포함한 상세 응답을 확인할 수 있습니다.

**Node.js 운영 런타임 확인 (#294):** 승인된 운영자만 secret을 안전한 보관소에서 읽고, 해당 Production 배포의 `/api/health`에 헤더를 전송합니다. 응답의 숫자형 `nodeMajor`와 배포 SHA·배포 시각·`.nvmrc`/배포 설정의 목표 major(현재 24)를 대조해 **일치/불일치만** 이슈에 기록합니다. 헤더 원문·전체 health 응답·환경변수·DB 연결 주소는 PR/이슈/CI 로그에 붙이지 않습니다. 익명·잘못된 secret 응답은 기존처럼 `{ "status": "ok" }` 또는 `{ "status": "error" }`만 반환합니다. Node major 일치는 실제 Vercel 환경을 읽고 확인한 이후에만 체크하고, 코드 테스트만으로 운영 버전을 확인했다고 보고하지 않습니다.

배포 후 공개 GET·시간별 가용성 점검·Actions 실패 알림의 범위와 대응은 [운영 공개 경로 점검](operations/production-smoke.md)을 따릅니다. 이 자동 점검은 health secret·운영 쓰기를 사용하지 않으며, 배포 성공과 HTTP 검사 성공을 별도로 남깁니다.

운영 로그를 공유할 때에는 연결 문자열·쿠키·파일 주소·개인정보를 제거하고, 배포 커밋·발생 시각·기능·오류 종류를 남깁니다. 앱을 이전 버전으로 되돌려도 DB와 파일 변경은 자동 복구되지 않으므로 해당 변경의 복구 절차를 함께 확인합니다.

## 7. 문서 사이트 배포

MkDocs 문서 사이트와 Vercel 앱은 별도 배포입니다. 문서 수정은 `mkdocs build --strict`로 링크·구성을 검사하고, 게시 권한이 있는 담당자가 저장소의 문서 배포 절차를 따릅니다. 앱을 재배포해도 GitHub Pages 문서가 자동 갱신됐다고 판단하지 않습니다.

## 코드 근거

- `package.json`, `.env.example`, `vercel.json`
- `src/lib/db/index.ts`, `src/lib/auth.ts`, `src/lib/blob-host.ts`
- `src/lib/academic-admin.ts`, `src/lib/resource-blob-store.ts`
- `src/app/api/health/route.ts`, `src/app/api/cron/cleanup-rate-limits/route.ts`
