# 변경 검증과 품질 게이트

코드나 화면을 바꾼 뒤 어떤 검사를 해야 하는지 정할 때 읽는 문서다. **회귀 검사**는 변경 때문에 이전에 되던 기능이 깨지지 않았는지 확인하는 검사이고, **품질 게이트**는 변경을 병합하기 전에 통과해야 하는 검사다. 기능을 작게 확인하는 단위 검사, 여러 서버 구성 요소를 연결하는 통합 검사, 브라우저에서 사용자 흐름을 확인하는 E2E 검사는 각각 확인하는 범위가 다르다.

원래 #20의 보고서 양식·가이드 점검 목록에서 시작한 문서다. 현재 기본 CI의 실제 범위를 먼저 설명하고, 해당 기능을 바꿀 때 필요한 보고서 점검을 뒤에 보존한다. 실행 기준은 `package.json`, `.github/workflows/ci.yml`, `vitest.config.mts`, `playwright.config.ts`이며, 실행 결과는 각 PR·CI 기록에서 따로 확인한다.

## 1. 변경한 범위에서 시작하기

| 변경한 내용 | 먼저 확인할 것 | 함께 볼 문서 |
| --- | --- | --- |
| 문서·안내 문구 | 설명이 현재 코드와 맞는지, 링크·명령·미구현 표시가 정확한지 | [기여 흐름](contributing/workflow.md) |
| 화면·서버 로직 | 관련 회귀 검사와 아래 기본 CI, 실제로 바뀐 사용자 흐름 | 이 문서의 2·3절 |
| 회원·관리자 접근 | 로그인 여부뿐 아니라 허용 역할·거부 역할의 직접 접근 결과 | 이 문서의 4절 |
| 학사 과제·업로드·제출 | 실제 앱·격리 DB·로컬 비공개 저장소를 연결하는 G1 검사 | [G1 품질 게이트](developer/academic-g1-quality-gate.md) |
| DB 구조·함수·제약 | 격리 DB 적용·재실행·기존 데이터 보존·복구 절차 | [DB 변경 절차](developer/database-change-procedure.md) |
| 사이트 전체 경로 | 감사 실행기의 대상 SHA와 결과 분류·확인 한계 | [전체 경로 감사](developer/site-route-audit.md) |

검사는 변경 때문에 남은 위험을 확인하도록 고른다. 예를 들어 문서 링크 수정에 실제 파일 업로드를 실행할 필요는 없지만, 파일 제출 로직을 바꿨다면 화면이 열린다는 확인만으로 끝내지 않는다. 이미 수행한 검사는 범위와 결과를 기록하고, 추가 검사가 필요한 이유가 있을 때 넓힌다.

## 2. 현재 기본 CI가 실행하는 검사

개발·CI의 Node 버전은 `.nvmrc`의 `24.15.0`과 `engines.node`의 `^24.15.0`를 따른다. 빌드의 실제 버전은 로그로 확인하며 현재 운영 Vercel의 런타임 일치 여부는 미확인이다.

`main`에 대한 push와 pull request에서 `.github/workflows/ci.yml`의 한 job이 다음 순서로 실행한다. **기본 CI에는 G1 통합 검사와 브라우저 smoke가 모두 포함되어 있다.**

| 순서 | 명령·단계 | 확인하는 내용 |
| --- | --- | --- |
| 1 | `npm ci` | lock 파일에 맞춰 의존성 설치 |
| 2 | `npm run lint` | ESLint 규칙 검사. 현재 명령에는 경고를 모두 실패로 바꾸는 `--max-warnings=0` 옵션이 없다. |
| 3 | `npm run typecheck` | `tsc --noEmit`으로 타입 오류 검사 |
| 4 | PostgreSQL 준비 후 `npm test` | `HRA_TEST_PG_BIN`으로 임시 DB를 만드는 회귀 검사 포함 |
| 5 | `npm run build` | `prebuild`의 실제 Node 버전 출력과 `next build --webpack` 성공 여부 |
| 6 | `npm run verify:auth-proxy` | 실제 Auth.js·격리 DB 세션으로 역할별 Proxy 응답 확인 |
| 7 | Chromium 설치 | Playwright 브라우저 검사에 필요한 실행 파일 준비 |
| 8 | `npm run verify:editor-preview` | 실제 에디터 미리보기·키보드·Dialog 회귀 검사 |
| 9 | `npm run test:academic-g1` | 실제 Next·credentials 인증·격리 PostgreSQL·Blob SDK·로컬 private HTTP 저장소를 잇는 학사 제출 검사 |
| 10 | `npm run test:e2e -- tests/e2e/ci-smoke.spec.ts --list` | 실행할 smoke 파일·테스트 이름·수집 수를 로그에 남김 |
| 11 | `npm run test:e2e -- tests/e2e/ci-smoke.spec.ts` | 로그인 화면·공개 UI·보호 경로 등 수집된 브라우저 검사 실행 |

**Smoke**는 주요 화면이 열리고 기본 접근 경계가 작동하는지 빠르게 확인하는 검사다. 현재 기본 CI는 `auth-protection.spec.ts`나 개별 학사 `*.spec.ts` 전체를 선택하지 않는다. G1은 전용 실행기가 별도 시나리오를 실행하므로, 일반 Playwright 파일 전체가 통과했다는 뜻으로 해석하지 않는다. G1의 로컬 저장소 검사는 실제 외부 공급자의 업로드·OAuth 로그인을 확인하는 검사와도 구분한다.

`vitest.config.mts` 검색 범위는 `tests/unit/**/*.test.{ts,tsx}`다. `.test.ts`와 `.test.tsx`를 이미 함께 포함하므로 TSX 테스트를 추가하기 위해 설정을 바꿀 필요는 없다. 파일 경로·이름이 패턴과 맞는지 확인하고, 실제 Vitest 출력의 수집 파일과 검사 범위를 기록한다. 수집·skip·통과를 구분하며 테스트 파일 수를 문서의 고정값으로 가정하지 않는다. PostgreSQL 실행 파일이 없으면 일부 DB 검사가 건너뛰어지고, `route-audit-admin-crud.test.ts`처럼 준비 단계에서 실패하는 검사도 있다. DB 준비가 없는 로컬 실행을 전체 단위 검사 통과로 기록하지 않는다.

## 3. 로컬에서 실행하고 결과 기록하기

명령은 프로젝트 루트에서 실행한다. 필요한 Node·PostgreSQL·브라우저 준비는 [개발 환경 준비](getting-started/prerequisites.md)를 따른다. `HRA_TEST_PG_BIN`에는 현재 장비의 `initdb`·`pg_ctl`·`createdb`·`psql`이 있는 디렉터리를 지정한다. Homebrew나 Linux의 설치 경로를 그대로 복사하기 전에 실제 위치를 확인한다.

```bash
npm run lint
npm run typecheck
HRA_TEST_PG_BIN=/실제/PostgreSQL/bin npm test
npm run build
```

학사 G1을 재현할 때는 [전용 실행 절차](developer/academic-g1-quality-gate.md)를 따른다. 이 실행기는 운영 환경 파일이 없는 격리 worktree와 빌드 결과를 요구한다. CI 재현용 DB 주소·인증 키는 워크플로우의 합성 값을 사용하고, 운영 `.env`·DB·Blob·OAuth 자격정보를 가져오지 않는다. 일반 smoke의 기본 Playwright 설정은 `/login`으로 개발 서버 준비를 확인하며 G1의 빌드된 `next start` 실행과 다르다.

PR에는 무엇을 검사했는지와 실제 결과를 함께 적는다.

- 실행한 명령과 대상 커밋·검사 범위, 성공·실패·skip 여부를 기록한다.
- 의존성 설치 제한, PostgreSQL 부재 등으로 실행하지 못한 항목은 이유와 함께 **미실행**으로 적는다. 코드 읽기나 설정 확인을 실행 성공으로 바꾸어 쓰지 않는다.
- 실패 원인이 코드인지 실행 환경인지 구분하되, 환경 실패를 제품 통과로 간주하지 않는다.
- 개인정보·토큰·쿠키·실제 DB 주소·파일 URL·원본 SQL 오류는 공개 증거에 넣지 않는다.

편집기의 진단만 나타난 경우 실제 lint·타입 검사 결과와 대조한다. `Cannot find module` 같은 오류를 예전 캐시 문제라는 이유만으로 무시하지 않는다. 실제 의존성·경로 문제를 확인하고 재실행으로 해소된 것을 확인한다.

## 4. 회원·관리자 보호 경로를 바꿀 때

보호 경로를 추가하거나 옮기면 아래 계층을 함께 확인한다. 이미 넓은 경로 규칙에 포함되는 경우도 있으므로 모든 파일에 같은 분기를 기계적으로 추가하지 않는다.

| 계층 | 확인할 내용 |
| --- | --- |
| `src/proxy.ts`의 `config.matcher` | 새 URL에서 proxy가 실행되는지 |
| `src/lib/auth.ts`의 `authorized` | 해당 로그인·역할 조건에서 실제 응답이 어떻게 결정되는지 |
| layout·page·query·action·API | 직접 호출되어도 해당 데이터·작업의 권한을 독립적으로 검사하는지 |
| 관련 E2E·회귀 검사 | 비로그인, 허용 역할, 거부 역할과 필요한 본인/타인 범위를 실제로 확인하는지 |

기존 주요 prefix는 `/admin`, `/resources`, `/member`, `/mypage`다. 새 API는 URL prefix만으로 보호된다고 가정하지 않고 해당 라우트의 인가도 확인한다. 학사에서는 홈페이지 ADMIN 역할과 지정 학사 승인자가 다르므로 [학사 권한·조회 계약](developer/academic-student-queries.md)을 따른다.

`tests/e2e/auth-protection.spec.ts`를 변경한 경우 이 파일을 별도로 실행한 결과를 기록한다. 기본 CI가 이 파일 전체를 실행하는 것으로 간주하지 않는다. 로그인으로 이동했다는 사실만으로 정상 권한 사용자의 동작이나 모든 하위 데이터 접근까지 검증한 것으로 세지 않는다.

## 5. 보고서 양식·가이드를 바꿀 때의 수동 점검

이 절은 #20에서 시작한 보고서 양식·가이드 기능의 회귀 목록이다. 개인 과제 PDF 제출 기능과는 별개다. 해당 기능이나 콘텐츠를 바꿀 때 합성 데이터로 검사하고, 기존 기록을 현재 버전의 통과 결과로 재사용하지 않는다.

### DB와 관리자 화면

- [ ] [DB 변경 절차](developer/database-change-procedure.md)에 따라 `report_templates`와 `report_template_category`의 실제 구조를 확인한다.
- [ ] `/admin/resources/templates`에서 양식(`template`, `reportCategory` 포함)과 가이드(`guide`)를 등록·수정한다.
- [ ] slug 중복은 검증 메시지를 표시하고 본문·버전·공개 여부 변경은 재조회에 반영한다.
- [ ] slug 변경 시 이전 경로의 캐시와 새 경로를 확인한다.
- [ ] 비공개 확인의 취소·확정과 저장 실패 안내를 확인한다.
- [ ] 비공개 처리한 DB 항목은 같은 slug의 `content/` 시드가 있어도 회원에게 다시 보이지 않는다. 다시 공개하면 조회할 수 있다.

### 회원 화면과 데이터 선택

- [ ] `/resources`에서 해당 양식·가이드로 이동할 수 있다.
- [ ] 같은 slug의 공개 DB 행이 있으면 그 내용을 표시한다.
- [ ] 같은 slug의 DB 행이 아예 없을 때만 `content/member/templates` 또는 `content/member/guides`의 시드 파일을 사용한다.
- [ ] 비공개 DB 행이 있으면 시드로 대체하지 않고 접근할 수 없는 결과를 반환한다.
- [ ] 공개되어야 하는 항목이 DB·시드 모두 없어 의도치 않게 404가 되는지 확인한다. 존재하지 않는 slug의 404는 정상이다.
- [ ] 양식의 마크다운 다운로드, **PDF로 저장** 화면 진입과 인쇄를 확인한다.
- [ ] A4 여백·한글·페이지 분할과 화면 전용 버튼의 인쇄 제외를 확인한다.

데이터 선택 규칙은 `src/lib/markdown/resolve.ts`와 `read-from-content.ts`를 따른다. `source`는 반환 데이터의 `db`/`content` 구분이며, 현재 회원 상세 화면에 이 출처 라벨이 표시된다고 가정하지 않는다.

### 양식 콘텐츠

- [ ] 경영서·고전명작·기업실무 양식 3종의 장 번호 `1.`~`5.`와 빈 장의 양식이 유지되는지 확인한다.
- [ ] 1·2장의 제목·그림·내용·출처 항목이 Markdown 소제목으로 읽히는지 확인한다.
- [ ] 가이드의 항목 기호 순서와 실제 렌더링을 함께 확인한다.

## 6. 병합 판단

필수 CI 실패, Vercel Preview 설치·빌드 실패, 변경과 직접 관련된 회귀 실패, 의도치 않은 접근 허용·거부, 공개되어야 할 콘텐츠의 누락, 인쇄 기능의 한글·페이지 분할 오류는 원인을 해결한 뒤 병합한다. **현재 PR의 마지막 커밋**에 대한 CI와 Preview 결과를 각각 확인하며, 최신 `main` 반영 뒤에는 다시 검사한다. 미실행 검사가 있다면 그 범위와 남은 불확실성을 PR에 드러낸다. 테스트·Preview 빌드 통과만으로 운영 DB 변경이나 실제 OAuth·Blob 동작, 미정 학사 정책·기능 활성화가 승인되는 것은 아니며, 해당 [변경·배포 절차](contributing/build-and-deploy-safety.md)를 함께 따른다.
