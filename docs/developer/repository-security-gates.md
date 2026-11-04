# 저장소 secret·의존성 게이트

이 검사는 공개 저장소의 지속 검증이며 실제 secret의 부재나 모든 취약점의 비도달성을 증명하지 않는다. GitHub native secret scanning과 push protection의 활성화 상태는 유지한다. standalone 검사는 이 기능을 보완한다.

## Secret 검사

```bash
node scripts/scan-repository-secrets.mjs --gitleaks /absolute/path/to/gitleaks
```

Linux x64 Gitleaks **8.30.1**을 사용한다. 공식 release archive SHA256은 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, 압축 해제한 실행 파일 SHA256은 `88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509`다. 실행기는 binary hash와 version을 다시 확인한다. [공식 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)의 checksum을 검증한 파일만 전달한다. Gitleaks upstream은 기능 개발을 종료하고 보안 유지보수를 제공하므로 버전 고정만으로 미래 패턴 탐지를 보장하지 않는다.

기본 엔진 규칙을 유지하고 현재 **Git 추적 파일의 작업 트리 내용**과 `--all --full-history`의 **로컬에 fetch한 reachable refs**를 각각 검사한다. shallow checkout, 누락된 이력 객체, scanner 실패, 보고서 누락/잘못된 JSON은 실패다. CI는 전체 이력을 fetch해야 한다. 삭제된 remote refs·다른 fork·미추적 파일·운영 secret 저장소까지 검사했다고 주장하지 않는다. 전체 reachable refs라 해도 과거 유출 대응을 대체하지 않는다.

합성 예외는 `generic-api-key` 규칙에 대해 `tests/unit/academic-upload-server.test.ts`와 `tests/unit/api-v1-academic-uploads-route.test.ts`의 **각 파일에 고정된 정확한 값의 SHA256**을 함께 확인하는 두 조합이다. 기존 서버 테스트는 과거 세 도입에서 같은 `vi.stubEnv`의 명시적 fixture 표식과 `@vercel/blob` mock을 확인했다. v1 테스트의 추가 값도 mock 저장소와 로컬 SDK HMAC 서명에만 사용하는 합성 값임을 확인했다. 다른 값·파일·규칙이나 두 파일의 값을 서로 바꾸는 경우는 계속 탐지하며 원문을 정책에 재기록하지 않는다. `tests/**`나 규칙 전체를 제외하지 않는다.

매 실행의 실제 엔진 canary는 임시 Git 저장소의 `tests/unit/academic-upload-server.test.ts` 경로에 **다른 새 secret**을 넣어 source에서 탐지하고, 삭제 commit 이후에도 history에서 탐지되는지 확인한다. v1 경로의 정확한 값·파일·규칙 예외는 단위 회귀와 실제 source/history 검사로 검증한다.

stdout에는 scope별 탐지 수·합성 예외 수·canary 결과만 쓴다. scanner stdout/stderr와 원문 JSON은 private 임시 디렉터리에서만 처리하고 정상/오류/일반 종료 신호 때 제거한다. SIGKILL/호스트 장애는 cleanup을 보장할 수 없다. CI artifact로 raw report를 업로드하지 않는다. 실제 자격정보가 의심되면 원문을 공개 이슈·댓글·로그에 붙이지 않고 비공개 보안 절차로 전달한다. 이 검사는 history rewrite나 credential 회전을 수행하지 않는다.

## 의존성 검토

```bash
node scripts/verify-dependencies.mjs
node --test scripts/tests/secret-scan.test.mjs scripts/tests/dependency-policy.test.mjs
```

실행기는 credential 환경을 전달하지 않고, 소유 임시 디렉터리의 package/lock 복사본과 비어 있는 npm 설정으로 `npm audit --json --package-lock-only --ignore-scripts`를 실행한다. registry는 `https://registry.npmjs.org`로 고정한다. exit 1의 발견과 통신/구문 오류를 구분하며 raw npm 오류는 출력하지 않는다. 설치 파일을 수정하거나 자동 업데이트하지 않는다.

`security/dependency-triage.json`은 **28 affected package**의 현재 exact metadata를 고정한다(한국 시간 2026-11-04 registry 재확인). **4 object-advisory entry**와 전이 링크를 포함한 **50 검토 항목**, **5 공유 context**는 각각 다른 수다. 동일 GHSA의 여러 영향 범위/source ID도 별도로 보존한다. package nodes+lock 버전과 advisory ID/source/range 집합은 독립적이다. 모든 nodes×advisory 조합을 실제 영향 경로라고 해석하지 않는다. npm의 `dev` 값도 실제 운영 도달성을 대신하지 않는다.

`package-lock.json`의 모든 `resolved`는 `https://registry.npmjs.org/`로 시작해야 한다(워크스페이스 link 제외). 개인 `~/.npmrc`나 사내 미러가 만든 외부 피드 주소가 섞이면 `DEPENDENCY_LOCK_REGISTRY_INVALID`와 설치 경로만 출력하고 차단한다(#432). 외부 주소 자체는 로그에 남기지 않는다.

한국 시간 2026-11-04에는 모든 평가의 2026-11-05 기한 도래 전에 69평가를 권고별로 재검토했다. 기존 lock 범위 안 수정본을 `npm update brace-expansion source-map-js esbuild vite`로 적용해 brace-expansion 1.1.21·5.0.12, source-map-js 1.2.2, 루트 esbuild 0.28.2, vite 8.3.5(vitest 전용 개발 의존성, rolldown 1.2.16 동반)로 갱신했고 `package.json`은 바꾸지 않았다. 실제 audit에서 사라진 brace-expansion 12건, Vite 5건, source-map-js 1건, esbuild Windows serve 권고 1건 등 평가 **19건**과 참조가 없어진 `tooling-brace-expansion`·`vitest-vite` context를 제거했다(31패키지·23 object-advisory·69평가·7context → 28·4·50·5). 남은 4개 권고는 범위 안 수정본이 없거나 정확한 pin으로 적용되지 않아 사용면을 다시 평가하고, 일괄 연장 없이 위험별 기한을 뒀다. `reviewedOn`은 게이트가 비교하는 UTC 날짜(2026-11-03)로 기록한다.

| context | 평가 | 남은 권고 | 위험 판단 | 재검토 기한 |
| --- | --- | --- | --- | --- |
| `shadcn-registry-cli` | 4 | [deepmerge prototype 상속](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | dev=false, 공식 패치 없음, prototype 계열. 제품은 CSS만 읽는다 | 2026-11-19 |
| `build-css-source-map` | 2 | [postcss-selector-parser selector 파싱 CPU](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | dev=false 빌드 경로. 6.1.5 수정본이 있으나 @tailwindcss/typography 0.5.20의 6.0.10 정확 pin으로 미적용 | 2026-11-19 |
| `shadcn-ts-morph-glob` | 3 | [minimatch globParts 증폭](https://github.com/advisories/GHSA-g3hv-75wg-m249) | dev=false CLI 전이 경로의 DoS, 제품 호출 없음 | 2026-11-26 |
| `build-esbuild` | 4 | [esbuild serve cross-origin 응답](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | dev=true, drizzle-kit의 esbuild 0.18.20 transform만 사용하고 serve 미사용 | 2026-12-03 |
| `tooling-minimatch-glob` | 37 | [minimatch globParts 증폭](https://github.com/advisories/GHSA-g3hv-75wg-m249) | dev=true 린트·맞춤법 도구, 고정 저장소 glob만 입력 | 2026-12-03 |

한국 시간 2026-11-03에는 신규 공개된 [minimatch globParts 증폭 권고](https://github.com/advisories/GHSA-g3hv-75wg-m249)(`<11.0.1`, source `1244012`)와 ESLint·TypeScript-ESLint·hanspell·`shadcn → ts-morph → @ts-morph/common` 전이 경로를 재검토했다. 설치본 `3.1.5`·`10.2.5`는 기존 `^3.x`·`^10.x` 범위 안에 수정 백포트가 없고, `11.0.1` major 강제 override는 ESLint 3.x CommonJS 기본 함수 호출 호환을 깨뜨린다. 이에 lockfile과 기존 29평가·5context는 바꾸지 않고 개발 린트·맞춤법 경로(`tooling-minimatch-glob`)와 CSS만 import하는 CLI 전이 경로(`shadcn-ts-morph-glob`)를 분리한 평가 **40건**·공유 맥락 **2건**을 추가했으며, 재검토 기한은 연장 없이 **2026-11-05**로 맞췄다.

한국 시간 2026-10-30에는 직접 설치된 js-yaml 4.2.0을 [4.3.2](https://registry.npmjs.org/js-yaml/4.3.2), gray-matter 내부의 3.14.2를 [3.15.2](https://registry.npmjs.org/js-yaml/3.15.2)로 패치했다. 각각 기존 `^4.2.0`·`^3.13.1` 범위 안이며 기존 두 lock 경로의 버전·배포 파일·무결성 값만 바뀌었다. gray-matter의 `safeLoad`·`safeDump` 사용과 호환되도록 내부 의존성의 3.x major를 유지했다. 수정 근거는 [반복 alias 병합](https://github.com/advisories/GHSA-h67p-54hq-rp68), [병합 키 체인](https://github.com/advisories/GHSA-52cp-r559-cp3m), [omap 처리](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [빈 병합 원본 처리](https://github.com/advisories/GHSA-2883-xcg3-v3hh)의 공식 권고다.

전체 실제 audit에서 YAML 권고가 사라지고 다른 패키지 metadata가 그대로임을 확인한 뒤 `js-yaml` 패키지 항목과 해당 평가 **7건**, 참조가 없어진 `yaml-parser-cli`·`yaml-omap` context만 제거했다. 패치 전 13패키지·29개 object-advisory·36평가·7context에서 당시 12패키지·22개 object-advisory·29평가·5context로 줄었고, 나머지 평가·공유 설명·검토일·재검토 기한은 유지했다. YAML의 2026-10-29 기한을 연장하거나 새 예외를 만든 변경이 아니다. 이후 새 권고나 metadata 변경은 기존 exact gate에서 다시 차단한다.

2026-10-23 registry 재확인에서는 [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)가 2026-10-22에 철회된 사실을 확인했다. 공식 사유는 예외를 적절히 처리할 책임이 애플리케이션에 있다는 것이다. 이에 `sprintf-js` advisory와 `argparse` 전이 항목, `js-yaml`의 해당 전이 링크를 제거하고 집계 범위를 registry의 정확한 값으로 갱신했다. 패키지 설치 버전·검사 정책·기존 평가의 재검토 기한은 변경하지 않았다. 철회 사실은 라이브러리 사용면 전체의 안전을 보증하지 않는다.

같은 날 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)도 실질적 악용 가능성이 없다는 공식 사유로 철회됐다. npm audit에서 `braces`와 그 권고만으로 영향받던 전이 패키지 8개가 제거된 사실을 확인해 해당 패키지 9개·평가 11건만 원장에서 삭제했다. 남은 권고와 설치 경로, lockfile, 기존 평가·기한은 유지한다. 철회된 기록을 검토 원장에 남겨 실제 registry와 어긋나게 하지 않는다.

2026-10-24 registry 재확인에서는 새 [fast-uri 권고](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)와 [undici 권고](https://github.com/advisories/GHSA-4qv8-2p9j-2685)를 확인했다. 잠금파일에서 fast-uri 3.1.9, Blob 경로 undici 6.29.1, jsdom 내부 undici 7.30.1로 각각 패치했다. 패치 뒤 기존 undici 권고도 audit에서 사라져 undici 패키지 1개·평가 31건만 원장에서 삭제했다. 다른 설치 패키지·기존 평가 내용·재검토 기한과 신규 권고 실패 차단은 유지한다.

원장 schema v2로 전환할 당시에는 권고별 `assessments` **32건**의 `key`·공격 조건·P2 판단·담당자 `repo-maintainers`·검토일·재검토 기한을 그대로 뒀다. 동일한 사용하는 API·호출 위치·사용면 평가·잔여 전제 네 필드만 `contexts` **6건**에 모아 `contextId`로 참조했다. 반복 설명 필드는 종전 32×4=128회에서 6×4=24회로 줄었고 JSON은 43,030바이트에서 27,621바이트로 줄었다. 이 수치는 당시 중복 제거의 기록이며 현재 집계는 위 50평가·5context다. 서로 다른 권고의 공격 조건·검토 기한을 합치거나 package nodes×advisory를 새로운 영향 경로로 만들어 내지 않는다.

공유 context 하나를 수정하면 이를 참조하는 권고 2~37건의 판단문이 함께 바뀐다. PR에서 참조하는 `key` 목록과 권고별 공격 조건·날짜를 함께 검토한다. 비어 있거나 중복된 context, 없는 참조, 미사용 context, 누락된 권고별 평가와 예전 중복 필드는 실패한다. 담당자 표시는 P1 위험 수용 승인이 아니다. 패치된 js-yaml의 사용면은 내장 기본본의 JSON_SCHEMA 파싱과 저장소 YAML 검사이며, 남은 glob/CSS/esbuild/deepmerge는 도구 입력을 따로 검토한다. Blob의 undici 6과 jsdom 내부 undici 7은 위 패치 버전으로 잠가 현재 원장에서 빠졌지만, 이후 새 권고는 같은 exact gate에서 다시 차단한다. 신뢰 HTTPS만으로 모든 fetch 위험이 배제되지는 않는다.

새 advisory·source·범위·심각도·패키지 경로·설치 버전, 누락/잘못된 원장, 만료는 실패한다. 불일치 진단은 정제된 패키지·GHSA ID·숫자 source·설치 경로만 출력하고 감사 원문의 제목·범위·버전은 출력하지 않는다. 현재 P2는 독립 코드 검토를 거치는 사용면 평가이며 모든 high 항목을 면제하는 정책이 아니다. 남은 재검토 기한은 위 표처럼 사용면 위험에 따라 **2026-11-19**(dev=false 또는 수정본 미적용)·**2026-11-26**(dev=false CLI DoS)·**2026-12-03**(개발 도구 전용)으로 나뉜다. 기한 전에 패치 또는 새 근거를 검토하고 실제 재검토일과 기한을 갱신한다. 단순히 기한을 늘리지 않는다. 확인된 P1은 이 게이트에서 항상 차단하며 수정이 필요하다. 권한 있는 owner의 개별 예외가 필요하다면 별도 검토로 정책을 확장해야 하며 에이전트가 승인 사실을 만들어 통과시키지 않는다.

공식 근거: [npm audit 동작](https://docs.npmjs.com/cli/v11/commands/npm-audit/), 각 원장 항목의 GHSA ID. 원장의 source 번호와 범위는 registry 관측 시점 자료이므로 upstream advisory 변경은 재검토를 유발한다.
