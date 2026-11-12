# DB 변경 검증 정본별 책임과 중복 필드

이 문서는 [#364](https://github.com/yeongseon/hra-website/issues/364)의 첫 번째 완료 조건에 대한 **현황 비교표**입니다. 기준은 `origin/main`의 정적 검토이며 운영 DB·migration 적용은 확인하지 않았습니다. 이 문서는 코드·계약 파일을 바꾸지 않고, 어떤 검사도 제거하거나 완화하자고 제안하지 않습니다.

- 운영 적용 게이트 구축은 [#280](https://github.com/yeongseon/hra-website/issues/280) 소관입니다. 아래 "향후 유도 가능" 항목은 **#280의 운영 경계가 준비된 뒤에만 검토할 수 있는 후보이며 아직 하나도 구현되지 않았습니다.**
- 실제 versioned manifest는 `state: "unset"`, `migrations: []`입니다. 후보 파일·검사 통과는 운영 적용 가능 상태가 아닙니다.
- 절차 자체는 [데이터베이스 변경 절차](database-change-procedure.md)를 따릅니다.

## 1. 한눈에 보는 비교표

| 정본 | 유일한 책임 | 주요 필드 | 일관성을 강제하는 검사 |
| --- | --- | --- | --- |
| `scripts/db/source-inventory.json` | 저장소의 DB 관련 SQL·관리 MJS의 **존재·역할·원본 바이트 해시·후보 선행 관계·G1 순서** 목록 | `sql[]`(`path`, `role`, `sha256`, `id`, `predecessors`), `scripts[]`(`path`, `sha256`, `effect`, `defaultBehavior`, `writeOptions`, `commands`), `g1Order` | `scripts/_lib/db-source-inventory.mjs`, `scripts/check-db-source-inventory.mjs`, `scripts/tests/db-source-inventory.test.mjs`, `scripts/tests/db-plan-cli.test.mjs` |
| `scripts/db/installation-contract.json` | 각 소스가 **어떤 DB 객체를 정의·요구하는지**와 fresh 설치 준비 상태(`include`/`exclude`/`unresolved`)의 의미 대응 | `inventoryRef`, `schemaExport`, `sources[]`(`ref`, `phase`, `fresh`, `objects`, `requires`, `checks`, `evidence`, `unresolved`), `objects[]`(`id`, `kind`, `names`, `owner`, `definitions`, `requires`, …), `fixtures[]`(`steps`, `exclusions`) | `scripts/_lib/db-installation-contract.mjs`, `scripts/check-db-installation-contract.mjs`, `scripts/tests/db-installation-contract.test.mjs` |
| `scripts/db/candidates/db-fresh/*.sql` (`db-fresh-candidate-*` 검증 대상 전체) | 빈 DB 신규 설치 검증용 **SQL 본문**(원본에서 transaction 제어 등만 검토해 변환한 사본) | SQL 원문 + 머리 주석(`원본 참조`, `검토 원본 SHA256`, `reviewedDelta`, `원본→후보 보존 행`) | `scripts/tests/db-fresh-candidate-export.test.mjs`, `db-fresh-candidate-custom.test.mjs`, `db-fresh-candidate-g1.test.mjs`, `db-mobile-session-candidate.test.mjs`, `tests/integration/db-fresh-reference.test.mjs` (전용 `_lib` 검증기는 없고 테스트가 직접 검사) |
| `scripts/db/migration-manifest.json` | **운영 후보로 검토한 versioned SQL의 순서·ID·해시**(현재 비어 있음) | `schemaVersion`, `state`, `executionContract`, `migrations[]`(`id`, `sequence`, `path`, `sha256`, `transaction`) | `scripts/_lib/db-migration-manifest.mjs`, `scripts/check-db-migration-manifest.mjs`, `scripts/tests/db-migration-manifest.test.mjs` |
| `scripts/_lib/db-*.mjs` | 위 정본을 **입력으로 받아 판정**하는 순수 검증기. 파일·Git·DB에 직접 접근하지 않음(`db-migration-local-engine.mjs`는 소유 로컬 PostgreSQL 전용 적용기) | 위 정본에 없음(진단 코드만 반환) | 각 검증기 옆의 `scripts/tests/db-*.test.mjs`, `db-migration-local-engine.test.mjs`, `db-migration-catalog.test.mjs` |

현재 규모는 문서에 고정하지 않고 아래 명령으로 확인합니다. 숫자는 SQL·MJS·계약을 바꿀 때마다 달라지므로 이 문서를 함께 고치지 않습니다.

- `node scripts/check-db-source-inventory.mjs`: inventory의 SQL·MJS 개수를 출력합니다.
- `node scripts/check-db-installation-contract.mjs`: 계약의 `counts`(`sources`, `objects`, `requiredUnresolved`)를 JSON으로 출력합니다.
- 역할별 SQL 개수(`fresh_candidate`, `versioned_candidate`, `current_definition_or_installer`, `read_only_preflight`)와 `fixtures` 개수는 `source-inventory.json`의 `sql[].role`, `installation-contract.json`의 `fixtures[]`에서 셉니다.

(참고: 작성 시점 `origin/main` 기준 inventory SQL 37개·MJS 18개, 계약 `sources` 55개·`objects` 53개·`requiredUnresolved` 79개·`fixtures` 2개. 이 값은 갱신하지 않는 참고용입니다.)

## 2. 실제로 중복되는 필드

### 2.1 sha256

같은 바이트 해시가 여러 곳에 손으로 기록됩니다.

| 해시 | 기록 위치 | 확인 예 |
| --- | --- | --- |
| 원본 SQL/MJS 바이트 | `source-inventory.json`의 `sha256`(SQL·MJS 항목마다 1개) | `scripts/migrate-protect-application-answers.sql` = `c6adf77d…` |
| 후보 SQL 바이트 | `source-inventory.json`의 후보 항목 `sha256` + `db-fresh-candidate-custom.test.mjs`의 `digest` | `custom-protect-application-answers.sql` = `1f208455…`가 두 파일에 모두 있음 |
| 원본 해시의 후보 머리 주석 사본 | 후보 SQL의 `-- 검토 원본 SHA256:` + 원본의 inventory `sha256` | `g1-roster.sql` 머리 주석과 inventory가 `fef40d56…`를 공유 (g1 테스트가 대조) |
| 생성 export 해시 | `schema-export.sql`의 inventory `sha256` + `db-fresh-candidate-export.test.mjs`의 `rawDigest`/`candidateDigest`/`schemaDigest` | `0ed45733…`가 inventory와 export 테스트에 함께 있음 |
| versioned SQL 해시 | `migration-manifest.json`의 `migrations[].sha256` | 현재 0건. 등록 시 inventory의 `versioned_candidate` 해시와 이중 기록될 수 있음 |

### 2.2 경로·ID

- inventory `sql[].path`/`scripts[].path`는 계약 `sources[].ref`와 **집합이 같아야** 합니다(`INSTALL_SOURCE_MISSING`·`INSTALL_SOURCE_UNKNOWN`). 계약의 `fixtures[].steps`·`exclusions`는 같은 경로를 다시 나열하며 inventory의 모든 SQL을 포함 또는 제외해야 합니다(`INSTALL_FIXTURE_COVERAGE`).
- 후보 SQL 경로는 inventory `path`, 후보 테스트의 `candidate`, 계약 `sources[].ref`에 각각 나타납니다.

### 2.3 objects / requires / predecessors

- 계약 `sources[].objects`와 `objects[].definitions[].source`는 서로의 역참조입니다. 한쪽만 고치면 `INSTALL_SOURCE_DEFINITION_MISSING` 또는 `INSTALL_DEFINITION_SOURCE_MISSING`이 납니다.
- 계약 `sources[].requires`(객체 ID)는 소스 간 선행 관계를 객체 소유자로 간접 표현하고, inventory `predecessors`(후보 ID)는 같은 관계를 직접 표현합니다. 검증기는 두 그래프를 합쳐 순환(`INSTALL_SOURCE_CYCLE`)만 검사하며 **두 표현이 같은 순서를 뜻하는지는 검사하지 않습니다.** 예: `scripts/migrate-287-rate-limit-reservation-index.sql`은 inventory에서 `id: "287-reservation-index"`, `predecessors: []`이지만 계약에서는 `requires: ["rate-events"]`(객체 ID)로 선행 조건을 기록해 서로 다른 어휘를 씁니다.
- `g1Order`(inventory 9개)는 소스 모듈의 `academicG1Migrations` 리터럴과 **정확히 같아야** 하고(`G1_ORDER_MISMATCH`), 계약 fixture의 `inventory-order` 단계가 이를 다시 참조합니다.
- 계약 `evidence[].file`/`line`은 소스 파일의 줄 번호를 복제합니다. 줄이 밀려도 파일이 추적되고 줄 수 안이면 통과하므로(`INSTALL_EVIDENCE_LOCATION`은 범위만 검사) **의미 일치는 리뷰어 몫**입니다.

### 2.4 스크립트 목록

- inventory `scripts[].commands`는 `package.json`의 `db:*` 명령과 정확히 일치해야 합니다(`UNREGISTERED_COMMAND`).
- `db-source-inventory.test.mjs`의 기대 표(`effect`, `defaultBehavior`)와 `db-plan-cli.test.mjs`의 사례 목록이 같은 스크립트의 동작을 다시 적습니다.

## 3. 현재 수동 수정 지점

근거는 최근 커밋의 `git show --stat`입니다. 설명에 쓴 파일 수는 그 커밋 전체 변경 파일 수이며, 문서·본체를 뺀 **검증 정본 수정 지점**은 별도로 셉니다.

| 커밋 | 변경 내용 | 전체 파일 | 검증 정본·테스트 수정 지점 |
| --- | --- | --- | --- |
| `9c987d5` | 기존 MJS 1개의 DB 접근 차단 | 7 | inventory(해시 + `defaultBehavior`), 계약(`reason`/`checks`/`evidence`), `db-source-inventory.test.mjs`, `db-plan-cli.test.mjs`, `package.json` = **5** (나머지: 스크립트 본체, 절차 문서) |
| `fc93082` | 같은 유형의 MJS 1개 | 7 | 위와 같은 **5** |
| `1fa2537` | MJS + 후보 SQL 1개 | 11 | 위 5 + 후보 SQL, `db-fresh-reference.test.mjs`(고정 해시), `ci.yml` = **8** (나머지: 스크립트 본체, 절차 문서, 부가 문서) |

즉 기존 스크립트 1개를 고치면 정본·테스트 5~8곳을 동시에 맞춰야 하고, 한 곳이라도 빠지면 CI가 실패합니다. 실패하도록 설계된 것이므로 그 자체는 결함이 아닙니다.

새 SQL을 **추가**할 때는 위 커밋이 아닌 검증기 규칙에서 읽은 아래 지점이 필요합니다(실제 추가 커밋으로 검증한 것은 아님).

1. SQL 파일 본체
2. `source-inventory.json`: `path`, `role`, `sha256`, `id`, `predecessors`
3. `installation-contract.json`: `sources[]` 항목 + 관련 `objects[]` + `evidence` 줄 번호 + fixture `steps` 또는 `exclusions`
4. fresh 후보가 필요하면 후보 SQL 본체(머리 주석의 원본 해시 포함)와 `db-fresh-candidate-*.test.mjs`의 검토 표(`digest`, `edits`)
5. 필요할 때만: `package.json` 명령, `db-plan-cli.test.mjs` 사례, [절차 문서](database-change-procedure.md)의 개수 설명

SQL 1개 추가 시 최소 3곳(파일·inventory·계약), fresh 후보까지 포함하면 약 5곳입니다.

## 4. 향후 단일 정본에서 유도 가능한 항목 (미구현)

> **전제와 한계.** 아래는 #280의 검증된 versioned migration·기존 DB upgrade/restore·실패 복구·적용 이력 기준이 확보된 **뒤에** 검토할 후보입니다. 지금은 기존 안전 검사를 제거하거나 새 추상화·메타데이터 파일을 추가하지 않습니다. 필요성이 증명되지 않으면 추가하지 않습니다(#364 완료 조건).

| 항목 | 현재 | 향후 후보 (미구현) |
| --- | --- | --- |
| 원본·후보 `sha256` | 수작업 입력, 여러 곳에 중복 | 파일 바이트에서 계산한 값만 한 곳에 두고 테스트·머리 주석은 그 값을 읽거나 검사만 하도록 변경 가능 |
| 파일 경로 집합 | inventory·계약·fixture에 각각 나열 | inventory를 정본으로 두고 계약·fixture는 inventory에 없는 의미 정보만 보유(이미 `inventoryRef` 방식의 일부) |
| 적용 순서 | `predecessors`(inventory)·`requires`(계약)·`sequence`(manifest)·`g1Order` 4곳 | 운영 manifest의 `sequence`를 유일한 순서로 두고 나머지는 검증용 파생값으로 축소할 수 있음 |
| versioned 해시 | manifest + inventory `versioned_candidate` | manifest가 정본이 되면 inventory의 해당 항목은 manifest 참조로 대체 가능 |
| `commands` 목록 | inventory와 `package.json` 양쪽 | `package.json`에서 유도하고 inventory는 effect·behavior만 보유 가능 |
| 계약 `evidence.line` | 줄 번호 복제 | 줄 번호 대신 심볼·마커 기반 참조로 전환 가능 |

유지해야 하는 것(변경 대상 아님): fresh install·기존 DB upgrade/restore·경합·중단·재시도·commit 결과 불확실성 검증, 미등록 SQL·불일치 이력·잘못된 성공 판정 실패 회귀, `observedDatabase`/`productionReady`가 항상 `false`인 경계.

## 5. 이 문서가 확인하지 않은 것

- 운영 DB, migration 적용·승격 상태, 비교표 이후의 변경 효과.
- 위 비교표의 "수정 지점 수"는 위 세 커밋 기준이며 모든 변경 유형을 대표하지 않습니다.
- #364의 나머지 완료 조건(유도 구현, 회귀 확인, 변경 전후 비교)은 이 문서의 범위가 아닙니다.
