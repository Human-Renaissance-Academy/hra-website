# 코드 규칙 — 함께 읽고 고칠 수 있게 작성하기

이 문서는 코드 작성 시 자주 쓰는 규칙을 설명합니다. 전체 기준은 저장소의 [AGENTS.md](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/AGENTS.md)이며, 기존 파일을 고칠 때는 주변 코드의 구조도 함께 확인합니다.

## 1. 언어와 이름

사용자에게 보이는 버튼·오류 메시지·입력 안내와 **코드 주석은 한국어**로 작성합니다. 변수·함수·파일 이름은 영어를 사용합니다.

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 사용자 문구 | 한국어로 행동이나 오류를 설명 | `<button>저장하기</button>` |
| 코드 주석 | 역할과 이유를 한국어로 설명 | `// 권한을 확인한 뒤 데이터를 조회합니다.` |
| 폴더·파일 | 소문자 단어를 하이픈으로 연결 | `user-profile.tsx` |
| 컴포넌트·타입 | 각 단어의 첫 글자를 대문자로 | `UserProfile`, `UserProfileProps` |
| 변수·함수 | 첫 단어는 소문자, 다음 단어부터 대문자 | `userName`, `getUserProfile` |

이름 규칙은 각각 kebab-case, PascalCase, camelCase라고 부릅니다. Next.js가 정한 `page.tsx`, `layout.tsx`, `[id]` 같은 파일·폴더 이름은 그 규칙을 따릅니다.

파일 상단에는 역할과 사용 위치를 설명하고, 주요 함수와 복잡한 처리에는 의도를 적습니다. 코드가 하는 일을 줄마다 그대로 번역하기보다 왜 그 확인이나 순서가 필요한지 설명합니다.

## 2. 타입 검사와 입력 검증

**TypeScript 타입**은 개발 중 값의 형태를 검사합니다. 사용자가 보낸 값이나 외부 서비스의 응답이 실행 중에도 올바른지는 별도의 **입력 검증**으로 확인해야 합니다.

- `as any`, `@ts-ignore`, `@ts-expect-error`로 오류를 숨기지 않습니다.
- 형태를 아직 모르는 값은 `unknown`으로 받고 검사합니다.
- `data as User` 같은 타입 단언은 실제 데이터를 검사하거나 변환하지 않습니다.
- 서버 입력 검증은 프로젝트 규칙에 따라 `zod/v4`를 사용합니다.

다음은 값을 검사한 뒤에만 결과를 사용하는 작은 예시입니다.

```typescript
import { z } from "zod/v4";

const displayNameSchema = z.string().trim().min(1).max(50);

// 외부 입력의 형태와 길이를 확인한 뒤 화면에 쓸 이름을 돌려줍니다.
export function parseDisplayName(input: unknown) {
  const result = displayNameSchema.safeParse(input);

  if (!result.success) {
    return { error: "이름은 1자 이상 50자 이하로 입력해 주세요." };
  }

  return { name: result.data };
}
```

입력 형식이 맞는 것과 그 사람이 해당 작업을 할 권한이 있는 것은 별개입니다. 데이터 조회·변경에는 서버의 권한 검사도 필요합니다.

오류를 잡는 `catch` 블록을 비워 두지 않습니다. 사용자가 이해할 메시지, 운영자가 원인을 확인할 기록, 필요한 정리 작업을 구분하고 비밀값은 로그에 남기지 않습니다.

## 3. 현재 위치와 목표 구조

현재 코드의 주요 위치는 다음과 같습니다.

| 현재 위치 | 역할 |
| --- | --- |
| `src/app` | Next.js 페이지와 API 요청 처리 |
| `src/components` | 웹 화면의 공통 부품 |
| `src/features` | 기능별 기존 조회·서버 액션 |
| `src/lib` | DB·인증·파일 저장 등의 공통 코드 |

[플랫폼 아키텍처](../developer/platform-architecture.md)는 웹과 모바일이 업무 로직을 함께 쓰는 목표를 정의합니다. `apps/web`, `apps/mobile`, `server/modules`, `packages/contracts`로의 전환은 진행할 작업이며, 현재 파일이 모두 이동했다고 가정하지 않습니다.

새 기능과 구조를 정비하는 기능은 다음 경계를 사용합니다.

| 계층 | 맡는 일 |
| --- | --- |
| 페이지·서버 액션·API 처리부 | 화면이나 요청을 읽고, 로그인 사용자를 전달하고, 결과를 해당 형식으로 반환합니다. |
| Application Service | “누가 어떤 조건에서 이 업무를 할 수 있는가” 같은 업무 규칙을 처리합니다. |
| Repository | DB에서 필요한 데이터를 읽고 쓰는 방법을 맡습니다. |
| 공용 API 계약 | 웹·모바일이 주고받는 필드와 오류 형식을 명시합니다. |

신규·리팩터링 페이지와 서버 액션, API 처리부가 Drizzle이나 DB를 직접 호출하는 기존 방식을 복제하지 않습니다. **Drizzle ORM**은 TypeScript에서 DB를 다루는 도구이며, 목표 구조에서는 Repository 쪽에 둡니다.

DB의 모든 컬럼을 그대로 외부 응답에 담지 않습니다. **DTO(Data Transfer Object)**는 외부에 전달하도록 선택한 데이터 형태입니다. 필요한 필드만 명시하고 권한과 공개 범위를 확인합니다.

## 4. 서버와 브라우저 코드 구분

**서버 컴포넌트(Server Component)**는 기본 페이지 구성 방식입니다. **클라이언트 컴포넌트(Client Component)**는 클릭·입력·상태 변경처럼 브라우저에서 동작해야 하는 부분에 사용합니다.

```tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((previous) => previous + 1)}>
      {count}번 클릭함
    </button>
  );
}
```

`"use client"`는 해당 모듈과 브라우저에서 필요한 의존성을 클라이언트 코드에 포함시키는 경계입니다. 상위 페이지 전체에 습관적으로 붙이지 않습니다. DB 비밀값이나 서버 전용 코드는 브라우저로 보내지 않습니다.

서버에서 실행된다는 사실만으로 접근 권한이 자동 보장되지는 않습니다. 보호 데이터의 조회·변경 단계에서 현재 사용자의 권한을 검사합니다. 메뉴 표시나 버튼 비활성화만으로 접근을 막지 않습니다.

Next.js 16의 페이지 `params`와 `searchParams`는 비동기 값입니다. 예시는 [빌드·배포 가이드](build-and-deploy-safety.md)에 있습니다.

## 5. 화면 스타일과 import

Tailwind CSS v4 클래스와 기존 공통 UI·디자인 값을 우선 사용합니다. 고정된 색상·간격을 여러 방식으로 중복 정의하지 않습니다. 실행 중 계산되는 값처럼 `style` 속성이 필요한 경우에는 용도와 범위를 확인합니다.

```tsx
<div className="flex items-center justify-between rounded-lg p-4">
  <h2 className="text-lg font-bold">공지사항</h2>
</div>
```

`import`는 파일 위쪽에서 역할별로 정리합니다. React·Next.js, 외부 패키지, 내부 모듈 순서를 참고하되 기존 파일 스타일과 린트 규칙을 따릅니다. JSX를 사용한다는 이유만으로 사용하지 않는 `import React`를 추가할 필요는 없습니다.

새 외부 패키지를 직접 import한다면 `package.json`에 직접 의존성으로 선언되어 있는지도 확인합니다. 다른 패키지를 따라 설치된 상태만 믿지 않습니다.

## 6. 제출 전 확인

수정한 코드의 목적과 사용 위치를 설명할 수 있고, 잘못된 입력·권한 없는 요청에 대한 결과도 확인할 수 있어야 합니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

관련 테스트의 준비 조건과 추가 브라우저 검사는 [빌드·배포 가이드](build-and-deploy-safety.md)를 따릅니다. 실행하지 못한 검사는 통과로 기록하지 않습니다.

PR 제목과 최종 병합 커밋은 `fix(auth): 로그인 오류 처리` 같은 형식을 사용합니다. 작업 중 임시 커밋마다 같은 형식을 강제하지는 않습니다. 형식과 버전 영향은 [릴리스 운영](releasing.md), 제출 과정은 [협업 절차](workflow.md)를 참고합니다.


