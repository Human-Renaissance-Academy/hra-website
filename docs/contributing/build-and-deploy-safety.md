# 빌드·배포 가이드 — 변경을 확인하고 제출하기

개발 화면이 보이는 것, 배포용 파일을 만드는 것, 운영 환경에서 기능이 동작하는 것은 서로 다른 확인입니다. 이 문서는 코드 변경 후 필요한 검사를 실행하고, 실패 원인을 찾고, 결과를 PR에 기록하는 순서를 설명합니다.

## 1. 실행 환경과 변경 범위 확인하기

`package.json`이 있는 저장소 폴더에서 작업합니다. 처음 실행한다면 [개발 환경 설정](../getting-started/clone-and-setup.md)을 먼저 마칩니다.

```bash
git status --short
git diff
node --version
```

[사전 준비](../getting-started/prerequisites.md)에 따라 Node 24를 사용합니다. `.nvmrc`는 `24.15.0`, `engines.node`는 `^24.15.0`이며 nvm 사용자는 `nvm use`로 선택하고 실제 `node --version`을 확인합니다.

변경 파일이 요청한 범위에 맞는지 확인합니다. DB·파일 저장소를 사용하는 검사는 개발·검증용 환경을 준비하며, 운영 자격 증명을 일반 테스트에 연결하지 않습니다.

**빌드(build)**는 배포할 프로그램을 만드는 작업이고, **배포(deploy)**는 그 결과를 서버에서 제공하는 작업입니다. **CI(Continuous Integration)**는 GitHub에서 자동 실행하는 검사입니다.

## 2. 필요한 검사 실행하기

현재 저장소의 기본 명령은 다음과 같습니다.

| 명령 | 확인하는 것 | 결과에서 볼 것 |
| --- | --- | --- |
| `npm run lint` | ESLint가 검사하는 코드 규칙 | 오류 파일·규칙과 종료 상태 |
| `npm run typecheck` | TypeScript 타입 일치 | 타입 오류가 없는지 |
| `npm test` | Vitest에 등록된 테스트 | 통과·실패뿐 아니라 건너뛴 테스트와 준비 조건 |
| `npm run build` | `prebuild`의 실제 Node 버전 출력 뒤 `next build --webpack`으로 결과물 생성 | 실행 버전·빌드 성공 여부와 관련 오류 |
| `npm run test:academic-g1` | 학사 G1의 실제 앱·격리 DB·로컬 파일 저장 검증 | [G1 품질 게이트](../developer/academic-g1-quality-gate.md)의 조건과 결과 |
| `npm run test:e2e -- tests/e2e/ci-smoke.spec.ts` | Playwright의 기본 브라우저 확인 | 로그인 화면·보호 경로 등의 결과 |

**Vitest**는 함수·서버 로직 등을 검사하는 도구이고, **Playwright**는 브라우저를 조작해 사용자 흐름을 검사하는 도구입니다. **E2E(End-to-End)**는 사용자가 시작한 동작이 끝까지 이어지는지 보는 검사입니다.

기본 코드 검사는 순서대로 실행합니다. 실패하면 원인을 수정하고 영향을 받는 검사를 다시 확인합니다.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

`npm ci`는 PR의 `package-lock.json`으로 처음부터 설치할 수 있는지 확인합니다. 의존성을 바꾼 경우 깨끗한 작업 환경에서도 이 단계가 통과해야 합니다. `ERESOLVE`처럼 peer 의존성 충돌이 나오면 오류에 표시된 패키지와 요구 버전을 `package.json`·잠금 파일에서 대조합니다. 예를 들어 React를 갱신할 때는 `react`·`react-dom`과 두 `@types/react*` 패키지를 함께 검토하고, Tiptap을 갱신할 때는 사용하는 `@tiptap/*` 묶음과 `@tiptap/react`가 요구하는 React 범위를 함께 확인합니다. 수정한 잠금 파일로 다시 `npm ci`를 실행합니다. `--force`나 `--legacy-peer-deps`로 설치 오류를 숨기지 않습니다.

2026-10-21에는 [React 갱신 PR #325](https://github.com/Human-Renaissance-Academy/hra-website/pull/325)에서 `react-dom` 19.3.1과 기존 `react` 19.2.4의 peer 불일치로 Preview 설치가 실패했습니다. [Tiptap 묶음 PR #328](https://github.com/Human-Renaissance-Academy/hra-website/pull/328)에서도 한 확장만 3.32.0으로 갱신한 조합의 `npm ci` 실패를 재현했습니다. 두 사례의 해결은 요구 범위에 맞는 관련 패키지를 함께 갱신하고 깨끗한 설치와 실제 Preview 결과를 확인하는 것이었습니다. 이 버전 숫자는 당시 원인 기록이며, 새 갱신의 허용 범위는 그때의 패키지 계약과 설치 로그에서 다시 확인합니다.

DB의 제약이나 동시 요청을 검사하는 테스트에는 로컬 PostgreSQL 실행 파일 등 추가 준비가 필요합니다. 명령이 성공 종료했더라도 관련 테스트가 건너뛰어졌다면 DB 동작까지 검증했다고 기록하지 않습니다. 준비와 검사 범위는 [품질 게이트](../QUALITY-GATE.md)를 따릅니다.

인증·페이지 이동·업로드처럼 브라우저 동작을 바꿨다면 관련 E2E 파일과 실제 화면도 확인합니다. 전체 `npm run test:e2e`를 실행하기 전에 각 테스트의 계정·DB·Blob 조건을 확인합니다. 모든 E2E가 운영 비밀값 없이 같은 방식으로 실행되는 것은 아닙니다.

### 현재 CI 범위

`.github/workflows/ci.yml`은 `main` 대상 PR과 `main` 푸시에서 lint·typecheck·격리 PostgreSQL을 준비한 Vitest·build를 실행합니다. 빌드 뒤 Proxy 인증 경계 HTTP 검사, Chromium 설치, 에디터 미리보기 키보드 회귀와 **별도 학사 G1 검증**을 실행합니다. 일반 브라우저 검사는 `ci-smoke.spec.ts`의 수집 목록을 남긴 뒤 실행합니다. 모든 E2E 파일을 기본 CI에서 실행하는 설정은 아닙니다.

Vitest 설정은 `tests/unit/**/*.test.{ts,tsx}`를 수집하므로 TSX를 위해 별도 설정을 추가하지 않습니다. 실제 수집·skip·성공 범위는 실행 로그로 확인합니다.

CI는 이 검증에 운영 DB·Blob 자격 증명을 전달하지 않습니다. Node 24 설정과 실제 실행 버전 확인 방법은 [사전 준비](../getting-started/prerequisites.md)에 정리되어 있습니다.

기본 CI 밖의 공개 홈·검색 기록·모바일 달력·키보드 탐색·Hero 모션·FAQ 접근성 24건은 별도 [확장 E2E 회귀](../developer/expanded-e2e-quality-gate.md)에서 예약·수동 실행합니다. 확장 작업은 기존 G1 10개 필수 사례도 재실행합니다. 선택하지 않은 spec과 실제 OAuth/Blob 공급자는 해당 안내의 제한 범위를 따르며, 기본 CI가 모든 E2E를 실행하는 것으로 표현하지 않습니다.

`prebuild`의 Node 버전 로그는 해당 빌드의 실행 버전 증거이며, 현재 운영 Vercel 배포의 런타임이 이미 일치한다는 증거는 아닙니다. 운영 일치 여부는 미확인으로 남깁니다.

형식·릴리스 설정을 바꿨다면 [릴리스 운영](releasing.md)의 Node 테스트와 설정 검사도 확인합니다.

## 3. 로컬 Git 훅 확인하기

**훅(hook)**은 Git 작업 직전에 실행하는 검사입니다. 현재 저장소에는 다음 두 훅이 있습니다.

| 시점 | 파일 | 실행 명령 | 실패 시 |
| --- | --- | --- | --- |
| 커밋 전 | `.husky/pre-commit` | `npm run typecheck` | 커밋을 중단합니다. |
| 푸시 전 | `.husky/pre-push` | `npm run build` | 푸시를 중단합니다. |

정상 설치 과정에서는 `package.json`의 `prepare` 스크립트가 Husky를 설정합니다. 하지만 설치 스크립트가 비활성화된 환경이나 별도 Git 설정에서는 동작하지 않을 수 있으므로, 훅이 있다는 이유로 검사 성공을 가정하지 않습니다.

동작하지 않으면 의존성 설치가 완료되었는지와 Git 훅 설정을 확인한 뒤 프로젝트에 등록된 명령으로 다시 설정합니다.

```bash
git config --get core.hooksPath
npm run prepare
```

계속 실패하면 설정과 오류를 담당자에게 전달합니다. `--no-verify`로 검사를 우회하지 않습니다. 로컬 빌드는 Vercel 배포와 유사한 문제를 찾는 데 도움이 되지만, Node.js·환경 변수·외부 서비스가 다를 수 있어 **Vercel과 완전히 동일한 검증은 아닙니다**.

## 4. 자주 만나는 코드 문제

### 페이지의 비동기 값 읽기

**Promise**는 나중에 준비될 값을 나타냅니다. 현재 Next.js 16에서 페이지의 `params`와 `searchParams`는 Promise이며, 서버 컴포넌트에서는 `await`로 읽습니다.

```tsx
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  return <p>검색어: {query}</p>;
}
```

동적 주소 `[id]`의 값도 같은 방식으로 읽습니다.

```tsx
export default async function DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <p>항목 ID: {id}</p>;
}
```

이 규칙을 모든 컴포넌트의 모든 속성에 확대하지 않습니다. `children`이나 직접 정의한 일반 속성이 자동으로 Promise가 되는 것은 아닙니다. URL 입력은 문자열 배열이거나 잘못된 값일 수도 있으므로 `await` 이후에도 기능에 맞게 검증합니다. 자세한 계약은 [Next.js 페이지 공식 문서](https://nextjs.org/docs/app/api-reference/file-conventions/page)를 참고합니다.

### JSX 괄호 맞추기

**JSX**는 TypeScript 안에서 화면 구조를 작성하는 문법입니다. 조건부 화면을 추가할 때는 괄호와 태그가 맞는지 확인합니다.

```tsx
{articles.length > 0 && (
  <section>
    <h2>언론보도</h2>
  </section>
)}

{totalPages > 1 && (
  <nav aria-label="페이지 이동">
    {/* 페이지 이동 버튼 */}
  </nav>
)}
```

`Unexpected token`이나 `Expression expected`가 나오면 표시된 줄뿐 아니라 직전 블록의 여는·닫는 괄호와 태그를 함께 봅니다.

### 타입 오류를 숨기지 않기

서버 검증은 프로젝트 규칙인 `import { z } from "zod/v4"`를 사용합니다. 이는 이 저장소의 통일된 사용 경로입니다. 다른 import가 있다는 사실만으로 특정 컴파일 오류의 원인을 단정하지 않습니다.

`as any`, `@ts-ignore`, `@ts-expect-error`는 사용하지 않습니다. 형태를 모르는 데이터에 임의 타입을 붙이는 것도 실제 입력 검증은 아닙니다. [코드 규칙](conventions.md)의 `unknown`·Zod 검증 예시를 참고합니다.

## 5. 실패 원인 찾기

터미널 출력에서 **처음 원인을 설명하는 오류와 파일·행 번호**를 찾습니다. 마지막 줄은 실패 요약일 수 있습니다.

| 오류 일부 | 확인할 가능성 |
| --- | --- |
| `is missing ... then` | Promise로 선언해야 하는 값을 일반 객체로 선언했는지 |
| `searchParams` 관련 오류 | 비동기 읽기와 실제 입력값·배열·누락 처리 |
| `Unexpected token`, `Expression expected` | JSX·괄호·태그·직전 문장의 문법 |
| `Cannot use await in non-async function` | 해당 코드가 서버의 async 함수인지, 클라이언트 코드인지 |
| `Type X is not assignable to type Y` | 호출부와 반환값의 타입, 누락 가능한 값 |
| `Module not found` | 파일 경로·대소문자·설치 결과·직접 의존성 선언 |
| `npm ci`의 `ERESOLVE` 또는 잠금 파일 불일치 | React·React DOM·타입 정의, Tiptap 묶음 등 직접/peer 의존성의 호환 범위와 잠금 파일 |
| DB 연결·함수 없음 | 대상 환경과 테이블·추가 SQL 준비 상태 |
| 로컬 통과·CI 실패 | 실행 버전, 필요한 도구, 환경 변수, 실행한 검사 범위 차이 |

도움을 요청할 때는 실행 명령, 코드 버전, 재현 순서, 민감한 값을 지운 오류와 시도한 해결책을 적습니다. 로그 전체에 DB 주소·토큰·개인정보가 있는지 확인하지 않고 공개 검색이나 이슈에 붙이지 않습니다.

## 6. PR과 배포 후 확인

PR에는 실행한 검사와 실제 결과를 적습니다. 실행하지 못했다면 이유와 필요한 환경을 적고 통과로 표시하지 않습니다. 문서만 수정했다면 내용·명령·링크·문서 빌드 등 무엇을 확인했는지 구체적으로 기록합니다.

병합 전에 **현재 PR의 마지막 커밋**에서 필수 GitHub CI와 Vercel Preview 배포가 각각 성공했는지 확인합니다. 이전 커밋의 성공이나 로컬 빌드 성공을 새 커밋의 결과로 옮기지 않습니다. 최신 `main`을 다시 반영하거나 의존성·코드를 수정했다면 두 검사의 새 실행 결과를 기다립니다. Preview 설치·빌드가 실패하면 먼저 그 배포의 커밋과 로그에서 실패한 단계를 찾고, 원인을 고친 뒤 같은 새 커밋의 CI와 Preview를 재확인합니다. 실패한 Preview를 남긴 채 다음 PR을 병합 대상으로 넘기지 않습니다.

Vercel이 `Deployment rate limited — retry in 24 hours`처럼 배포 횟수 제한을 알리면 재배포·의미 없는 수정 푸시·후속 PR 병합 시도를 중단합니다. PR에는 제한 메시지, 현재 커밋, 마지막으로 **CI와 Preview가 함께 성공한 커밋**, 재시도 가능한 시각을 기록합니다. 마지막 성공 커밋은 현재 커밋의 성공 증거가 아닙니다. 제한이 풀린 뒤 현재 커밋의 Preview를 다시 확인하고, 그 사이 코드나 `main`을 반영했다면 새 커밋의 CI와 Preview를 모두 확인한 다음 병합합니다.

PR을 한 건 병합한 뒤에는 **새 `main` 병합 커밋의 Production 배포 성공**을 확인하고 다음 PR을 갱신·푸시합니다. PR Preview가 성공했어도 병합 커밋의 Production 배포는 별도 실행입니다. Production 상태가 대기·실패·횟수 제한이면 다음 PR의 푸시와 병합을 멈추고 현재 `main` 커밋과 마지막 Production 성공 커밋을 구분해 기록합니다. 2026-10-21에는 PR #326의 Preview·CI가 통과한 뒤 병합된 `15665df`의 Production 배포가 횟수 제한에 걸렸고, 직전 성공 배포의 커밋은 `b0d5d0d`였습니다. 이 수치는 당시 기록이며 이후 배포 상태를 대신하지 않습니다.

Preview의 **빌드 성공**은 배포용 앱 생성의 증거입니다. 실제 OAuth 로그인, DB 연결·변경, Blob 업로드, 예약 작업, 운영 환경변수 일치는 별도 확인입니다. Preview 자원 격리는 아직 [#279](https://github.com/Human-Renaissance-Academy/hra-website/issues/279)의 확인 대상이므로, 연결 대상을 확인하기 전에는 실제 개인정보나 운영 파일로 기능 검사를 하지 않습니다. 환경별 절차는 [배포 안내](../DEPLOYMENT.md)를 따릅니다.

리뷰는 [AGENTS.md §11](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/AGENTS.md)의 도구와 무관한 변경 위험 기준을 따릅니다. 인증·DB·보호 파일·배포 경계와 해당 운영 절차 안내는 문서 한 파일이어도 병합 전 분야 독립 리뷰가 필요합니다. 기존 빌드·CI·배포 확인 절차는 유지합니다.

CI와 리뷰를 확인한 뒤 [협업 절차](workflow.md)에 따라 병합합니다. 실제 배포는 [배포 안내](../DEPLOYMENT.md)를 따르고, 배포된 주소에서 변경 기능·권한·외부 서비스 연결을 확인합니다. DB 변경이나 운영 확인이 남아 있다면 PR의 병합만으로 이슈를 닫지 않습니다.

## 과거 작업 기록: 반복된 배포 실패

기존 문서에는 2026-05-08~09 공지사항·언론보도 페이지네이션 작업에서 배포 실패와 수정 푸시가 11회 이어졌다고 기록되어 있습니다. 당시 기록은 `searchParams`의 Promise 처리와 JSX 괄호 문제, 로컬 빌드 확인 누락을 원인으로 설명합니다.

아래 커밋 목록은 당시 문서의 이력으로 보존합니다. 이번 문서 검토에서 각 배포 로그나 사용자 영향까지 다시 확인한 것은 아닙니다.

```text
5f11df9  fix: press pagination closing bracket
5019a0f  fix: resolve build errors
8f04e33  fix: press pagination syntax
6c9ce26  fix: press pagination syntax
6db8958  fix: recruitment apply page props type
df643d6  fix: searchParams undefined issue
072cb46  fix: press pagination and searchParams
06dda16  fix: press pagination and searchParams
d0f9dfc  fix: press pagination and searchParams
b5a09f7  fix: press pagination and searchParams
5f4ac2d  fix: recruitment searchParams type
```

이 기록을 현재 모든 배포 실패의 원인으로 일반화하지 않습니다. 개발 화면, 타입·테스트·빌드, CI, 배포 후 실제 동작을 각각 확인하는 절차를 유지합니다.

