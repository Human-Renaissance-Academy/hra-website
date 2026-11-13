# PR #301 문서별 검토 기록

이 기록은 [문서 정비 이슈 #299](https://github.com/Human-Renaissance-Academy/hra-website/issues/299)의 문서별 검토 범위를 보여 준다. 원래 PR #301의 비교 기준 `0e59d362`에 있던 **추적 Markdown 66개**를 파일별로 대조했다. 그중 **59개를 수정하고 7개는 보존**했다. 표의 근거는 읽은 코드·설정·이슈 또는 해당 시점의 기록이며, 배포 환경에서 그 기능을 새로 실행했다는 뜻이 아니다. `main` `15665df`와 검증된 로컬 통합 `04a35a7`의 코드를 대조했다. 로컬 #317·#310·#320은 `main` 병합이나 운영 적용을 완료한 것으로 적지 않는다.

`현재`는 저장소 코드·작업 규칙, `목표`는 향후 설계, `승인 대기`는 정책 결정이 필요한 내용, `운영 미확인`은 실제 환경의 DB·Blob·OAuth·Preview 설정을 이번 문서 검토에서 확인하지 않았다는 뜻이다. `과거 기록`은 해당 날짜의 조사·테스트 수치를 유지한다. 표의 `수정`은 내용이나 읽기 경로를 고쳤다는 뜻이며, 코드·DB·운영 데이터를 바꿨다는 뜻이 아니다.

| 기존 문서 | 처리와 문서별 판단 | 대조 근거 | 경계 |
| --- | --- | --- | --- |
| `.github/AGENTS.md` | 보존: 이슈·PR 자동화 규칙의 소유 문서라 안내 문장 정비로 정책을 바꾸지 않았다. | `scripts/_lib/process-format.mjs`, `scripts/_lib/release-policy.mjs` | 현재 규칙 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 보존: 네 섹션과 관련 이슈 표기는 CI 형식 계약이므로 유지했다. | `scripts/_lib/process-format.mjs`, `.github/workflows/process-format.yml` | 현재 규칙 |
| `AGENTS.md` | 수정: 공개/회원 경로, 학사 역할, CI와 목표 플랫폼의 범위를 현재 코드에 맞춰 구분했다. | `src/lib/db/schema.ts`, `src/lib/auth.ts`, `.github/workflows/ci.yml` | 현재·목표 |
| `CHANGELOG.md` | 보존: 기존 릴리스 이력을 현재 기능 설명으로 다시 쓰지 않았다. | 문서의 날짜·PR 번호, `docs/contributing/releasing.md` | 과거 기록 |
| `CLAUDE.md` | 보존: `AGENTS.md`로 연결하는 한 줄 진입 파일이다. | `AGENTS.md` | 현재 규칙 |
| `README.md` | 수정: 작업별 읽기 순서, Node 24 설치, G1 코드와 모바일 목표, 운영 미확인을 처음 보이게 했다. | `package.json`, `.nvmrc`, `src/app/` | 현재·목표·운영 미확인 |
| `content/member/guides/markdown-guide.md` | 수정: Markdown 작성 안내의 버전·링크와 화면 사용 조건을 정리했다. 내장 기본본의 지위를 유지한다. | `src/lib/markdown/resolve.ts`, `src/app/(member)/member/guides/[slug]/page.tsx` | 현재 기본 콘텐츠 |
| `content/member/guides/report-writing-guide.md` | 수정: 작성 순서와 양식 PDF/작성본의 차이를 현재 자료실 흐름에 맞췄다. | `src/lib/markdown/resolve.ts`, `docs/REPORT-ARCHIVE-SCOPE.md` | 현재 기본 콘텐츠 |
| `content/member/guides/submission-guide.md` | 수정: 개인 보고서 제출 경로·마감 확인을 현재 G1과 분리해 설명했다. 실제 마감은 과제 공지에 따른다. | `src/lib/markdown/resolve.ts`, `docs/ASSIGNMENT-SUBMISSION-SCOPE.md` | 현재 기본 콘텐츠·운영 확인 |
| `content/member/templates/business-practice-template.md` | 보존: 승인된 경영 실습 양식 항목을 문장 정비만으로 바꾸지 않았다. | `docs/REPORT-STORAGE-DECISION.md`, `src/lib/markdown/resolve.ts` | 기존 기본 콘텐츠 |
| `content/member/templates/classic-book-template.md` | 보존: 고전 독후감의 장·제목 구조를 유지했다. | `docs/REPORT-STORAGE-DECISION.md`, `src/lib/markdown/resolve.ts` | 기존 기본 콘텐츠 |
| `content/member/templates/management-book-template.md` | 보존: 경영 서적 독후감의 장·발표 정보 구조를 유지했다. | `docs/REPORT-STORAGE-DECISION.md`, `src/lib/markdown/resolve.ts` | 기존 기본 콘텐츠 |
| `docs/ACADEMIC-DATA-MODEL.md` | 수정: 구현된 G1 표와 G2/G3 설계, 운영 미적용 SQL을 분리했다. | `src/lib/db/schema.ts`, `scripts/migrate-academic-*.sql` | 현재·목표·운영 미확인 |
| `docs/ACADEMIC-MANAGEMENT-ROADMAP.md` | 수정: G1 코드 현황과 G2 어드바이저·조교 출결, G3 수료 목표를 단계별로 정리했다. | `src/features/academics/`, 이슈 #143·#165 | 현재·목표·승인 대기 |
| `docs/ACADEMIC-PRIVACY-RETENTION-POLICY.md` | 수정: 구현된 데이터 경계와 보존기간·파기·백업 승인 대기를 먼저 구분했다. | `src/lib/db/schema.ts`, 이슈 #142 | 현재·승인 대기 |
| `docs/ADMIN-GUIDE.md` | 수정: 실제 관리자 메뉴, 로그인 경로, 저장 후 공개 확인을 다시 안내했다. 학사 승인자는 별개로 적었다. | `src/app/(admin)/admin/admin-shell.tsx`, `src/lib/academic-admin.ts` | 현재·운영 확인 |
| `docs/ASSIGNMENT-SUBMISSION-SCOPE.md` | 수정: G1 개인 제출과 기수 공동 자료를 분리하고 구현·기능 설정·운영 승인을 구분했다. | `src/features/academics/`, `src/features/weekly-texts/actions/index.ts` | 현재·운영 미확인 |
| `docs/CUSTOMIZATION.md` | 수정: DB 콘텐츠 수정과 배포할 화면 코드 수정을 나눠 시작 위치를 찾게 했다. | `src/app/(public)/`, `src/features/`, `src/lib/db/schema.ts` | 현재 |
| `docs/DATABASE.md` | 수정: DB 표·관계·회원 역할과 새 개발 DB/운영 DB의 다른 절차를 설명했다. | `src/lib/db/index.ts`, `src/lib/db/schema.ts`, `docs/developer/database-change-procedure.md` | 현재·운영 확인 |
| `docs/DEPLOYMENT.md` | 수정: 환경별 설정·검증·실패 행동과 Preview 성공의 한계를 정리했다. 실제 자원 격리는 별도 확인이다. | `package.json`, `vercel.json`, `.env.example` | 현재 절차·운영 미확인 |
| `docs/GUIDE.md` | 수정: 처음 참여자의 파일 탐색과 작은 화면 변경·검증 순서를 현재 폴더 구조로 바꿨다. | `src/app/`, `src/components/`, `src/features/` | 현재 |
| `docs/KAKAO-LOGIN-SETUP.md` | 수정: 카카오 콘솔, 환경별 callback, 앱 로그인 확인을 순서대로 나눴다. | `src/lib/auth.ts`, `src/lib/kakao-provider.ts` | 현재 코드·운영 미확인 |
| `docs/PLATFORM-ROADMAP.md` | 수정: monorepo·모바일을 현재 파일 구조로 오해하지 않도록 단계와 선행 조건을 덧붙였다. | `docs/developer/platform-architecture.md`, `src/app/` | 목표·운영 미확인 |
| `docs/PRESS-ARTICLES.md` | 수정: 2026-04-26 기사 조사를 당시 기록으로 표시하고 현재 등록 전 원문 재확인을 안내했다. | 문서의 조사 날짜, `src/app/(admin)/admin/press/page.tsx` | 과거 기록 |
| `docs/QUALITY-GATE.md` | 수정: 현재 CI 실행 순서와 선택되지 않은 E2E 범위를 구분하고 기존 보고서 점검표를 보존했다. | `.github/workflows/ci.yml`, `vitest.config.mts`, `playwright.config.ts` | 현재 검사·운영 미확인 |
| `docs/REPORT-ARCHIVE-SCOPE.md` | 수정: 양식 목록·상세·인쇄 경로와 개인 과제 제출 경로를 나누었다. | `src/lib/markdown/resolve.ts`, `src/app/(member)/member/templates/` | 현재 |
| `docs/REPORT-STORAGE-DECISION.md` | 수정: DB 행이 없을 때만 내장 파일을 쓰는 선택과 비공개 fallback 차단을 명시했다. | `src/lib/markdown/resolve.ts` | 현재 결정 |
| `docs/application-form-concurrency.md` | 수정: 질문 저장·제출 경합의 기대 결과와 DB 함수 적용·검증 경계를 풀어 설명했다. | `scripts/migrate-atomic-application-questions.sql`, `src/features/applications/` | 현재·운영 적용 확인 |
| `docs/contributing/ai-tools.md` | 수정: 도구별 설명보다 작은 작업·검증·리뷰의 공통 절차를 앞세웠다. | `AGENTS.md`, `.github/PULL_REQUEST_TEMPLATE.md` | 현재 규칙 |
| `docs/contributing/build-and-deploy-safety.md` | 수정: Node 24, 깨끗한 설치, 현재 CI, 실제 Preview 실패·제한 대응을 한 순서로 묶었다. | `package.json`, `.github/workflows/ci.yml`, PR #325·#328 | 현재 절차·운영 미확인 |
| `docs/contributing/conventions.md` | 수정: 입력 검증·권한과 현재 서버 액션에서 목표 서비스 경계로 넘어가는 기준을 분리했다. | `src/features/`, `docs/developer/platform-architecture.md` | 현재·목표 |
| `docs/contributing/releasing.md` | 수정: 릴리스 PR·태그와 앱 배포의 차이, 자동화 활성화 조건을 명료화했다. | `.github/workflows/release-please.yml`, `scripts/_lib/release-policy.mjs` | 현재 설정·운영 미확인 |
| `docs/contributing/tasks-by-level.md` | 수정: 쉬운 작업이라도 DB·권한 영향이 있으면 검증을 넓히도록 난이도를 다시 묶었다. | `docs/contributing/workflow.md`, `docs/QUALITY-GATE.md` | 현재 절차 |
| `docs/contributing/workflow.md` | 수정: 이슈→PR→현재 커밋 CI·Preview→병합·완료의 실제 흐름을 설명했다. | `scripts/_lib/process-format.mjs`, `.github/workflows/ci.yml` | 현재 규칙·운영 미확인 |
| `docs/developer/academic-assignment-actions.md` | 수정: 과제 관리 서버 액션·서비스·DB 함수의 책임과 재시도 조건을 먼저 설명했다. | `src/features/academics/assignments/actions.ts`, `scripts/migrate-academic-assignment-actions.sql` | 현재·운영 적용 확인 |
| `docs/developer/academic-assignment-admin.md` | 수정: 지정 승인자의 초안→대상 확인→공개 흐름과 필요한 설정을 설명했다. | `src/app/(academic)/admin/academics/assignments/page.tsx`, `tests/e2e/academic-assignment-admin.spec.ts` | 현재·운영 미확인 |
| `docs/developer/academic-assignment-uploads.md` | 수정: 전용 Private Blob 의도·검증·취소·정리 단계와 예산/재시도 결과를 구분했다. | `src/features/academics/assignment-uploads/`, `scripts/verify-academic-private-upload-http.mjs` | 현재·운영 공급자 미확인 |
| `docs/developer/academic-assignments-migration.md` | 수정: 공개 대상 스냅샷 SQL의 선행·카탈로그·복구 조건을 안내했다. | `scripts/migrate-academic-assignments.sql`, `src/lib/db/academic-assignments.ts` | 현재 SQL·운영 미적용 |
| `docs/developer/academic-enrollment-backfill.md` | 수정: 읽기 점검→승인 계획→명시적 적용 순서와 계정 자동 연결 금지를 앞에 뒀다. | `scripts/backfill-academic-enrollments.mjs`, `scripts/migrate-academic-enrollment-links.sql` | 현재 명령·운영 승인 대기 |
| `docs/developer/academic-g1-quality-gate.md` | 수정: 실제 격리 G1 실행기와 공급자·운영 검증의 차이를 적었다. | `scripts/verify-academic-g1.mjs`, `.github/workflows/ci.yml` | 현재 검사·운영 미확인 |
| `docs/developer/academic-observability.md` | 수정: 구현된 로그·상태 API와 아직 누적 원장이 없어 `null`인 지표를 구분했다. | `src/lib/academic-observability.ts`, `src/app/api/academics/health/route.ts` | 현재·목표 |
| `docs/developer/academic-roster.md` | 수정: 학생 명부와 회원 계정의 차이, 지정 승인자의 등록·감사 절차를 설명했다. | `src/features/academics/roster/`, `scripts/migrate-academic-roster.sql` | 현재·운영 적용 확인 |
| `docs/developer/academic-student-queries.md` | 수정: 본인 조회 DTO·권한과 미연결 학생의 결과를 설명했다. | `src/features/academics/student-assignments/queries.ts`, `src/lib/academic-permissions.ts` | 현재 |
| `docs/developer/academic-student-ui.md` | 수정: 화면의 업로드·검증·최종화 상태를 분리하고 2026-10-16 QA를 과거 증거로 두었다. | `src/app/(member)/member/assignments/`, `scripts/verify-academic-student-ui.mjs` | 현재·과거 기록·운영 미확인 |
| `docs/developer/academic-students-migration.md` | 수정: 학생/기수 SQL을 적용한 DB의 카탈로그 확인과 운영 적용의 분리를 적었다. | `scripts/migrate-academic-students.sql`, `src/lib/db/schema.ts` | 현재 SQL·운영 미적용 |
| `docs/developer/academic-submission-files.md` | 수정: 파일 다운로드의 현재 권한 재검증·감사와 전용 저장소 조건을 설명했다. | `src/app/api/academic/submissions/`, `src/lib/db/academic-file-accesses.ts` | 현재·운영 저장소 미확인 |
| `docs/developer/academic-submission-finalization.md` | 수정: 검증된 의도를 제출로 원자적으로 확정하는 순서와 재시도·복구를 풀었다. | `scripts/migrate-academic-submission-finalization.sql`, `src/features/academics/submissions/` | 현재·운영 DB 미확인 |
| `docs/developer/academic-submission-statuses.md` | 수정: 공개 당시 대상 수를 분모로 쓰는 현황·CSV 권한을 설명했다. | `src/features/academics/submission-statuses/` | 현재 |
| `docs/developer/academic-submissions-migration.md` | 수정: 제출·의도 표/함수의 잠금·권한 검증과 적용 순서를 연결했다. | `scripts/migrate-academic-submissions.sql`, `src/lib/db/schema.ts` | 현재 SQL·운영 미적용 |
| `docs/developer/database-change-procedure.md` | 수정: 빈 개발 DB의 `db:push`와 기존 DB의 범위 SQL/카탈로그 검증을 구분하고 #320 예약 인덱스의 별도 안내를 연결했다. | `src/lib/db/schema.ts`, `scripts/migrate-287-rate-limit-reservation-index.sql` | 현재 절차·운영 미적용 |
| `docs/developer/environment-strategy.md` | 수정: Preview 분리와 migration gate를 목표로 적고 실제 격리·자동화는 확인 대기로 남겼다. | `src/lib/db/index.ts`, 이슈 #279·#280 | 목표·운영 미확인 |
| `docs/developer/p1-security-rollout.md` | 수정: 과거 P1 FK 적용 기록을 보존하고 Auth.js 보안 버전의 별도 운영 확인을 덧붙였다. | `scripts/migrate-protect-application-answers.sql`, `src/lib/auth.ts` | 과거 기록·운영 미확인 |
| `docs/developer/platform-architecture.md` | 수정: Web 내부 서비스 호출과 향후 모바일 API, 기수별 어드바이저·조교 출결 인가를 구분했다. | `src/features/academics/`, 이슈 #143·#165 | 목표·승인 대기 |
| `docs/developer/site-route-audit.md` | 수정: 2026-10-17의 검증 커밋·수치와 현재 재실행 절차를 분리했다. | `scripts/verify-site-routes.mjs`, 문서의 기준 SHA | 과거 기록 |
| `docs/getting-started/clone-and-setup.md` | 수정: Node 24·`npm ci`·개발용 설정·DB 준비의 순서를 현재 스크립트에 맞췄다. | `.nvmrc`, `package.json`, `.env.example` | 현재·운영 미확인 |
| `docs/getting-started/first-run.md` | 수정: 홈 표시와 DB·인증 기능 확인을 분리하고 저장 반영·종료 절차를 적었다. | `package.json`의 `dev`, `src/app/(public)/` | 현재·개발 환경 확인 |
| `docs/getting-started/prerequisites.md` | 수정: Git/Node 24/편집기 설치와 개발 서비스 접근 조건을 구분했다. | `.nvmrc`, `package.json`의 `engines` | 현재·운영 미확인 |
| `docs/index.md` | 수정: 처음 참여하는 개발자·관리자·운영 담당자의 읽기 경로를 마련했다. | `README.md`, `mkdocs.yml` | 현재·목표 분리 |
| `docs/operations/kakao-email-consent.md` | 수정: 콘솔 동의항목 확인과 기존 계정 주소 갱신의 적용·실패 행동을 나눴다. | `src/lib/auth-signin.ts`, `src/lib/auth-email.ts` | 현재 코드·운영 미확인 |
| `docs/operations/kakao-legacy-binding.md` | 수정: 자동 이메일 연결을 피하는 과거 계정 복구의 대상·중단 조건을 명시했다. | `scripts/migrate-backfill-kakao-legacy-bindings.mjs` | 현재 명령·운영 대상 확인 |
| `docs/operations/markdown-image-ownership.md` | 수정: 파일 원장·참조 뷰·삭제 전 dry-run과 복구 경계를 단계로 나눴다. | `src/lib/owned-blob.ts`, `scripts/sql/markdown-image-references.sql` | 현재 코드·운영 미확인 |
| `docs/operations/rate-limits.md` | 수정: 예약 함수·정리 Cron의 적용·확인·실패 경계를 설명했다. | `src/lib/rate-limit.ts`, `vercel.json` | 현재 코드·운영 적용 확인 |
| `docs/recruitment-intake-policy.md` | 수정: 내부 양식 공개 여부와 외부 버튼 날짜·링크가 다른 접수 스위치임을 설명했다. | `src/features/recruitment/status.ts`, `src/features/applications/actions/submissions.ts` | 현재 |
| `docs/recruitment-singleton.md` | 수정: 단일 행 제약과 0·1·2행에 따른 migration 행동을 설명했다. | `scripts/migrate-recruitment-singleton.mjs`, `src/lib/db/schema.ts` | 현재 SQL·운영 적용 확인 |
| `docs/resource-access-policy.md` | 수정: 공동 자료의 열람/작성 권한을 개인 과제 권한과 분리했다. | `src/lib/resource-access.ts`, `src/features/weekly-texts/actions/index.ts` | 현재 |
| `docs/resource-file-access-policy.md` | 수정: 공개 파일 보호 전환과 현재 Private Blob 코드 지원을 구분했다. | `scripts/migrate-protected-resource-blobs.mjs`, `src/lib/resource-blob-store.ts` | 현재 코드·운영 이전 미확인 |

## 원래 범위 밖의 추가 문서

| 문서 | 출처와 판단 | 경계 |
| --- | --- | --- |
| `docs/documentation-map.md` | PR #301 추가. 읽기 경로, 현재/목표/정책/과거 기록의 분류와 유지 기준을 제공한다. | 안내 |
| `docs/getting-started/glossary.md` | PR #301 추가. 처음 등장하는 개발·운영 용어를 풀이한다. | 안내 |
| `docs/getting-started/project-tour.md` | PR #301 추가. 화면→서버→DB의 현재 파일 경로를 따라간다. | 현재 예시 |
| `docs/developer/github-actions-security.md` | 후속 `main`에서 도입된 별도 CI 보안 안내. 원래 66개 집계에 넣지 않았고 원문 정책을 유지한다. | 현재 CI 규칙 |
| `docs/developer/rate-limit-reservation-index.md` | #320의 로컬 통합 안내. 범위 SQL과 인덱스 카탈로그·합성 성능 증거를 설명하며 운영 적용은 미확인이다. | 로컬 코드·운영 미적용 |

`mkdocs.yml`의 메뉴와 `.env.example`은 Markdown 66개 집계 밖의 설정 파일이다. PR #301은 새 안내의 탐색 경로와 안전한 합성 설정 예시를 보강하지만 실제 환경값을 저장하지 않는다. 이 표의 근거 경로는 리뷰 시 실제 저장소와 다시 대조하고, 새 코드·SQL·정책이 병합되면 해당 행의 상태도 갱신한다.
