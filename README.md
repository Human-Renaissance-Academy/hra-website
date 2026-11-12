# HRA 웹사이트 개발 안내

HRA(Human Renaissance Academy)의 프로그램 소개, 회원 자료실, 관리자 화면을 운영하는 프로젝트입니다. 학생 명부와 개인 과제 제출을 위한 학사 기능도 코드에 포함되어 있습니다.

개발을 전공하지 않은 참여자도 **무엇을 수정할지 찾고, 내 컴퓨터에서 확인한 뒤, 다른 사람의 검토를 받아 반영하는 과정**을 따라갈 수 있도록 문서를 구성했습니다.

- [개발 문서 시작 페이지](docs/index.md)
- [웹사이트](https://hra-website-theta.vercel.app)
- [문서 사이트](https://human-renaissance-academy.github.io/hra-website/)
- [전체 작업 우선순위](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)

## 1. 지금 구현된 것과 앞으로 할 것

| 구분 | 코드에 있는 기능 | 사용할 때 확인할 조건 |
| --- | --- | --- |
| 공개 웹사이트 | 소개, 모집, 공지, 언론보도, 갤러리, 수료생 이야기, FAQ | 관리자가 공개한 콘텐츠와 모집 설정 |
| 로그인과 회원 자료 | Google·Kakao·비밀번호 로그인, 회원 승인, 자료실, 보고서 양식·가이드 | 계정 역할과 자료별 권한. 로그인만으로 모든 자료를 볼 수 있는 것은 아님 |
| 홈페이지 관리 | 콘텐츠·회원·지원서 관리 | 홈페이지 관리자 권한 |
| 학사 G1 | 학생 명부, 검증된 계정 연결, 과제 공개, 개인 PDF 제출, 제출 현황, 비공개 파일 다운로드 | 별도 기능 설정, DB 적용, 지정된 학사 운영 책임자, 운영 정책 확인 |
| 학사 G2/G3 | 출결, 교수 과제 피드백, 수료 처리의 설계 문서 | 후속 구현과 정책 결정이 필요 |
| Android·iOS | 서버 인증·API v1 이중 전송 및 모바일 앱(MVP 화면·테스트·디버그 APK) 구현 | 미출시 상태. 운영 DB 적용, 독립 보안 검토, 실기기 E2E 및 릴리스 배포 필요 |

**코드가 있다는 사실과 운영에서 사용할 준비가 끝났다는 사실은 다릅니다.** 학사 설정은 `.env.example`에서 기본 비활성이며, 실제 배포 환경의 상태는 운영 담당자가 별도로 확인합니다. 학사 단계는 [학사관리 로드맵](docs/ACADEMIC-MANAGEMENT-ROADMAP.md), 모바일 계획은 [플랫폼 전환 로드맵](docs/PLATFORM-ROADMAP.md)을 참고하세요.

## 2. 내 작업에 맞는 읽기 순서

| 하려는 일 | 먼저 읽을 문서 | 다음 문서 |
| --- | --- | --- |
| 처음 프로젝트 실행하기 | [사전 준비](docs/getting-started/prerequisites.md) | [코드와 설정 준비](docs/getting-started/clone-and-setup.md) → [첫 실행](docs/getting-started/first-run.md) |
| 코드가 어떻게 연결되는지 이해하기 | [화면부터 DB까지 따라가기](docs/getting-started/project-tour.md) | [폴더별 역할](docs/GUIDE.md), [용어집](docs/getting-started/glossary.md) |
| 문구·화면·기능 수정하기 | [수정 위치 찾기](docs/CUSTOMIZATION.md) | [협업 절차](docs/contributing/workflow.md) → [검증과 배포 구분](docs/contributing/build-and-deploy-safety.md) |
| 관리자 화면으로 콘텐츠 운영하기 | [관리자 안내](docs/ADMIN-GUIDE.md) | [자료 접근 정책](docs/resource-file-access-policy.md) |
| DB·배포 설정 다루기 | [환경 분리](docs/developer/environment-strategy.md) | [DB 변경 절차](docs/developer/database-change-procedure.md) → [배포 안내](docs/DEPLOYMENT.md) |

찾는 문서가 보이지 않으면 [전체 문서 지도](docs/documentation-map.md)를 사용하세요. 처음부터 모든 설계 문서를 읽을 필요는 없습니다.

## 3. 처음 실행할 때

상세 절차는 시작 안내 세 문서가 담당합니다. 아래는 전체 순서입니다.

1. Node.js, Git, 편집기를 준비합니다. 이 프로젝트는 지원 중인 LTS인 **Node.js 24.x**를 사용합니다. `.nvmrc`와 `package.json`의 `engines.node`가 기준입니다.
2. 저장소를 내려받고, 버전이 기록된 `package-lock.json`을 기준으로 의존성을 설치합니다.

   ```bash
   git clone https://github.com/Human-Renaissance-Academy/hra-website.git
   cd hra-website
   node --version
   npm ci
   ```

   nvm을 사용한다면 설치 전에 `nvm install` → `nvm use`로 `.nvmrc`의 24를 선택합니다. `node --version`은 `v24.`로 시작해야 합니다. **운영 Vercel의 실제 런타임 일치 여부는 미확인**이며, 실행 환경 확인은 [사전 준비](docs/getting-started/prerequisites.md)를 따릅니다.

3. `.env.example`을 `.env`로 복사하고 **개발용** DB·인증 설정을 준비합니다. 운영 DB·Blob·OAuth 자격 증명은 개발용으로 복사하지 않습니다.
4. [첫 실행 안내](docs/getting-started/first-run.md)에 따라 DB 준비 여부를 확인하고 개발 서버를 실행합니다.

   ```bash
   npm run dev
   ```

5. 터미널에 표시된 로컬 주소를 엽니다. 홈 표시, 로그인, 보호 화면의 접근 결과는 각각 확인합니다. 홈 하나가 보인다고 모든 기능의 준비가 끝난 것은 아닙니다.

`db:push`는 현재 DB에 접속하지 않고 실패 종료합니다. SQL 생성·별도 적용은 [DB 변경 절차](docs/developer/database-change-procedure.md)를 따릅니다. `seed-admin`은 데이터를 쓰므로 첫 실행을 위해 무조건 실행하지 말고 지정된 개발 DB의 상태와 해당 안내를 확인합니다.

## 4. 수정하고 확인하는 기본 흐름

**이슈 → 작업 브랜치 → 수정 → 검증 → Pull Request(PR) → 리뷰와 병합 → 배포 확인** 순서로 진행합니다. 브랜치는 작업을 분리하는 이름이고, PR은 변경을 검토받는 요청입니다.

| 명령 | 확인하는 것 | 통과해도 별도로 확인할 것 |
| --- | --- | --- |
| `npm run lint` | 코드 규칙과 정적 오류 | 실제 화면·권한 동작 |
| `npm run typecheck` | 값과 함수의 타입이 맞는지 | DB에 필요한 테이블·함수가 적용됐는지 |
| `npm test` | Vitest 테스트에 정의한 동작 | 테스트에 포함되지 않은 사용 흐름 |
| `npm run build` | 배포용 앱을 만들 수 있는지 | 실제 배포 환경 설정과 배포 후 응답 |
| `npm run test:e2e` | Playwright 브라우저 테스트 | 실행 환경과 선택한 테스트의 범위 |
| `npm run test:academic-g1` | 격리 DB·앱·저장소를 사용하는 학사 G1 검증 | 운영 데이터·스토리지 이행과 운영 승인 |
| `npm run issues:check` | 열린 이슈의 제목·본문·라벨 형식 | 이슈 내용의 사실성과 완료 여부 |

현재 CI는 일반 브라우저 smoke 검사와 별도의 G1 검증을 사용합니다. 모든 E2E 파일이 항상 실행되는 것은 아닙니다. 설치 도구, 테스트 DB 등 준비 조건은 [품질 확인 안내](docs/QUALITY-GATE.md)에서 확인하세요.

검증에 실패하면 오류가 난 단계와 재현 순서를 PR에 적습니다. 실제 비밀번호, 토큰, 학생 자료, 세션 쿠키는 붙여 넣지 않습니다.

## 5. 현재 코드의 위치

| 위치 | 역할 | 수정 예 |
| --- | --- | --- |
| `src/app/` | URL에 대응하는 페이지와 API 진입점 | 페이지 구성, 요청·응답 연결 |
| `src/components/` | 여러 화면에서 쓰는 부품 | 버튼, 입력창, 에디터, Markdown 표시 |
| `src/features/` | 공지·자료·학사 등 기능별 처리 | 입력 검증, 서버 액션, 서비스 |
| `src/lib/` | 인증, DB 연결, 파일 저장 등 공통 처리 | 공통 권한·파일·오류 처리 |
| `src/lib/db/schema.ts` | DB 테이블·관계의 코드 정의 | 필드와 관계를 바꿀 때 확인 |
| `apps/mobile/` | React Native, Expo 모바일 앱 (독립 npm 프로젝트) | 모바일 화면, 네이티브 설정, 전용 테스트 |
| `packages/contracts/` | 공용 HTTP 계약 (OpenAPI 3.1.1 JSON 및 타입) | 공용 API 규격 정의 및 클라이언트 타입 동기화 |
| `scripts/` | DB 준비, 운영 점검, 검증 도구 | 실행 전에 읽기/쓰기 여부 확인 |
| `tests/` | 단위·통합·브라우저 테스트 | 수정한 동작의 회귀 확인 |
| `docs/` | 사용법, 개발 절차, 정책·설계 | 코드 변경과 함께 관련 안내 갱신 |
| `content/member/` | 보고서 양식·가이드의 내장 기본본 | DB에 해당 항목이 없을 때의 기본 내용 |

`scripts/`는 `src/` 안이 아니라 **저장소 최상위**에 있습니다. `apps/mobile/`은 루트 의존성과 격리된 독립 Expo 프로젝트이며, 웹의 `apps/web` 전환 및 서버 모듈화는 [플랫폼 아키텍처](docs/developer/platform-architecture.md)의 단계별 목표를 따릅니다. 신규·재편 기능은 해당 설계의 서비스/저장소 경계를 따릅니다.

## 6. 데이터와 권한을 다룰 때

글과 메타데이터는 PostgreSQL DB에, 이미지·파일 원본은 Vercel Blob에 저장합니다. 보고서 양식·가이드는 DB 항목을 먼저 사용하고, 해당 항목 자체가 없을 때만 `content/member/`의 기본본을 사용합니다. DB에서 비공개로 바꾼 항목을 기본본으로 다시 공개하지 않습니다.

회원 역할은 `PENDING`(승인 대기), `MEMBER`(회원), `FACULTY`(교수진), `ADMIN`(홈페이지 관리자)입니다. 자료 종류·소속·파일 소유 관계에 따른 추가 검사가 있습니다. **홈페이지 관리자 역할과 학사 운영 승인자는 서로 다른 권한**입니다.

DB나 파일 저장 방식을 바꿀 때는 [DB 안내](docs/DATABASE.md), [자료 파일 접근 정책](docs/resource-file-access-policy.md), [학사 데이터 모델](docs/ACADEMIC-DATA-MODEL.md)을 함께 확인합니다. 이미 발표된 보안 공지의 후속 수정은 [전체 우선순위](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)에 따릅니다.

## 7. 버전과 문서의 기준

실제 설치 버전은 `package.json`과 `package-lock.json`, 실제 검증 명령은 `package.json`의 `scripts`, DB 구조는 `schema.ts`와 별도 SQL을 함께 확인합니다. README의 소개만 보고 의존성이나 DB를 임의로 갱신하지 않습니다.

이 안내는 2026-10-18에 정비를 시작했고 2026-10-21에 설치·CI 명령을 다시 대조했습니다. 특정 날짜의 테스트 결과는 당시 기록이며, 운영 설정 확인과 향후 기능 완료 여부는 각 추적 이슈에 남깁니다. 문서를 고칠 때의 확인 항목은 [문서 지도와 유지 방법](docs/documentation-map.md)에 있습니다.

