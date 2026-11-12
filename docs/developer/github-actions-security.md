# GitHub Actions 권한과 외부 Action 고정

관련: [#269](https://github.com/yeongseon/hra-website/issues/269), [#408](https://github.com/yeongseon/hra-website/issues/408). 이 문서는 CI 권한·도구 무결성·PR 필수 체크 경계를 설명합니다. [저장소 secret·dependency 게이트](repository-security-gates.md), [공개 artifact 검사](public-artifact-safety.md), [CSP·HSTS](browser-security-policy.md), [LICENSE·noreply 운영 확인표](../operations/public-repository-security.md)의 구체 범위와 함께 확인합니다.

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
4. `npm ci
node --test scripts/tests/release-policy.test.mjs scripts/tests/required-checks-policy.test.mjs`, `node scripts/check-release-config.mjs`, `node scripts/check-required-checks-config.mjs`를 실행합니다. 기존 정책 테스트는 설치된 `js-yaml`로 실제 YAML을 파싱해 Action의 전체 SHA, checkout 인증 미보존, 읽기 기본 권한·필요한 쓰기 예외, 릴리스 토큰 흐름, PR 필수 체크 생성·우회 차단을 확인합니다. YAML 문법 검사와 앱 CI도 통과해야 합니다.

권한 정책 테스트는 단순한 workflow 구조를 대상으로 하며, 필수 체크 경계 검사는 기존 의존성 `js-yaml`의 `JSON_SCHEMA`를 직접 사용하므로 별도의 YAML 파서 구현을 유지하지 않습니다. 필요한 테스트/CLI는 `npm ci` 이후 기존 필수 `ci.yml`과 독립 보안 작업에서 실행합니다. 새 workflow·Action·권한 예외는 허용 목록과 실제 YAML 구조를 함께 리뷰합니다. 운영 GitHub runner의 실제 실행 결과는 PR CI에서 확인합니다.

## PR 필수 체크와 main 병합 보호 경계

워크플로가 PR에서 **실행되는 것**과 GitHub `main` 브랜치 보호(`required_status_checks`)에서 **병합을 실제로 차단하는 것**은 별개입니다. `main` 보호의 필수 상태 검사 정본은 `scripts/_lib/required-checks-policy.mjs`의 `REQUIRED_MAIN_STATUS_CHECKS`(**추가 보안 2개를 포함하는 목표 6개**)로 관리하며, 정기·운영 관측이나 경로 조건부(`paths:`) 워크플로는 분리합니다.

### 전체 상태 검사·워크플로 분류 (2026-11-03 확인 기준)

| 워크플로 / 통합 | 실제 Check Run / Status 이름 | App ID | 실행 트리거 | 모든 `main` PR 생성 여부 | 정본 `main` 필수 여부 | 2026-11-03 GitHub 설정 조회 결과 |
| --- | --- | --- | --- | --- | --- | --- |
| `ci.yml` | `Lint · Typecheck · Test · Build` | `15368` | `pull_request(main)`, `push(main)` | 예 (무조건 실행) | **필수** | 등록됨 (`strict: true`, `enforce_admins: true`) |
| `process-format.yml` | `PR 형식` | `15368` | `pull_request(main)` (7개 활동 유형) | 예 (`event_name == 'pull_request'`) | **필수** | 등록됨 |
| `process-format.yml` | `형식·릴리스 계약 테스트` | `15368` | `pull_request(main)`, `push(main)`, `workflow_dispatch` | 예 (`event_name != 'issues'`) | **필수** | 등록됨 |
| `repository-security.yml` | `추적 소스 · 도달 가능한 이력 · dependency 검토` | `15368` | `pull_request(main)`, `push(main)`, `schedule`, `workflow_dispatch` | 예 (무조건 실행, 비밀값 없음) | **필수** | 미등록 → 운영자 반영·검증 대상 ([#408](https://github.com/yeongseon/hra-website/issues/408)) |
| `repository-security.yml` | `실제 production CSP · 에디터 · 인쇄 · Blob SDK` | `15368` | `pull_request(main)`, `push(main)`, `schedule`, `workflow_dispatch` | 예 (무조건 실행, 격리 PG·Chromium) | **필수** | 미등록 → 운영자 반영·검증 대상 ([#408](https://github.com/yeongseon/hra-website/issues/408)) |
| Vercel GitHub App | `Vercel` | `8329` | PR / `main` 커밋 배포 상태 | 예 | **필수** | 등록됨 |
| `process-format.yml` | `이슈 형식`, `열린 이슈·PR 일괄 검사` | `15368` | `issues` / `workflow_dispatch` | PR에서는 `skipped` | 비필수 | 미등록 |
| `authentication-measurement.yml` | `조건부 비용 비교 · 200개 계정 · 즉시 권한 회수` | `15368` | `pull_request(main, paths)`, `workflow_dispatch` | 아니오 (`paths` 일치 시에만 생성) | 비필수 (조건부 회귀) | 미등록 |
| `expanded-e2e.yml` | `공개 24건 · 학사 G1 10개 필수 사례` | `15368` | `schedule`(일일), `pull_request(main, paths)`, `workflow_dispatch` | 아니오 (`paths` 일치 시에만 생성) | 비필수 (예약 관측) | 미등록 |
| `production-smoke.yml` | `격리 점검·알림 보고서 계약`, `Production 읽기 점검` | `15368` | `deployment_status`, `schedule`(매시), `pull_request(main, paths)`, `workflow_dispatch` | 아니오 (`smoke`는 PR 제외) | 비필수 (운영 관측) | 미등록 |
| `release-please.yml` | `release-please` | `15368` | `push(main)`, `workflow_dispatch` | 아니오 | 비필수 (병합 후 릴리스) | 미등록 |

### 분리 기준과 우회·무기한 대기 방지

1. **최소 PR 차단 보안 범위**: 추적 소스와 도달 가능한 이력의 secret(`verify:repository-secrets`)·공개 문서 개인정보 표식(`verify:public-sources`)·미검토/만료/P1 의존성 위험(`verify:dependencies`)·실제 production CSP 및 에디터/인쇄/Blob SDK 회귀(`verify:csp`)는 운영 자격증명 없이 모든 PR(fork 포함)에서 2~3분 내 병렬 실행되므로 `main` 필수 체크 정본에 포함합니다.
2. **예약·운영 관측 분리**: `repository-security.yml`의 주간 `schedule`은 `refs/heads/main` 커밋에 기록되며 PR의 `head_sha` 체크를 덮어쓰지 않으므로 동일 정의를 복제하지 않고 유지합니다. 반면 `expanded-e2e.yml`·`authentication-measurement.yml`은 `pull_request.paths` 필터가 있어 필수 체크로 등록하면 비대상 PR에서 체크 자체가 생성되지 않아 `Expected` 상태로 무기한 대기합니다. `production-smoke.yml`은 실제 Production 가용성 관측이므로 PR 병합 조건과 결합하지 않습니다.
3. **자동 회귀 차단**: `node scripts/check-required-checks-config.mjs`는 필수 워크플로의 `paths`/`paths-ignore`/`branches-ignore` 추가 및 `branches: [main]` 누락, 필수 job 이름 변경·중복 선언, `strategy` matrix·재사용 `uses`로 인한 체크 이름 변형, 선행 `needs` 의존 및 job/step 수준 `if` 추가(GitHub는 `skipped` 결론을 통과로 처리해 게이트가 우회됨), 실제 `step.run` 핵심 명령 누락·위장, `continue-on-error`, 따옴표 키·비표준 들여쓰기 문법 변경을 `js-yaml` 표준 파서로 판단합니다. 복잡한 셸 제어 흐름 전체나 GitHub 외부 앱의 실제 상태까지 정적 검사가 증명하지는 않습니다.
4. **실제 GitHub 설정 대조**: YAML 변경만으로 GitHub 보호 규칙이 적용되지는 않습니다. 저장소 관리자는 아래 읽기 전용 명령으로 실제 `main` 보호 설정이 정본 6개(`context` + `app_id`, `strict: true`, `enforce_admins: true`)와 일치하는지 확인합니다.

```bash
gh api repos/Human-Renaissance-Academy/hra-website/branches/main/protection > /tmp/hra-main-protection.json
node scripts/check-required-checks-config.mjs --protection-file /tmp/hra-main-protection.json
```

> **2026-11-13 진행 상황:** 현재 연결된 GitHub App의 branch protection 읽기는 HTTP 403이며, 실제 required `Vercel` commit status는 조직 이전 후 PR HEAD에서 생성되지 않아 병합이 HTTP 405로 차단됩니다. 위 표의 **목표 6개**는 아직 적용 완료된 GitHub 설정이 아닙니다. 외부 Vercel 연결과 GitHub branch protection은 권한 있는 관리자가 확인해야 하며, 이 PR의 정적 검증이 운영 설정 변경을 대신하지 않습니다.
