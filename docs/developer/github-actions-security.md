# GitHub Actions 권한과 외부 Action 고정

관련: [#269](https://github.com/yeongseon/hra-website/issues/269). 이 문서는 CI 권한·도구 무결성 경계를 설명합니다. [저장소 secret·dependency 게이트](repository-security-gates.md), [공개 artifact 검사](public-artifact-safety.md), [CSP·HSTS](browser-security-policy.md), [LICENSE·noreply 운영 확인표](../operations/public-repository-security.md)의 구체 범위와 함께 확인합니다.

## 권한 경계

모든 workflow의 기본 `GITHUB_TOKEN` 권한은 `contents: read`입니다. 앱 CI와 형식 계약 테스트는 저장소를 쓰지 않습니다. 모든 checkout에 `persist-credentials: false`를 지정하여 이후 설치·테스트 명령의 Git 설정에 checkout 토큰을 남기지 않습니다.

고정한 commit의 공식 [checkout 안내](https://github.com/actions/checkout/blob/11d5960a326750d5838078e36cf38b85af677262/README.md#recommended-permissions)와 [setup-node 안내](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/README.md#recommended-permissions)도 `contents: read`를 권장합니다. checkout 안내에서 인증 미보존 설정의 의미도 확인했습니다.

| 작업 | 명시적 권한 | 이유 |
| --- | --- | --- |
| 앱 CI / 형식 계약 테스트 | `contents: read` | 저장소 코드 검증 |
| 확장 E2E 회귀 | `contents: read` | 격리 브라우저 검증과 정제한 JSON artifact 보관 |
| 저장소 보안·브라우저 CSP | `contents: read` | fetched history·추적 소스·dependency 원장·격리 production CSP 검사. scanner 원문 artifact 없음 |
| 인증 비용·권한 회수 | `contents: read` | 같은 의존성의 합성 계정 전후 비교와 업로드 직전 검사한 JSON 보관 |
| 운영 가용성 점검 | `contents: read` | 공개 GET·비운영 알림 검증과 정제 JSON만 기록 |
| 모바일 Android | `contents: read` | `apps/mobile`의 계약·타입·린트·Jest·JS 번들과 debug APK 컴파일. 비밀값을 쓰지 않으며 debug APK를 7일 보관 |
| 모바일 서버 실통합 | `contents: read` | 환경을 비운 production 빌드와 격리 PostgreSQL의 Bearer HTTP 여정. 실패 때만 고정 코드 위주의 로그를 7일 보관 |
| 이슈 형식 | `contents: read`, `issues: write` | 기존 형식 위반 알림 댓글 관리 |
| PR 형식 | `contents: read`, `pull-requests: read` | 신뢰된 base 코드로 PR 메타데이터 조회 |
| 수동 일괄 검사 | `contents: read`, `issues: read`, `pull-requests: read` | 이슈·PR 조회 |
| release-please | `contents: write`, `issues: write`, `pull-requests: write` | 기존 릴리스 PR·라벨·태그·Release 관리 |

release-please의 활성화 조건과 별도 `RELEASE_PLEASE_TOKEN` 전달을 유지합니다. 해당 Action은 checkout을 사용하지 않으며 API 인증에 지정 토큰을 사용합니다. 이 변경은 토큰 자체의 권한이나 저장소 설정을 바꾸지 않습니다. [기존 릴리스 운영](../contributing/releasing.md)의 토큰 발급·활성화 절차를 따릅니다.

## 문서·모바일 전용 PR의 웹 CI 경계

`.github/workflows/ci.yml`의 `scope` job은 PR의 **GitHub merge ref와 첫 번째 부모(base)** 를 비교합니다. 변경된 파일이 `apps/mobile/**`, 일반 Markdown/이미지 문서, 저장소 설명 문서, 이슈 템플릿에만 있으면 웹의 PostgreSQL 설치·전체 Vitest·브라우저·Next.js 빌드 job을 생략합니다. 별도 `mobile.yml`의 Android 빌드·타입·Jest·Expo 검증은 계속 실행되며 PR 형식·보안/CSP 검사도 독립적으로 실행됩니다.

`src/**`, `packages/contracts/**`, `scripts/**`, 웹·모바일 CI/보안 workflow, 자동 생성된 `docs/developer/environment-inventory.md`, 문서 경로의 JSON·스크립트, `package*.json`, `vercel.json`, 환경변수/설정처럼 웹에 영향을 줄 수 있는 파일이 **하나라도 포함되면 전체 웹 CI**를 실행합니다. 공용 API 계약이 바뀐 모바일 PR은 Web과 Mobile을 함께 검사합니다. `push`/`main`은 변함없이 전체 CI를 수행합니다.

범위를 판독할 수 없거나, merge parent가 없거나, 파일명이 손상되거나, 검출 job의 테스트가 실패해도 전체 Web CI가 실행되도록 `always()` 기반 job 조건을 사용합니다. *탐지 실패를 검사 성공으로 취급해 건너뛰지 않습니다.* 기존 `Lint · Typecheck · Test · Build` job 이름을 유지하여 브랜치 보호 확인 이름을 임의 변경하지 않습니다. 운영 DB나 배포를 호출하는 workflow를 새로 만들지 않았습니다.

재현 가능한 독립 검증은 `node --test scripts/tests/ci-scope.test.mjs`이며 실제 PR에서는 merge ref의 SHA/파일 범위까지 확인합니다. 이 분기는 **GitHub Actions의 웹 CI 비용/범위만 조정**합니다. Vercel 프로젝트의 Ignored Build Step이나 Root Directory를 변경하지 않았으며, 두 설정의 운영 적용은 #281과 조직 이전 연결 문제 #408에서 별도 확인해야 합니다.

## 검증한 태그와 commit

2026-10-21에 각 공식 저장소의 Git refs API로 기존 태그를 조회하고 대상이 `commit`인지 확인했습니다. checkout과 setup-node는 기존 `v4` 범위를 유지했고 release-please의 고정 commit은 그대로 보존했습니다.

| 공식 저장소 / 기존 태그 | 확인한 전체 commit SHA | 1차 근거 |
| --- | --- | --- |
| `actions/checkout@v4` | `11d5960a326750d5838078e36cf38b85af677262` | [태그 API](https://api.github.com/repos/actions/checkout/git/ref/tags/v4), [commit](https://github.com/actions/checkout/commit/11d5960a326750d5838078e36cf38b85af677262) |
| `actions/setup-node@v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | [태그 API](https://api.github.com/repos/actions/setup-node/git/ref/tags/v4), [commit](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020) |
| `googleapis/release-please-action@v4.4.1` | `5c625bfb5d1ff62eadeeb3772007f7f66fdcf071` | [태그 API](https://api.github.com/repos/googleapis/release-please-action/git/ref/tags/v4.4.1), [commit](https://github.com/googleapis/release-please-action/commit/5c625bfb5d1ff62eadeeb3772007f7f66fdcf071) |
| `actions/upload-artifact@v4` (2026-10-22 추가 확인) | `ea165f8d65b6e75b540449e92b4886f43607fa02` | [태그 API](https://api.github.com/repos/actions/upload-artifact/git/ref/tags/v4), [commit](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02) |

태그는 나중에 이동할 수 있으므로 위 API는 확인 시점의 출처이고 workflow의 전체 SHA가 실제 실행 대상을 고정합니다. SHA 고정은 해당 코드가 안전하다는 보증을 대신하지 않습니다.

## 갱신 절차와 회귀 검사

1. 같은 공식 저장소에서 승인할 태그의 변경 내역·실행 환경·권한 요구를 확인합니다. 메이저 업그레이드는 별도로 검토합니다.
2. 예를 들어 `gh api repos/actions/checkout/git/ref/tags/v4`로 태그 객체를 조회합니다. `object.type=commit`이면 `object.sha`를 사용합니다. `tag`이면 `gh api repos/actions/checkout/git/tags/<태그 객체 SHA>`로 대상을 따라가 최종 commit을 확인합니다.
3. `gh api repos/actions/checkout/commits/<전체 commit SHA>`로 공식 저장소의 commit을 확인하고, 같은 Action의 모든 사용 위치와 이 문서의 매핑·확인 날짜를 함께 갱신합니다. 태그 이름만으로 실행하지 않습니다.
4. `node --test scripts/tests/release-policy.test.mjs`와 `node scripts/check-release-config.mjs`를 실행합니다. 기존 정책 테스트는 외부 패키지 없이 Action의 전체 SHA, checkout 인증 미보존, 읽기 기본 권한·필요한 쓰기 예외, 릴리스 토큰 흐름을 확인합니다. YAML 문법 검사와 앱 CI도 통과해야 합니다.

정책 테스트는 현재 단순한 workflow 구조를 대상으로 하며 일반 YAML 파서가 아닙니다. 새 workflow·Action·권한 예외는 허용 목록과 실제 YAML 구조를 함께 리뷰합니다. 운영 GitHub runner의 실제 실행 결과는 PR CI에서 확인합니다.
