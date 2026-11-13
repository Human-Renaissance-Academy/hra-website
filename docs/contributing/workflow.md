# 협업 워크플로우 — 이슈부터 릴리스까지

작업 관리는 **GitHub 이슈 → 작업 브랜치 → PR → CI·리뷰 → 완료 확인**으로 합니다. 이슈는 작업의 목표와 완료 조건, 브랜치는 변경을 따로 기록하는 작업 흐름, PR(Pull Request)은 변경을 검토하고 병합해 달라는 요청입니다. CI(Continuous Integration)는 GitHub에서 자동 실행하는 검사입니다.

버전 기록은 release-please를 활성화한 뒤 **릴리스 PR → 검토·병합 → GitHub Release**로 진행합니다. 기능 배포와 버전 기록의 차이, 최초 활성화 조건은 [릴리스 운영](releasing.md)을 확인하세요. 현재 작업 관리에 별도 프로젝트 보드나 마일스톤을 추가할 필요는 없습니다.

## 1. 이슈로 작업 정하기

기능, 버그, 보안, 데이터, 배포에 영향을 주는 작업은 먼저 [열린 이슈](https://github.com/Human-Renaissance-Academy/hra-website/issues)를 검색합니다. 같은 문제가 있으면 새로 만들지 말고 그 이슈에 새로 확인한 사실만 댓글로 남깁니다. 없으면 아래 세 가지 폼 중 하나로 만듭니다. 단일 오타·문구 수정은 이슈 없이 PR에 이유를 적어도 됩니다.

제목에는 문제·목표를 알아볼 수 있는 요약을 적습니다. 우선순위와 분류는 제목 접두어가 있어도 **라벨**을 기준으로 판단합니다. 라벨은 `label:P1 label:보안`처럼 걸러 볼 수 있고 우선순위를 바꿀 때 제목을 고칠 필요가 없습니다. **이슈 제목에는 `feat:`/`fix:`를 강제하지 않습니다.**

| 종류 | 종류 라벨 | 우선순위 라벨 | 분류 라벨 | 본문 핵심 섹션 (`###`, 순서 자유) |
| --- | --- | --- | --- | --- |
| 버그 | `bug` | 하나 | 선택, 최대 하나 | 문제와 기대 결과 · 재현 근거와 영향 · 완료 조건 |
| 작업 | `enhancement` | 하나 | 선택, 최대 하나 | 목표 · 근거와 범위 · 완료 조건 |
| 정책 확인 | `question` | 없음 | 없음 | 목표 · 근거와 범위 · 완료 조건 |
| 추적 | `추적` | 없음 | 없음 | 자유 형식. `- [ ] #번호` 체크리스트 필수 |

- **종류 라벨**은 정확히 하나만 붙입니다.
- **우선순위 라벨**: `P1`은 보안 경계, 데이터 유실, 서비스 중단처럼 먼저 처리할 문제이고 `P2`는 그 외 작업입니다. `P0`는 비공개로 다루는 긴급 보안 건에만 씁니다.
- **분류 라벨**은 필요할 때 다음 일곱 가지 중 최대 하나만 붙입니다. 목록에 없는 라벨을 새로 만들지 않습니다.

    | 분류 | 쓰는 경우 |
    | --- | --- |
    | `보안` | 인증·권한·요청 제한·정보 노출 |
    | `무결성` | 데이터 유실·부분 저장·경합·삭제 순서 |
    | `검증` | 서버 입력값 검증 누락 |
    | `업로드` | 파일 업로드와 Blob 저장 |
    | `기능` | 화면·동작이 의도와 다른 그 밖의 버그와 기능 변경 |
    | `접근성` | 키보드·스크린 리더 사용 |
    | `품질` | 테스트·CI·스크립트·문서·저장소 설정 |

- 진행 상태를 나타내는 라벨은 만들지 않습니다. 상태는 담당자 지정과 열림/닫힘으로 봅니다. release-please의 `autorelease: pending`/`autorelease: tagged`는 **릴리스 PR 전용 예약 라벨**이며 일반 이슈에는 사용하지 않습니다.
- **한 이슈에는 한 가지 결과만** 적습니다. 원인이 같아 함께 고쳐야 하는 경우만 묶습니다.
- **완료 조건**은 `- [ ]` 체크리스트로, 닫아도 되는지 다른 사람이 확인할 수 있게 적습니다.
- 세 핵심 섹션은 각각 한 번씩 채웁니다. 순서는 자유이고, `관련 이슈`가 없으면 생략하거나 비워 둘 수 있습니다. 추가 설명 섹션도 허용합니다.
- **확인 수준**을 적습니다. 직접 재현했는지, 코드로만 확인했는지, 확인하지 못한 전제가 무엇인지 구분합니다.
- 요구사항 자체가 미정이면 정책 확인 이슈로 등록해 결정을 기록한 뒤 구현합니다.
- 공개 저장소입니다. 개인정보, 실제 자료 URL, 공격 코드는 올리지 않습니다. 악용 가능한 취약점은 공개 이슈 대신 [비공개 보안 권고](https://github.com/Human-Renaissance-Academy/hra-website/security/advisories/new)로 등록합니다.
- 리뷰 결과처럼 이슈를 여러 개 만들었다면 `추적` 라벨이 붙은 이슈의 체크리스트에 추가합니다. 추적 이슈가 전체 목록의 기준입니다.

**형식은 자동으로 검사합니다.** 웹 화면의 폼은 핵심 본문과 종류 라벨을 만들어 주고, 선택한 분류가 필요하면 직접 붙입니다. `gh issue create`나 API, 자동화 도구로 만든 이슈는 폼을 거치지 않습니다. 그래서 이슈가 만들어지거나 수정될 때마다 [이슈·PR 형식 검사](https://github.com/Human-Renaissance-Academy/hra-website/actions/workflows/process-format.yml)가 실행되어, 핵심 정보가 없으면 고칠 항목을 이슈에 댓글로 남깁니다. 고치면 댓글이 통과로 바뀝니다. 명령줄로 이슈를 만들었다면 바로 확인합니다.

2026-10-21~24의 최근 형식 워크플로 500회에서 이슈 성공 102·실패 6·취소 24, PR 성공 224·실패 4·취소 81, main push 성공 59건을 확인했습니다. 이슈 실패 6회는 [#332](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/39686421736)·[#333](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/39686426829)·[#334](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/39686430816)의 생성 직후 **빈 본문**을 각각 두 번 검사한 결과입니다. PR 실패 4회는 OpenAPI·커밋·릴리스 계약과 head 변경 경합이며 PR 본문 섹션 실패는 관측되지 않았습니다. 정확한 순서나 관례적 `없음` 때문에 실패한 사례가 있다는 뜻은 아닙니다. GitHub 작성자 정보만으로 웹·CLI·API·에이전트 작성 경로를 구분할 수 없으므로 형식 완화의 시간 절감량을 이 표본으로 추정하지 않습니다.

```bash
npm run issues:check   # 열린 이슈 전체의 제목·라벨·본문 구조 검사
node scripts/check-process-format.mjs --pull-requests
node scripts/check-process-format.mjs --all  # 열린 이슈와 PR, 읽기 전용

# 명령줄로 만들 때의 예
gh issue create --title "요약" --label bug --label P2 --label 기능 --body-file 본문.md
```

위 GitHub 조회·작성 명령에는 `gh`(GitHub CLI) 설치와 해당 계정의 저장소 접근 권한이 필요합니다. `issues:check`, `--pull-requests`, `--all` 검사는 읽기 전용입니다. 검사에서 위반이 0건인지 확인하고, 위반이 있으면 지적된 제목·라벨·본문을 고친 뒤 다시 검사합니다.

이슈·일반 PR 본문 규칙은 `scripts/_lib/process-format.mjs`, PR 제목·생성형 PR의 작성자·브랜치·파일 신뢰 조건과 릴리스 계약은 `scripts/_lib/release-policy.mjs`가 각각 소유합니다. 두 검사 사이에 본문 책임 중복은 없어 생성형 PR 예외를 넓히지 않습니다. PR 형식 검사는 base SHA의 코드로 실행해 자기 PR로 면제할 수 없게 유지합니다. 폼(`.github/ISSUE_TEMPLATE/*.yml`), PR 템플릿, 문서를 바꾸면 해당 규칙과 테스트도 함께 확인합니다. 본문 정합성은 `tests/unit/process-format.test.ts`, 제목·릴리스 정책은 `scripts/tests/release-policy.test.mjs`로 검증합니다.

**착수할 때** 담당자 한 명을 지정합니다. 담당자가 없는 열린 이슈는 대기 중인 작업입니다. 막히면 이슈 댓글에 막힌 이유와 다음 필요한 결정을 남깁니다.

## 2. 작업 브랜치와 PR

`main`에서 직접 작업하지 말고, 최신 `main`에서 브랜치를 만듭니다. 먼저 `git status --short`에서 진행 중인 변경이 없는지 확인합니다. 변경이 있으면 해당 작업부터 정리하고, 브랜치 이름의 번호와 설명을 실제 작업에 맞게 바꿉니다.

```bash
git status --short
git switch main
git pull --ff-only origin main
git switch -c fix/issue-번호-짧은설명
```

새 기능은 `feature/`, 버그는 `fix/`, 문서는 `docs/`, 자동화는 `ci/`로 시작합니다. PR 제목은 **`type(scope)!: 설명`** 형식입니다. 예: `fix(auth): 카카오 로그인 오류 처리`, `feat(academic): 학생별 과제 제출`, `ci(release): 릴리스 자동화 도입`. scope와 `!`는 필요한 경우만 씁니다. 허용 type과 버전 영향은 [릴리스 규칙의 2절](releasing.md)을 따릅니다.

일반 PR은 템플릿의 네 핵심 섹션(관련 이슈, 변경 내용, 검증 결과, 배포 영향과 리뷰)을 각각 한 번씩 채웁니다. 순서를 바꾸거나 보조 섹션을 추가해도 됩니다. 관련 이슈에는 `Closes #번호`나 `Refs #번호`를, 이슈가 없는 변경이면 `이슈 없음: 사유`를 적습니다. 병합만으로 완료되는 작업은 `Closes #번호`, **DB 마이그레이션이나 운영 확인이 남으면** `Refs #번호`를 사용하고 적용 확인 후 이슈를 닫습니다.

release-please/Dependabot의 본문은 검증된 생성형 PR에 한해서만 다른 형식을 허용합니다. 이름에 bot이 있거나 라벨만 붙였다고 면제하지 않습니다. 릴리스 PR도 제목·파일 범위·버전 정합성·앱 CI 검사는 통과해야 합니다.

한 사람은 진행 중인 작업을 가급적 하나씩 맡습니다. 새 일을 시작하기 전에 현재 PR을 완료하거나 이슈에 중단 이유를 남깁니다. squash merge를 기본으로 운영하고 **최종 커밋 제목은 검증된 PR 제목**을 사용합니다. 변경의 의미를 왜곡하는 type 자동 변경은 금지합니다.

## 3. 검증과 리뷰

현재 [앱 CI](https://github.com/Human-Renaissance-Academy/hra-website/actions/workflows/ci.yml)는 `main` 대상 PR과 `main` 푸시에서 **lint → typecheck → 격리 PostgreSQL을 쓰는 Vitest → build → 학사 G1 검증 → Playwright 브라우저 스모크**를 실행합니다. 학사 G1 검증은 `npm run test:academic-g1`, 일반 브라우저 스모크는 `ci-smoke.spec.ts`이며 모든 E2E 파일을 실행하는 설정은 아닙니다. 이 CI에는 운영 DB·Blob 자격 증명을 전달하지 않습니다. 별도 `형식·릴리스 계약 테스트`는 Node 기본 테스트 및 버전 정합성을 검사합니다. PR에서 실패한 검사를 원인 확인 없이 건너뛰지 않습니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm ci
node --test scripts/tests/release-policy.test.mjs scripts/tests/required-checks-policy.test.mjs
node scripts/check-release-config.mjs
node scripts/check-required-checks-config.mjs
```

인증·라우팅 등 브라우저 동작을 바꿨다면 [빌드·배포 가이드](build-and-deploy-safety.md)의 환경 조건을 준비하고 관련 E2E와 실제 화면도 확인합니다. 결과나 미실행 사유를 PR에 남깁니다. `npm test`의 성공 종료만 보지 말고 관련 DB 테스트가 건너뛰어졌는지도 확인합니다. PR 필수 보안·품질 체크 정본과 예약·운영 관측 분리 기준, 실제 `main` 브랜치 보호 설정 대조 절차는 [GitHub Actions 권한과 필수 체크 경계](../developer/github-actions-security.md)를 따릅니다.

로컬 훅이 설정된 환경에서는 커밋 전 타입 검사, 코드 ref 푸시 전 빌드를 실행합니다. 훅을 우회하지 않습니다. 독립 리뷰는 [AGENTS.md §11](https://github.com/Human-Renaissance-Academy/hra-website/blob/main/AGENTS.md)의 **변경 위험 기준**을 모든 도구에 동일하게 적용합니다. PR에는 위험 판단 이유, 검증 결과, 필요한 독립 리뷰와 남은 위험을 적습니다.

기존 [인증 PR #306](https://github.com/Human-Renaissance-Academy/hra-website/pull/306)과 [DB 설치 PR #348](https://github.com/Human-Renaissance-Academy/hra-website/pull/348)은 새 기준에서도 높은 위험이라 권한·격리 DB 회귀와 분야 리뷰가 필요합니다. [DB 실행 안내를 고친 문서 PR #371](https://github.com/Human-Renaissance-Academy/hra-website/pull/371)도 한 파일뿐이지만 운영 절차를 바꾸므로 새 기준에서는 높은 위험입니다. 당시 #306·#348의 독립 리뷰 결과와 #371의 리뷰 면제 사유는 PR 본문에 기록됐지만 GitHub의 정식 review 기록은 없어 리뷰어 신원이나 품질을 입증한 예로 해석하지 않습니다. 이미 병합한 기록을 소급 수정하지 않습니다. 단순 오타·설명 문구는 낮은 위험으로 diff와 필요한 검사를 확인하되 필수 CI는 계속 적용합니다.

### 검증 비용과 삭제 ref 처리 (2026-10-24 측정)

| 경로 | 측정값 | 유지·조정 근거 |
| --- | --- | --- |
| 로컬 pre-commit | `typecheck` 22.54초 | 코드 오류를 커밋 전에 발견하므로 유지 |
| 로컬 pre-push | `build` 99.40초, 삭제 전용 훅 0.0011초 | 새 코드 ref를 보내기 전에 Next 빌드 실패를 잡으므로 유지. **삭제 ref만 있는 push**는 코드 전송이 없어 이 빌드를 생략 |
| 기본 PR CI | [#386 실행](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/40053038911) 620초, [#385 실행](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/40051384154) 627초 | lint·typecheck·Vitest·build·격리 PG·학사 G1·브라우저 스모크 유지 |
| 병합 후 main CI | [#385 병합 실행](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/40052247252) 547초 | squash 후 새 SHA와 배포 기준 코드를 다시 검증하므로 유지 |
| 별도 보안/CSP | #385 PR 164초, main 154초 | 실제 브라우저와 설치 SDK·공개 소스 검사를 독립 환경에서 유지 |
| 예약 확장 E2E | [정상 실행](https://github.com/Human-Renaissance-Academy/hra-website/actions/runs/40026997272) 210초 | 매일 공개 여정·학사 G1을 주기 검증. 앞선 704초 실행은 Chromium 설치만 502초가 걸린 외부 설치 지연 |

로컬 시간은 설치 완료된 Node 24 워크트리에서 단일 실행으로 잰 값이며 장비·캐시에 따라 달라집니다. 삭제 전용 0.0011초는 훅에 합성 ref 입력을 넣어 잰 시간으로 원격 통신은 포함하지 않으며, 격리 bare 저장소의 실제 Git push/delete 통합 테스트로 입력 형식을 확인했습니다. PR #386의 단위 테스트 152초·빌드 69초·학사 G1 67초, #385의 159초·69초·67초는 검사 자체의 큰 비용을 보여줍니다. 측정한 필수 CI는 성공했고, 외부 Chromium 설치 지연 외 테스트 실패 반복은 관측하지 않았습니다. 이 변경으로 CI 작업의 skip이나 실행 조건은 달라지지 않습니다. pre-commit 검사도 유지합니다. `pre-push`는 [Git의 ref 입력 계약](https://git-scm.com/docs/githooks)에 따라 **모든 줄이 `(delete)` ref와 0 OID로 검증될 때만** 빌드를 생략합니다. 생성·갱신이 섞이거나 입력이 비어 있거나 잘못되면 기존 빌드를 실행합니다. 새 캐시·공유 DB·운영 secret 전달은 도입하지 않습니다.

리뷰어는 이슈의 완료 조건, 권한·데이터 영향, 검증 증거를 확인합니다. **현재 PR의 마지막 커밋**에서 GitHub CI와 Vercel Preview가 각각 성공했는지 확인한 뒤 한 건을 병합합니다. 새 `main` 병합 커밋의 Production 배포 성공을 확인한 다음 PR을 갱신·푸시합니다. Preview 설치·빌드 실패나 Production 배포 대기·실패·횟수 제한은 [빌드·배포 가이드](build-and-deploy-safety.md)의 중단·원인 확인 절차를 먼저 따릅니다. 최신 `main` 반영이나 수정 커밋 뒤에는 이전 성공 결과를 재사용하지 않습니다. main 브랜치 보호/필수 체크와 squash 기본 메시지는 관리자가 확인합니다. 이 workflow 추가만으로 보호 설정까지 활성화되었다고 주장하지 않습니다.

## 4. 완료와 릴리스

이슈는 완료 조건을 확인하고 PR이 병합된 뒤 닫습니다. 배포·마이그레이션이 포함되면 적용 결과까지 확인합니다. 매주 열린 이슈를 짧게 훑어 중복을 닫고, `node scripts/check-process-format.mjs --all`로 열린 이슈/PR 형식을 확인하고, `추적` 이슈의 체크리스트를 실제 상태와 맞춘 뒤 `P1`부터 다음 작업의 담당자를 정합니다. 미정 정책은 구현 이슈보다 먼저 결정합니다. 형식 통일만을 위해 닫힌 PR/이슈/과거 커밋을 재작성하지 않습니다.

릴리스는 release-please가 제안하는 PR의 버전·CHANGELOG와 CI/리뷰를 확인한 뒤 사람이 병합합니다. 태그는 `vX.Y.Z`. npm 배포나 Vercel 배포 전략은 바꾸지 않습니다. 토큰·봇 PR 검사 승인·첫 릴리스 운영 확인은 [릴리스 운영 안내](releasing.md)를 따릅니다.

빌드·배포 시 주의할 점은 [빌드·배포 안전 가이드](build-and-deploy-safety.md)를 참고합니다.

