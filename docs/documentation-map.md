# 전체 문서 지도와 관리 기준

문서를 처음부터 모두 읽을 필요는 없다. 먼저 [처음 참여하는 개발자의 읽기 순서](index.md)를 따라 실행과 작은 수정을 경험하고, 맡은 작업에 필요한 문서로 이동한다. 용어가 막히면 [용어집](getting-started/glossary.md)을 함께 연다.

## 문서의 상태를 읽는 방법

| 표시 | 의미 | 읽을 때 확인할 것 |
| --- | --- | --- |
| 현재 동작·절차 | 기준 코드에 구현된 기능 또는 지금 따르는 작업 규칙 | 내 브랜치와 실행 환경에도 같은 코드·설정이 있는지 |
| 목표 구조·후속 단계 | 앞으로 만들거나 정비할 방향 | 연결된 이슈의 완료 조건과 선행 작업 |
| 정책 초안 | 운영 책임자가 결정해야 하는 규칙 | 승인 여부와 승인된 범위 |
| 과거 기록 | 특정 날짜·커밋·환경에서 수행한 조사나 검증 | 현재 환경에서도 그대로 성립하는지 |

이 문서 정비는 2026-10-18에 시작했고, 2026-10-21에 앱 스크립트·기본 CI·의존성·배포 안내를 `15665df`의 코드와 다시 대조했다. 2026-10-22에는 [문서 PR #278](https://github.com/Human-Renaissance-Academy/hra-website/pull/278)의 목표 구조와 #317·#310·#320의 검증된 **로컬 통합 코드**를 함께 읽었다. 이 세 작업이 이미 `main`에 병합됐거나 운영 DB에 적용됐다는 뜻은 아니다. 각 문서의 개별 검증 기록은 해당 시점의 근거로 남겨 두었다. **이 검토는 운영 Vercel 런타임, Preview 자원 격리, DB 적용, OAuth·Blob 실제 연결을 확인한 결과가 아니다.** 현재 우선순위와 남은 작업은 [전체 추적 #300](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)에서 확인한다.

PR #301의 [문서별 검토 기록](developer/document-review-ledger.md)은 원래 기준의 기존 Markdown 66개를 변경·보존으로 구분하고, 각 문서에서 대조한 구현 근거와 남은 운영 확인을 적는다. 이 기록을 실제 배포 검증으로 확대하지 않는다.

## 1. 시작·수정·협업

| 문서 | 이 문서로 해결할 질문 |
| --- | --- |
| [개발 가이드 첫 화면](index.md) | 무엇부터 읽고 어떤 작업을 해 볼까? |
| [사전 준비](getting-started/prerequisites.md) | 어떤 프로그램과 접근 권한이 필요한가? |
| [코드 받아오기와 설정](getting-started/clone-and-setup.md) | 내 PC에 프로젝트를 준비하려면? |
| [첫 실행](getting-started/first-run.md) | 실행 성공을 어떻게 확인하고 오류는 어디서 볼까? |
| [화면부터 DB까지 따라가기](getting-started/project-tour.md) | 클릭한 뒤 코드의 어느 부분이 일을 처리할까? |
| [용어집](getting-started/glossary.md) | PR, API, FK, 세션 같은 용어는 무슨 뜻인가? |
| [현재 폴더와 기능 안내](GUIDE.md) | 고치려는 기능의 파일은 어디에 있을까? |
| [화면·내용 수정](CUSTOMIZATION.md) | 문구·디자인·운영 콘텐츠 중 무엇을 수정해야 할까? |
| [협업 순서](contributing/workflow.md) | 이슈부터 PR과 병합까지 어떤 순서로 진행할까? |
| [코드 작성 규칙](contributing/conventions.md) | 이름·입력 검증·권한 검사를 어떻게 작성할까? |
| [작업 난이도와 첫 기여](contributing/tasks-by-level.md) | 지금 해 볼 만한 작업과 완료 기준은 무엇인가? |
| [AI 도구 사용](contributing/ai-tools.md) | AI가 만든 변경을 어떻게 검토할까? |
| [빌드·배포 안전 가이드](contributing/build-and-deploy-safety.md) | 빌드가 실패하거나 배포 결과가 다르면 무엇을 확인할까? |
| [품질 검사](QUALITY-GATE.md) | CI가 검사하는 범위와 별도 검증은 무엇인가? |
| [GitHub Actions 보안](developer/github-actions-security.md) | CI가 어떤 코드와 권한으로 실행되는가? |
| [버전·릴리스 관리](contributing/releasing.md) | PR 병합, GitHub Release, 서비스 배포는 어떻게 다른가? |

## 2. 관리자·DB·배포

운영 환경에서 값을 바꾸거나 파일을 정리하기 전에 목적, 대상 환경, 예상 결과를 확인한다. 아래 문서는 실행 조건을 설명하며 실제 운영 확인 결과를 대신하지 않는다.

| 문서 | 이 문서로 해결할 질문 |
| --- | --- |
| [관리자 운영](ADMIN-GUIDE.md) | 홈페이지 관리자 메뉴로 무엇을 관리할 수 있나? |
| [데이터베이스 안내](DATABASE.md) | 데이터는 어떤 테이블에 저장되고 관계는 어떻게 연결되나? |
| [배포와 문제 해결](DEPLOYMENT.md) | 배포에 어떤 설정과 확인이 필요한가? |
| [DB 변경 절차](developer/database-change-procedure.md) | 구조·함수 변경을 어떤 순서로 준비하고 적용하나? |
| [초기 P1 보안 변경 적용 기록](developer/p1-security-rollout.md) | 당시 변경의 적용·검증·복구 절차는 무엇이었나? |
| [요청 제한 운영](operations/rate-limits.md) | 요청 제한 함수와 정리 예약을 어떻게 확인하나? |
| [예약 ID 인덱스 변경](developer/rate-limit-reservation-index.md) | 범위 SQL·카탈로그 검증과 운영 미적용 상태는 무엇인가? |
| [업로드 파일 원장과 정리](operations/markdown-image-ownership.md) | 파일 소유 기록과 사용하지 않는 파일 정리는 어떻게 연결되나? |
| [카카오 로그인 설정](KAKAO-LOGIN-SETUP.md) | 개발·운영 로그인 주소와 제공자 설정을 어떻게 준비하나? |
| [카카오 이메일 동의](operations/kakao-email-consent.md) | 선택 동의 항목을 바꾸기 전에 무엇을 확인하나? |
| [카카오 기존 계정 연결](operations/kakao-legacy-binding.md) | 기존 계정을 안전하게 확인하고 연결하는 절차는 무엇인가? |

## 3. 자료실·보고서·모집

| 문서 | 이 문서로 해결할 질문 |
| --- | --- |
| [자료실 조회 권한](resource-access-policy.md) | 누가 어떤 자료 목록과 상세를 볼 수 있나? |
| [자료 파일 접근 정책](resource-file-access-policy.md) | 파일 다운로드 권한과 Private Blob 이전은 어떻게 확인하나? |
| [보고서 자료실 범위](REPORT-ARCHIVE-SCOPE.md) | 양식 열람·인쇄와 보고서 작성·제출은 어떻게 다른가? |
| [보고서 저장 방식 결정](REPORT-STORAGE-DECISION.md) | DB와 저장소의 기본 문서가 함께 존재하는 이유는 무엇인가? |
| [모집·지원 접수 정책](recruitment-intake-policy.md) | 모집 화면, 지원서, 과거 접수 데이터의 역할은 무엇인가? |
| [모집 설정 한 행 규칙](recruitment-singleton.md) | 모집 설정이 중복되지 않게 하는 제약은 무엇인가? |
| [지원서 질문 편집과 제출](application-form-concurrency.md) | 질문이 바뀌는 동안 제출하면 어떤 결과가 나와야 하나? |

## 4. 학사 G1: 현재 구현과 운영 준비

G1은 첫 학사 기능 묶음으로, 학생·수강 이력, 과제 대상, 개인 파일 제출을 다룬다. 아래 기능에는 구현된 코드와 별도로 공개·쓰기·업로드·삭제 설정이 있다. **홈페이지 ADMIN 역할만으로 학사 운영 승인자가 되는 것은 아니다.**

처음 읽는다면 로드맵의 현재 상태, 제출 범위, 데이터 모델 순서로 읽는다. 구현을 수정할 때 필요한 하위 문서로 내려간다.

| 주제 | 문서 |
| --- | --- |
| 전체 범위와 구현 상태 | [학사 로드맵](ACADEMIC-MANAGEMENT-ROADMAP.md), [개인 과제 제출 범위](ASSIGNMENT-SUBMISSION-SCOPE.md), [데이터 모델](ACADEMIC-DATA-MODEL.md) |
| 학생·수강 관계 | [학생 모델 SQL 적용](developer/academic-students-migration.md), [기존 수강 데이터 연결](developer/academic-enrollment-backfill.md), [학사 명단 관리](developer/academic-roster.md) |
| 과제와 제출 대상 | [과제 모델 SQL 적용](developer/academic-assignments-migration.md), [과제 변경 액션](developer/academic-assignment-actions.md), [관리자 화면](developer/academic-assignment-admin.md) |
| 학생 화면의 입력 데이터 | [학생 조회 계약](developer/academic-student-queries.md), [제출 상태 계산](developer/academic-submission-statuses.md), [학생 화면과 검증 기록](developer/academic-student-ui.md) |
| 파일 업로드와 최종 제출 | [제출 모델 SQL 적용](developer/academic-submissions-migration.md), [업로드·검증·정리](developer/academic-assignment-uploads.md), [최종 제출 확정](developer/academic-submission-finalization.md), [파일 다운로드·삭제](developer/academic-submission-files.md) |
| 운영 확인과 통합 검사 | [로그·지표·기능 설정](developer/academic-observability.md), [G1 통합 품질 검사](developer/academic-g1-quality-gate.md) |
| 결정이 필요한 개인정보 정책 | [보존·파기 정책 초안](ACADEMIC-PRIVACY-RETENTION-POLICY.md) |

정책 초안에 적힌 보존 기간이나 기능 문서의 체크리스트를 승인 완료로 해석하지 않는다. 실제 결과를 기록할 때는 날짜, 코드 버전, 환경, 실행한 명령, 통과·실패·미실행 범위를 함께 남긴다.

## 5. 앞으로의 플랫폼 구조

다음 문서는 웹·Android·iOS 확장의 **목표**다. 현재 파일을 찾으려면 [현재 폴더 안내](GUIDE.md)를 사용한다.

| 문서 | 목적 |
| --- | --- |
| [플랫폼 아키텍처](developer/platform-architecture.md) | 웹·모바일이 같은 기능과 권한 정책을 사용하는 구조 |
| [플랫폼 전환 로드맵](PLATFORM-ROADMAP.md) | 현재 안전장치를 유지하며 구조를 바꾸는 순서 |
| [공용 API v1 계약과 범위](developer/api-v1.md) | OpenAPI 계약 기반 공용 HTTP 엔드포인트와 제공 범위 |
| [모바일 앱 개발 안내](developer/mobile-app.md) | React Native, Expo 모바일 앱 구조, 인증, 파일 전송, 빌드 및 검증 |
| [모바일 인증 HTTP 경계](developer/mobile-auth-routes.md) | 모바일 로그인, 갱신, 로그아웃 엔드포인트 및 요청 제한 정책 |
| [모바일 요청 주체 어댑터](developer/mobile-principal-adapter.md) | API v1 Bearer 토큰 검증, 주체 변환 및 비공개 파일 스트림 |
| [모바일 세션 DB 검토](developer/mobile-session-migration.md) | 모바일 세션 및 리프레시 토큰 이력 스키마, 잠금 및 카탈로그 검토 |
| [모바일 Bearer 실제 서버 검증](developer/mobile-bearer-verification.md) | 실제 HTTP 및 일회성 격리 PostgreSQL 기반 세션, 업로드 하네스 |
| [환경 분리 및 배포 전략](developer/environment-strategy.md) | 개발·검증·운영의 DB·파일·로그인 설정을 분리하는 원칙 |
| [환경변수 계약 목록](developer/environment-inventory.md) | 소스·SDK·운영 명령·QA 입력의 설정 목록과 예시·문서 drift 검사 |
| [검색 색인·canonical 정책](developer/seo-indexing-policy.md) | 환경별 기준 주소·canonical·robots·sitemap 규칙과 별도 운영 확인 |

## 6. 과거 기록과 저장소 공통 문서

아래 과거 기록은 근거를 보존한다. 새 검증 없이 날짜나 성공 수치를 현재 값으로 바꾸지 않는다.

| 문서 | 상태·용도 |
| --- | --- |
| [전체 경로 감사](developer/site-route-audit.md) | 2026-10-17의 특정 코드·합성 환경 검증 기록 |
| [문서별 검토 기록](developer/document-review-ledger.md) | PR #301의 기존 문서별 수정·보존 이유와 코드·운영 경계 |
| [언론 기사 조사](PRESS-ARTICLES.md) | 과거 기사 조사 목록. 등록 전 원문과 현재 링크를 다시 확인 |
| [CHANGELOG](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/CHANGELOG.md) | 이미 기록된 버전 변경 이력 |
| [README](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/README.md) | 저장소에서 처음 만나는 안내 |
| [AGENTS.md](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/AGENTS.md) | 사람과 AI가 함께 지킬 프로젝트 규칙 |
| [GitHub 작업 규칙](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/.github/AGENTS.md) | 이슈·PR·CI 관련 작업의 추가 규칙 |
| [PR 템플릿](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/.github/PULL_REQUEST_TEMPLATE.md) | 리뷰에 필요한 설명과 검증 결과의 형식 |
| [CLAUDE.md](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/CLAUDE.md) | `AGENTS.md`를 참조하는 AI 도구 진입 파일 |

## 7. 사이트에서 사용하는 기본 문서

`content/member/`의 Markdown은 개발 설명서 외에 **사이트 화면에 쓰이는 기본 콘텐츠**이기도 하다. DB의 공개·비공개 규칙과 기존 문서의 메타데이터를 고려해서 수정한다. 자세한 선택 순서는 [보고서 저장 방식](REPORT-STORAGE-DECISION.md)을 따른다.

| 구분 | 기본 문서 |
| --- | --- |
| 사용 안내 | [Markdown 작성](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/guides/markdown-guide.md), [보고서 작성](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/guides/report-writing-guide.md), [보고서 제출](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/guides/submission-guide.md) |
| 보고서 양식 | [고전 독후감](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/templates/classic-book-template.md), [경영 서적 독후감](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/templates/management-book-template.md), [경영 실습](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/content/member/templates/business-practice-template.md) |

운영진이 정한 양식의 항목·순서를 문장 정리만을 이유로 바꾸지 않는다. 제출 위치·마감은 현재 기수와 과제 공지를 우선하며, 안내 문서만 수정해서 새로운 운영 정책을 만들지 않는다.

## 8. 다음 변경에서 문서도 함께 고치는 기준

| 코드·정책 변경 | 함께 확인할 문서 |
| --- | --- |
| 실행 명령·필수 도구 변경 | `package.json`, 시작 안내, README, 품질 검사 |
| 페이지·관리자 메뉴 변경 | 폴더 안내, 화면 수정, 관리자 운영, 관련 사용자 가이드 |
| 테이블·제약·SQL 함수 변경 | DB 안내, 해당 적용 절차, 데이터 모델, 검증·복구 조건 |
| 환경변수·외부 서비스 변경 | `.env.example`, 배포 안내, 해당 운영 절차, 환경 전략 |
| 권한·파일 보관·제출 규칙 변경 | 관련 기능 계약, 접근 정책, 사용자 안내, 운영 승인 기록 |
| CI에서 실행하는 검사 변경 | 품질 검사, 협업·빌드 문서. 파일이 존재하는 것과 CI 실행을 구분 |
| 구현 완료·우선순위 변경 | 해당 로드맵, 추적 이슈. 과거 기록의 성공 수치를 덮어쓰지 않음 |

문서 PR을 마치기 전에 다음을 확인한다.

1. 낯선 용어는 처음 나올 때 풀어 쓰거나 용어집으로 연결한다.
2. 명령은 **어디서**, **어떤 설정으로**, **무엇을 위해** 실행하는지 설명한다.
3. 예상되는 정상 결과와 실패했을 때의 다음 행동을 적는다.
4. 코드에 있는 현재 동작, 목표 구조, 승인 전 정책, 과거 기록을 구분한다.
5. 링크·파일 경로·`npm run` 명령을 확인하고 메뉴에 새 문서를 연결한다.
6. 실행하지 않은 테스트·운영 확인은 미실행으로 기록한다. 비밀값과 개인 자료는 문서에 넣지 않는다.

이 문서 지도에 빠진 새 설명서가 생기면 해당 주제에 링크를 추가한다.

