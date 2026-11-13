<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HRA Platform — Agent Rules

## 1. 언어 규칙

이 사이트는 **한글(Korean)** 사이트입니다.

- `<html lang="ko">` 설정 완료
- 영어 UI 텍스트 사용 금지 — 사용자에게 보이는 모든 문자열은 한국어
- 코드 주석은 **한국어**로 자세히 작성 (기존 파일 스타일 참고: `admin-shell.tsx`, `schema.ts`)
- 변수명, 파일명, 함수명은 영어 유지

## 2. 기술 스택

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (NOT v3 — `@import "tailwindcss"` 사용, `tailwind.config.js` 없음)
- **shadcn/ui v4** — `@/components/ui/`
- **Drizzle ORM** + **Neon Postgres** — `src/lib/db/schema.ts`
- **NextAuth v5 beta** — credentials + 소셜 로그인
- **Vercel Blob** — 이미지/파일 업로드 (`import { del, put } from "@vercel/blob"`)
- **Zod v4** — `import { z } from "zod/v4"` (NOT `"zod"`)

## 3. 프로젝트 구조

```
src/
├── app/
│   ├── (public)/         # 공개 페이지 (소개, 커리큘럼, 교수진, 기수, 모집, 공지, 언론보도, 갤러리, 수료생, FAQ)
│   ├── (auth)/           # 로그인 페이지
│   ├── (admin)/admin/    # 관리자 전용 (CRUD 관리)
│   └── (member)/         # 로그인 필요 (자료실, 마이페이지, 본인 과제; 기능별 추가 인가)
├── features/             # 비즈니스 로직 — 서버 액션 (CRUD)
│   ├── alumni/actions/
│   ├── faculty/actions/
│   ├── gallery/actions/
│   ├── notices/actions/
│   ├── press/actions/
│   ├── recruitment/actions/
│   ├── recruitment-settings/actions/
│   ├── report-templates/actions/
│   ├── users/actions/
│   └── ...
├── lib/
│   ├── db/schema.ts      # Drizzle 스키마 진입점 (테이블 정의·학사 모델 재수출)
│   ├── db/index.ts       # DB 연결
│   ├── admin.ts          # requireAdmin() — 관리자 권한 확인
│   └── utils.ts          # cn() 등 유틸리티
├── components/
│   ├── ui/               # shadcn/ui 컴포넌트
│   ├── layout/           # header.tsx, footer.tsx
│   └── admin/            # 관리자 전용 컴포넌트
```

### 목표 아키텍처 전환 규칙

현재 디렉터리 구조는 #277 전환 전의 legacy 구조다. 신규 기능과 구조 개편 대상은 [플랫폼 아키텍처](docs/developer/platform-architecture.md)를 따른다.

- 목표: **API-first modular monolith + monorepo**
- 클라이언트: `apps/web`(Next.js) + `apps/mobile`(React Native + Expo, Android/iOS 공통)
- 서버 핵심 로직: Application Service
- DB 접근: Repository/infrastructure가 소유
- 공용 HTTP 계약: `/api/v1` + OpenAPI
- 운영 전용 API: `/api/internal`
- Web Server Action과 API route는 같은 Application Service를 호출한다.
- 신규/리팩터링 대상 Page·Server Action·API route에서 Drizzle/DB를 직접 호출하지 않는다.
- DB row 타입을 API DTO로 그대로 노출하지 않는다.
- Web UI와 React Native UI를 강제로 공유하지 않는다. contract/schema/pure utility/design token만 선택적으로 공유한다.
- Android/iOS 별도 앱을 만들지 않는다. 하나의 React Native 코드베이스를 유지한다.
- Microservice, 메시지 브로커, 분산 트랜잭션은 실제 독립 확장 요구가 생기기 전까지 도입하지 않는다.
- 기존 학사 DB 제약·인가·Private Blob·rate limit·audit·통합 테스트를 구조 개편 편의를 위해 완화하지 않는다.
- `apps/mobile`은 루트 typecheck와 lint에서 제외된 독립 npm 프로젝트로 존재하며, 모바일 토큰은 `/api/v1` 어댑터([모바일 요청 주체 어댑터](docs/developer/mobile-principal-adapter.md))에서만 수용한다.

> untouched legacy 코드는 #271에서 module 단위로 이동하기 전까지 기존 경로를 유지할 수 있다. 새 코드는 legacy 직접 DB 패턴을 복제하지 않는다.

## 4. 데이터 저장 방식

**원칙: "관리자가 수정하는 텍스트·메타데이터는 DB, 이미지·파일 원본은 Blob"**

보고서 양식·가이드는 예외적으로 DB 우선 조회 후 해당 항목 자체가 없을 때 `content/member/`의 내장 기본본을 사용한다. DB의 비공개 항목은 기본본으로 다시 공개하지 않는다. [저장 정책](docs/REPORT-STORAGE-DECISION.md)을 따른다.

| 콘텐츠 | 저장 방식 | 비고 |
|--------|----------|------|
| 교수진, 기수, 모집설정 | DB (Neon Postgres) | |
| 공지사항 | DB | Markdown 본문은 text 컬럼 |
| 언론보도 | DB | |
| 갤러리 메타 | DB | 이미지는 Vercel Blob |
| 모집 포스터 이미지 | Vercel Blob | 관리자 페이지에서 업로드 |
| 수료생 이야기 | DB | |
| FAQ 연락처 | DB | |
| 자료실 | DB | 파일은 Vercel Blob |
| 지원서, 회원 | DB | |

### 회원 역할 (Role)

- **ADMIN**: 홈페이지 관리자 (콘텐츠·회원 관리). 학사 운영 권한은 별도로 지정된 승인자 인가를 따른다.
- **FACULTY**: 교수진 (공동 자료실 열람·작성 및 강의자료(`classMaterials`) 업로드 가능). 학사의 본인 과제 경로는 MEMBER 전용이며 학사 인가는 별도다.
- **MEMBER**: 일반 멤버 (로그인 후 자료실 접근 가능, 본인 기수의 주차별 텍스트·수업일지 업로드 가능)
- **PENDING**: 승인 대기 (로그인 가능하나 자료실 접근 불가, 관리자 승인 필요)

> 권한 매트릭스 (근거: `src/features/class-materials/actions/index.ts:108`, `src/features/weekly-texts/actions/index.ts:286`, `src/features/class-logs/actions/index.ts:195`, `src/lib/auth.ts:250-259`)
>
> | 역할 | 자료실 접근 | 강의자료 업로드 | 주차별 텍스트 업로드 | 수업일지 업로드 |
> |---|---|---|---|---|
> | ADMIN | ✅ | ✅ | ✅ | ✅ |
> | FACULTY | ✅ | ✅ | ✅ | ✅ |
> | MEMBER | ✅ | ❌ | ✅ | ✅ |
> | PENDING | ❌ | ❌ | ❌ | ❌ |

### 학사관리 G2 역할 구분 (설계 중, 구현되지 않음)

> HRA 운영 사실(2026-10-13 확인): **교수는 출결을 담당하지 않는다. 각 수업에는 어드바이저(Advisor)라는 운영 담당자가 있다.**
>
> - `faculty` 및 `schedule_sessions.facultyId`는 수업 내용 담당 교수 정보를 나타내며, **출결 조회·입력·정정 인가의 근거가 아니다.** `FACULTY` 역할만으로 출결 관리 권한을 주지 않는다.
> - 수업 운영 인력은 **어드바이저 1명과 조교 2명**이고 **세 사람이 돌아가며 출결을 체크한다.** 기수마다 다른 사람이 맡고 기수 안에서는 고정 배정이지만, 조교는 학기 중에 바뀔 수 있고 향후 역할도 바뀔 수 있다.
> - 이들을 관리하는 담당자는 홈페이지 관리자(`ADMIN`)와 **다른 사람**이다. **`ADMIN` 은 홈페이지만 관리한다** — `ADMIN` 역할만으로 출결·학사 운영 권한을 부여하지 않는다. 학사 운영 관리 권한의 범위는 미정(#143).
> - 출결은 **해당 기수의 유효한 어드바이저·조교 배정**과 검증된 로그인 계정으로 인가한다. 기존 `users.role`에 해당 전역 역할은 없으며, 기수별 업무 배정과 전역 사용자 역할 신설은 별도 결정이다.
> - 운영 인력 배정·교체·출결 정정/승인·학사 운영 관리자의 권한은 [#143](https://github.com/Human-Renaissance-Academy/hra-website/issues/143) 정책에 따르고, 구현은 [#165](https://github.com/Human-Renaissance-Academy/hra-website/issues/165) 및 #159/#160을 통해 진행한다.
> - 교수의 담당 수업/과제 검토 기능은 별도 #161/#162. 기존 일정/공동 자료를 개인별 출결 기록으로 재해석하지 않는다.
> - 설계 정본: [학사관리 로드맵](docs/ACADEMIC-MANAGEMENT-ROADMAP.md), [데이터 모델](docs/ACADEMIC-DATA-MODEL.md). **현재 학사관리 출결 기능이 구현되었다는 뜻이 아니다.**

## 5. 코딩 패턴

### 서버 액션 패턴

기존 `src/features/*/actions`에는 Server Action이 DB를 직접 호출하는 코드가 남아 있지만 **신규/리팩터링 코드는 이 패턴을 복제하지 않는다.**

Web Server Action과 `/api/v1` Route는 같은 Application Service를 호출한다. Service는 Repository를 통해 PostgreSQL에 접근한다. 웹 서버 내부의 service 호출에 HTTP 요청을 강제하지 않는다.

Server Action의 책임은 입력 변환, Web session→Principal, service 호출, `revalidatePath`/redirect 같은 Web 전용 후처리다. 비즈니스 규칙과 transaction은 service/repository 쪽에 둔다.

검증은 contract/application 입력에서 수행하고, 서버 전용 검증은 `zod/v4`를 유지한다. 클라이언트와 공유할 순수 schema는 향후 `packages/schemas` 경계로 이동할 수 있다.

### 공개 페이지 패턴

legacy Page의 직접 DB 조회는 #271 전환 대상이다. 신규/리팩터링 Page는 DB/Drizzle을 직접 import하지 않고 module query/service를 호출한다.

```typescript
const notices = await listPublishedNotices(/* ... */);
```

Web page는 presentation과 Web cache/metadata에 집중한다.

### 관리자 페이지 패턴
```
src/app/(admin)/admin/[feature]/
├── page.tsx              # 목록 (Table + 삭제/편집 버튼)
├── new/page.tsx          # 생성 (Form 컴포넌트 사용)
├── [id]/page.tsx         # 편집 (Form 컴포넌트 + defaultValues)
└── _components/
    └── [feature]-form.tsx  # "use client" 폼 (useActionState)
```

### 디자인 토큰
- 텍스트: `text-[#1a1a1a]` (주), `text-[#666666]` (보조)
- 테두리: `border-[#D9D9D9]`
- 그림자: `shadow-[var(--shadow-soft)]`
- 브랜드 블루: `text-[#2563EB]`, `bg-[#2563EB]`
- 관리자 버튼: `bg-[#1a1a1a] text-white hover:bg-[#333333]`

## 6. 네비게이션 구조

### 공개 헤더 (드롭다운)
```
소개(HRA/커리큘럼/교수진/기수) → 모집안내 → 소식(공지사항/언론보도/갤러리) → 커뮤니티(수료생이야기/FAQ) → 자료실
```

### 관리자 사이드바 (공개 메뉴 순서 반영)
```
대시보드 → 교수진 → 기수관리 → 모집설정 → 공지사항 → 언론보도 → 갤러리 → 수료생이야기 → FAQ연락처 → 자료실 → 지원서 → 회원관리
```

## 7. 금지 사항

- `as any`, `@ts-ignore`, `@ts-expect-error` 사용 금지
- 빈 catch 블록 `catch(e) {}` 금지
- `import { z } from "zod"` 금지 — 반드시 `"zod/v4"` 사용
- 영어 UI 텍스트 금지
- 운영 콘텐츠를 `content/` 파일 기반 CMS로 되돌리지 않는다. 보고서 양식·가이드의 기존 내장 기본본(`content/member/`)은 DB 우선 조회의 예외로 유지한다.

## 8. 문서화 규칙

모든 코드에 **한국어 주석**을 자세히 작성합니다:
- 파일 상단: 파일 설명 블록 주석 (역할, 사용 위치, 주요 기능)
- 주요 함수/변수: 한 줄 주석
- 복잡한 로직: 단계별 설명 주석
- 참고 파일: `src/app/(admin)/admin/admin-shell.tsx`, `src/lib/db/schema.ts`

## 9. 테스트 전략

- **프레임워크**: Vitest + Playwright
- **우선순위**: Integration (서버 액션) > E2E (핵심 플로우) > Unit (순수 함수)
- **DB**: 단위 테스트는 필요한 경우 mock, DB 경합·제약은 격리 PostgreSQL 사용
- **Blob**: 대부분 mock, 실제 업로드 검증은 별도 E2E에서 수행
- **CI(현재)**: lint/typecheck/Vitest/build·일반 Playwright smoke와 별도 학사 G1 검증(`test:academic-g1`). 모든 E2E 파일이 기본 실행되는 것은 아니다.
- **CI(목표)**: server integration + API contract/OpenAPI + web build/E2E + mobile typecheck + Android build + iOS compile/build check

## 10. 배포

- **프로덕션**: Vercel (`https://hra-website-theta.vercel.app`)
- **문서**: MkDocs GitHub Pages (`https://human-renaissance-academy.github.io/hra-website/`)
- **DB 변경**: `npm run db:push`는 개발·운영 DB 모두에서 비활성화되어 있으며 DB에 접속하지 않는다. `npx drizzle-kit export`는 SQL 생성만 수행한다. 신규 DB 준비와 기존 DB 변경은 [데이터베이스 변경 절차](docs/developer/database-change-procedure.md)에 따라 대상·SQL·선행 조건·카탈로그를 검토한 뒤 별도 적용한다. Production migration gate는 아직 미완료다(#280).
- **빌드 확인**: `npm run build` (변경 후 반드시 실행)

## 11. 변경 위험에 따른 검증·독립 리뷰

**사용한 도구(OpenCode·Codex·Claude 등)와 변경 파일 수가 아니라 실제 위험으로 판단합니다.** 모든 변경은 diff와 영향 범위를 확인하고, 관련 테스트·lint·typecheck·빌드 및 필수 CI를 수행합니다. 실행하지 못한 검증과 남은 위험은 PR에 적습니다. 브랜치 보호·보안 검사·학사 권한 및 DB 제약 검사를 리뷰 편의로 면제하지 않습니다.

| 위험 | 예시 | 병합 전 검증·리뷰 |
| --- | --- | --- |
| 높음 | 인증·인가·세션, 개인정보·보호 파일·비밀정보, DB 스키마·migration·seed·backfill, 배포·릴리스·보안 게이트 및 이 절차를 바꾸는 운영 문서 | 경계와 실패 경로의 격리 회귀를 확인하고 **해당 분야를 이해하는 독립 리뷰어**의 검토를 받습니다. 운영 적용은 별도 절차를 따릅니다. |
| 보통 | 기능·API 계약·서버 액션·화면 동작처럼 사용자 행동이나 저장 결과가 바뀌는 작업 | 해당 기능의 회귀와 빌드를 확인하고 작성자 외 독립 리뷰어가 의도한 동작·회귀 위험을 검토합니다. |
| 낮음 | 실행 절차·권한·동작을 바꾸지 않는 오타, 설명 문구, 대비·접근성에 영향 없는 단순 디자인 값 | diff·링크·표시 결과와 필요한 검사를 확인합니다. 추가 독립 리뷰 의무는 없으나 브랜치 보호와 필수 CI는 적용합니다. |

여러 범주가 겹치면 **더 높은 위험**의 기준을 적용합니다. 문서만 수정해도 DB 실행이나 보안·배포 절차를 바꾸면 높은 위험입니다. 반대로 파일이 여러 개여도 단순 문구 변경이라는 이유만으로 높은 위험으로 올리지 않습니다. 사람이나 별도 에이전트 등 작성자와 독립된 검토자가 diff·검증 결과를 읽으면 되며, 특정 Oracle 호출법이나 `BLOCK/NIT/APPROVE` 같은 출력 형식은 필수가 아닙니다.

리뷰에는 보안 경계, 의도한 행동, 회귀 가능성, 수행한 검증과 미검증 범위, 남은 위험을 간결하게 남깁니다. 병합을 막는 지적은 해결하고, 채택하지 않은 제안은 이유를 기록합니다. 커밋·푸시 전에 특정 에이전트 결과를 기다리는 규칙은 두지 않지만 **필요한 독립 리뷰와 최신 head의 CI는 병합 전에 완료**합니다. 기존 과거 PR의 리뷰 기록을 소급해서 만들지 않습니다.

## 12. 작업자(특히 학생) 필수 체크리스트

> 배경: 2026-05-08 ~ 09 사이 한 PR 에서 `npm run build` 를 로컬에서 한 번도 돌리지 않은 채 push 하여
> Vercel 배포가 11회 연속 실패한 사고가 있었습니다. (커밋: 5f11df9 → 5f4ac2d)
> 원인은 (1) Next 16 의 `searchParams` Promise 화 미인지, (2) JSX 괄호 매칭 깨짐 두 가지였고,
> 둘 다 로컬 빌드 한 번이면 즉시 발견됐을 문제였습니다.

### 자동 가드 (Husky 훅 — 자동으로 동작함)

- **pre-commit**: `npm run typecheck` 자동 실행 (10~20초). 타입 에러 있으면 커밋 차단
- **pre-push**: 코드 ref 생성·갱신 시 `npm run build` 자동 실행 (1~3분). 빌드 실패하면 push 차단. 원격 ref 삭제만 하는 push는 보낼 코드가 없어 빌드를 생략

> 훅이 귀찮다고 `--no-verify` 로 우회하지 마세요. 그게 11회 push-fail 사고의 원인입니다.
> 1~3분 기다리는 게 Vercel 배포 실패하고 11번 다시 push 하는 것보다 백배 빠릅니다.

### 수동 체크리스트 (push 전에 한 번 확인)

- [ ] `npm run build` 가 로컬에서 통과하는가? (pre-push 훅이 자동 실행하지만 직접 한 번 더 확인 권장)
- [ ] 페이지 컴포넌트의 `params` / `searchParams` 가 `Promise<...>` 타입인가? (Next 16 필수)
  - ✅ `searchParams: Promise<{ q?: string }>` + `const params = await searchParams`
  - ❌ `searchParams: { q?: string }` (옛 Next 14 패턴, Next 16 빌드 실패)
- [ ] `import { z } from "zod/v4"` 인가? (`"zod"` 단독은 금지)
- [ ] 새 JSX 블록 `{조건 && (...)}` 추가 시 닫는 `)}` 짝이 맞는가?
- [ ] §11의 변경 위험에 맞는 검증·독립 리뷰 결과와 남은 위험을 PR에 기록했는가?
- [ ] 이슈를 만들거나 고쳤다면 `npm run issues:check` 가 통과하는가? (§13)

### 빌드 실패 시 자주 보는 에러와 해결법

| 에러 메시지 (일부) | 원인 | 해결 |
|---|---|---|
| `Type '{ page?: string }' is missing ... 'then'` | `searchParams` 동기 타입 사용 | `Promise<{ ... }>` 로 변경 + `await` |
| `searchParams.page` 가 undefined | `await` 누락 | `const params = await searchParams` 후 `params.page` |
| `Unexpected token` / `Expression expected` | JSX 괄호 매칭 깨짐 | 새로 추가한 `{...&&(...)}` 의 `)}` 위치 점검 |
| `Module '"zod"' has no exported member ...` | zod v4 import 경로 누락 | `from "zod/v4"` 로 수정 |

### 처음 클론한 후 한 번만

```bash
npm install   # husky 가 자동으로 .husky/ 훅을 활성화함 (prepare 스크립트)
```

훅이 동작하지 않는다면 `npx husky` 를 한 번 더 실행하세요.

## 13. 이슈·PR 작성 규칙 (사람·에이전트 공통)

> 배경: 2026-10-12 기준 열린 이슈 43건의 제목 접두어·라벨·본문 섹션이 작성 시점마다 달랐습니다.
> 원인은 (1) 이슈 템플릿이 병합되지 않은 채 `gh issue create` 로 이슈를 만들었고,
> (2) 형식을 검사하는 장치가 없었으며, (3) 이 문서에 이슈 규칙이 없었다는 세 가지였습니다.

규칙 전문은 `docs/contributing/workflow.md` §1, 규칙의 정의(코드)는 `scripts/_lib/process-format.mjs` 입니다.

### 이슈를 만들기 전에

1. `gh issue list --state open --limit 200` 으로 중복을 확인한다. 같은 문제가 있으면 새 이슈 대신 **새로 확인한 사실만** 댓글로 남긴다.
2. 제목에는 문제·목표를 알아볼 수 있는 요약을 쓴다. 우선순위·분류는 제목과 별개로 라벨에서 판단한다.
3. 종류·우선순위는 라벨로 표시하고 분류는 필요한 경우에만 붙인다.
   - 종류 (정확히 하나): `bug`(버그) / `enhancement`(작업) / `question`(정책 확인) / `추적`
   - 우선순위 (버그·작업에 정확히 하나): `P1` = 보안 경계·데이터 유실·서비스 중단, `P2` = 그 외. `P0` 는 비공개로 다루는 긴급 보안 건에만 쓴다
   - 분류 (버그·작업에 선택, 최대 하나): `보안` / `무결성` / `검증` / `업로드` / `기능` / `접근성` / `품질`
   - `question`·`추적` 이슈에는 우선순위·분류 라벨을 붙이지 않는다.
   - 예: `gh issue create --title "요약" --label bug --label P2 --label 기능 --body-file 본문.md`
4. 본문에는 순서와 관계없이 핵심 `###` 섹션 세 개를 각각 한 번씩 쓴다.
   - 버그: `문제와 기대 결과`, `재현 근거와 영향`, `완료 조건`
   - 작업·정책 확인: `목표`, `근거와 범위`, `완료 조건`
   - `관련 이슈`와 추가 설명 섹션은 선택 사항이다. 관련 이슈가 없으면 관례적으로 `없음`을 채울 필요가 없다.
5. 핵심 섹션은 비우지 않고 `완료 조건` 은 `- [ ]` 체크리스트로 쓴다.
6. 한 이슈에는 한 가지 결과만. 여러 건을 발견했으면 이슈를 나누고 `추적` 이슈 체크리스트에 추가한다.
7. 확인 수준(재현함 / 코드로만 확인 / 미확인 전제)을 `재현 근거와 영향` 에 적는다.

### 이슈를 만든 뒤

- 명령줄·API 로 만들었다면 반드시 `npm run issues:check` 를 실행해 0건 위반인지 확인한다.
- 추가 섹션과 보충 근거는 필요하면 붙일 수 있다. 핵심 섹션의 내용·완료 체크리스트는 유지한다.

### 금지

- 악용 가능한 취약점을 공개 이슈로 등록 — 비공개 보안 권고(Security Advisory)를 사용한다.
- 개인정보, 실제 자료 URL, 공격 코드를 이슈·PR·댓글에 기록.
- 위 목록에 없는 종류·우선순위·분류 라벨이나 상태 라벨 생성.

### PR

- `.github/PULL_REQUEST_TEMPLATE.md` 의 네 핵심 섹션 제목과 내용은 유지한다. 순서를 바꾸거나 보조 섹션을 추가할 수 있다.
- `관련 이슈` 에 `Closes #번호` / `Refs #번호` / `이슈 없음: 사유` 중 하나를 적는다. CI 가 검사한다.

