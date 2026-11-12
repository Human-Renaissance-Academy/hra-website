# 변경 파일 포맷 규칙 (#495)

## 도구와 범위

- 루트 프로젝트의 Prettier 3.6.2는 개발 의존성 및 lockfile에 고정합니다. 모바일 앱(`apps/mobile/`)은 독립 프로젝트이므로 현재 루트 포맷 강제 대상에서 제외합니다.
- `.prettierrc.json`은 TypeScript/JavaScript 소스의 스타일 정본이며 `.prettierignore`는 generated 파일, SQL, 잠금 파일 및 산출물을 보호합니다.
- 기존 파일 전체에 포맷을 적용하지 않습니다. 변경된 코드만 검사하므로 기존 PR에서 발생할 수 있는 대량 충돌을 피합니다.

## 로컬 사용법

```bash
npm ci
git add src/수정한-파일.ts
npm run format:staged
# 실패한 파일만 포맷하고 변경을 다시 스테이징
npm run format:write -- src/수정한-파일.ts
git add src/수정한-파일.ts
npm run format:staged
```

커밋 훅은 Git index의 실제 스테이징 내용을 검사합니다. 작업 트리에만 존재하는 변경으로 검사를 우회할 수 없습니다. 기존 전체 타입 검사는 훅에 계속 남습니다. 포맷 기능은 자동으로 전체 파일을 수정하지 않습니다.

CI의 `Lint · Typecheck · Test · Build` 작업에서는 PR base → 검증 HEAD(merge ref) 또는 main push 이전 → 현재 커밋 사이의 변경된 TS/TSX/JS/JSX/MJS/CJS/MTS/CTS 파일만 검사합니다. Git diff·SHA·Prettier 실행에 실패하면 검사를 통과시키지 않습니다. 테스트는 `node --test scripts/tests/code-format-scope.test.mjs`로 실행합니다.

현재 열려 있는 다른 PR의 작업 파일이 신규 포맷 검사에 실패하면 해당 PR에서 **수정한 파일만** 별도 포맷 커밋으로 조정합니다. 폭넓은 포맷-only 작업이 필요할 때는 기능 변경과 분리한 독립 PR로 진행하고 `.git-blame-ignore-revs` 등록 여부를 검토합니다. 동일 PR에서 코드 의미 변경과 포맷을 섞지 않습니다.

## 운영 및 제외 원칙

- 코드를 생성하는 OpenAPI 도구, npm, SQL migration 원본에는 Prettier를 직접 적용하지 않습니다.
- 문서·YAML·JSON은 이 단계의 강제 검사 범위가 아닙니다. 파일별 추가는 별도 검토 후 결정합니다.
- GitHub 설정에 등록된 기존 필수 체크 이름은 변경하지 않습니다. #492의 CI 간소화는 #408 보안 보호 경계를 확인한 뒤 별도 검토합니다.
