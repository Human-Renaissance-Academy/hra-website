# 전체 경로 감사와 순차 수정 검증

이 문서는 **2026-10-17에 수행한 경로 감사의 결과 기록과 재현 방법**이다. 당시 검증의 의미를 확인하거나 같은 실행기로 새 변경을 검사할 때 읽는다. 아래 완료 수치·운영 읽기 결과·후속 이슈 수는 해당 시점의 기록이며, 현재 커밋이나 현재 운영 환경을 다시 검증한 결과가 아니다.

**경로(route)**는 화면이나 API의 URL 진입점이고, **manifest**는 빌드가 만든 경로 목록이다. HTTP 응답 수, 쓰기 테스트 수, 브라우저 측정 수는 서로 다른 단위이며 합쳐서 전체 기능의 통과 수로 해석하지 않는다. 결과를 읽을 때는 기준 SHA → 실행 범위 → 결과 분류 → 확인하지 않은 항목 순서로 확인한다. 새 변경의 기본 검증은 [품질 점검](../QUALITY-GATE.md)을 따른다.

당시 공개·회원·관리자 화면과 API를 다시 탐색하고, 확인한 오류를 한 건씩 수정해 관련 검증과 CI를 통과한 뒤 병합했다. 이 문서는 그 재현 방법과 증거의 범위를 보존한다.

## 2026-10-17 최종 검증 완료 기록

- 앱 검증 기준 SHA: `0203fcadb192aaae9d145b6565402a170127741d` (2026-10-17). 확인한 오류 **13종을 각각 관련 검증·빌드·CI 통과 후 순차 병합**했다.
- 전체 compiled manifest **125개 항목**, 실제 HTTP 요청 **801건**, 프레임워크 내부 항목을 포함한 결과 **803행**을 확인했다. 제품·기반 환경 오류 **0건**, 종료 코드 `0`, `completed`·`cleanupComplete`·`coverageHealthy` 모두 `true`다.
- 관리자 쓰기·거부·전송기 검사 **400/400**, 수정 계약 회귀 **4/4**를 같은 앱 SHA에서 별도로 재실행해 통과했다. 400개에는 정상 동작 66개와 거부·전송기 검증이 함께 포함된다.
- [최종 경로·역할·시나리오별 JSON 행렬](site-route-audit-results.json)에 상태·분류와 고정 marker를 보존했다. 실제 요청 URL·오류 원문·절대 작업 경로·인증 자료는 포함하지 않는다.
- 해당 SHA의 운영 Vercel 배포 성공 후 공개 읽기 16경로와 익명 관리자 목록 접근 차단 **17/17**을 다시 확인했다. 운영 로그인·쓰기 검사는 수행하지 않았다.

### 확인한 13종의 순차 수정 상태

| 순서 | 감사 ID | 범위 | 상태·PR |
| --- | --- | --- | --- |
| 1 | QA001 | 공지 검색 입력 처리 | 완료 · [#252](https://github.com/Human-Renaissance-Academy/hra-website/pull/252) 병합 |
| 2 | QA012 | 승인 대기 화면 렌더링 | 완료 · [#253](https://github.com/Human-Renaissance-Academy/hra-website/pull/253) 병합 |
| 3 | QA010 | 관리자 서식 편집 화면 | 완료 · [#254](https://github.com/Human-Renaissance-Academy/hra-website/pull/254) 병합 |
| 4 | QA011 | 이미지 업로드 요청 본문 검증 | 완료 · [#255](https://github.com/Human-Renaissance-Academy/hra-website/pull/255) 병합 |
| 5 | QA002 | 순서 변경의 원자 저장 | 완료 · [#256](https://github.com/Human-Renaissance-Academy/hra-website/pull/256) 병합 |
| 6 | QA003 | 학적 참조 회원 삭제 안내 | 완료 · [#257](https://github.com/Human-Renaissance-Academy/hra-website/pull/257) 병합 |
| 7 | QA013 | 오류 기록의 정보 최소화 | 완료 · [#258](https://github.com/Human-Renaissance-Academy/hra-website/pull/258) 병합 |
| 8 | QA004 | 없는 언론보도·FAQ 수정 결과 | 완료 · [#259](https://github.com/Human-Renaissance-Academy/hra-website/pull/259) 병합 |
| 9 | QA005 | 공지 검색과 방문 기록의 입력 동기화 | 완료 · [#260](https://github.com/Human-Renaissance-Academy/hra-website/pull/260) 병합 |
| 10 | QA006 | 홈 달력의 태블릿 가로 넘침 | 완료 · [#261](https://github.com/Human-Renaissance-Academy/hra-website/pull/261) 병합 |
| 11 | QA007 | 업로드 요청의 출처 판정 일관성 | 완료 · [#262](https://github.com/Human-Renaissance-Academy/hra-website/pull/262) 병합 |
| 12 | QA008 | 공유 다운로드 스트림 종료 처리 | 완료 · [#263](https://github.com/Human-Renaissance-Academy/hra-website/pull/263) 병합 |
| 13 | QA009 | 언론보도 삭제 실패 시 화면 복원 | 완료 · [#264](https://github.com/Human-Renaissance-Academy/hra-website/pull/264) 병합 |

## 재현 환경과 명령

기존 저장소의 설치된 `node_modules`와 로컬 PostgreSQL 실행 파일을 사용한다. 별도 의존성을 추가하지 않는다. 대상 앱은 **운영 환경 파일이 없는 절대 경로 worktree**여야 한다. 원본 `.env`나 운영 DB·Blob·OAuth 자격정보를 복사하지 않는다. `.env.example`은 실행 환경 파일이 아니다.

저장소에서 다음과 같이 새 격리 worktree를 만든다. `HEAD`는 검사할 변경이 포함된 커밋을 가리켜야 한다.

```bash
audit_source="$(git rev-parse --show-toplevel)"
audit_worktree="$(mktemp -d /tmp/hra-site-audit.XXXXXX)"
git -C "$audit_source" worktree add --detach "$audit_worktree" HEAD
ln -s "$audit_source/node_modules" "$audit_worktree/node_modules"

HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  node "$audit_source/scripts/verify-site-routes.mjs" \
  --app-root "$audit_worktree" \
  --output /tmp/hra-site-routes.json
```

`HRA_TEST_PG_BIN`은 해당 장비의 `initdb`·`pg_ctl`·`createdb`·`psql`이 있는 디렉터리로 바꾼다. 실행기는 임시 PostgreSQL과 합성 데이터를 직접 준비하므로 별도의 DB 주소를 제공하지 않는다.

특정 경로만 재검사하려면 `--only`를 추가한다. 값은 빌드 manifest의 경로이며 쿼리 문자열을 붙이지 않는다. 동적 경로는 실제 UUID 대신 manifest의 `[id]` 같은 표기를 사용한다.

```bash
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
  node "$audit_source/scripts/verify-site-routes.mjs" \
  --app-root "$audit_worktree" \
  --only /pending \
  --output /tmp/hra-site-route-pending.json
```

`--app-root`를 생략하면 실행기 저장소 자체를 대상으로 하므로 그 저장소도 환경 파일이 없어야 한다. `--output`은 선택 사항이고 `.json` 파일 경로를 받는다. 결과 파일은 정보 최소화 원칙에 따라 제한된 권한으로 저장한다. 검사 후 worktree를 제거할 때는 자신이 만든 경로와 남은 변경을 먼저 확인한다.

## 실행 단계와 종료 조건

1. 대상 worktree·환경 파일 부재·PostgreSQL 경로를 확인하고 실제 Drizzle 스키마와 범위 SQL로 격리 fixture를 설치한다.
2. 대상 앱에서 실제 `next build --webpack`을 수행한다. **빌드 단계**는 격리 DB를 사용하며 OG 생성에 필요한 공개 글꼴과 내장 자원을 읽을 수 있다. 빌드 성공은 HTTP 기능 검증을 대신하지 않는다.
3. 해당 빌드로 독립 포트의 `next start`를 실행한다. **HTTP 단계**는 로컬 앱과 명시된 격리 DB 전송만 허용하며 외부 DB·Blob·OAuth 호출을 차단한다. 운영 자격정보를 사용하지 않는다.
4. 실제 CSRF·credentials 로그인과 DB 세션 조회로 합성 계정을 확인한 뒤 compiled manifest의 화면·API를 탐색한다. 정상 진입 외에 역할·잘못된 식별자·없는 대상·검색/페이지 입력·빈 업로드 요청 경계를 검사한다.
5. 종료 시 자신이 시작한 서버·빌드 프로세스 그룹, 임시 DB와 임시 파일을 정리한다. 호출자가 만든 worktree와 결과 JSON은 남긴다.

제품 오류, 기반 환경/전송 오류, 빌드·인증 실패, 시간 초과 또는 정리 확인 실패는 종료 코드 `1`이다. 종료 코드 `0`이어도 거부 응답과 설정 제약이 정상 기능 실행으로 바뀌는 것은 아니다. JSON의 `sourceSha`, `scope`, `completed`, `cleanupComplete`, `coverageHealthy`, `summary`, `diagnostics`와 행별 분류를 함께 확인한다. `completed=true`는 검사를 끝냈다는 뜻이며 제품 오류가 없다는 뜻이 아니다.

## 역할과 결과 분류

HTTP 행렬에는 익명과 다섯 합성 계정이 있다. `manager`는 별도 전역 역할이 아니라 학사 지정 승인자로 설정한 계정이다.

| 검사 계정 | 확인하는 경계 |
| --- | --- |
| 익명 | 공개 진입과 로그인 필요 경로 |
| 승인 대기 `PENDING` | 승인 전 접근 제한 |
| 학생 `MEMBER` | 회원 자료와 본인 학사 범위 |
| 교수진 `FACULTY` | 교수진에게 허용된 기존 기능 |
| 홈페이지 관리자 `ADMIN` | 홈페이지 관리 범위 |
| 지정 학사 승인자 `manager` | 지정 계정의 학사 관리 범위 |

홈페이지 `ADMIN` 역할만으로 학사 운영 권한을 부여하지 않는다. G1 학사 설정을 켠 합성 검사와 운영에서 기능을 활성화하는 결정도 별개다.

| JSON 분류 | 의미와 검토 방법 |
| --- | --- |
| `NORMAL` | 정상 진입 후보. 기대한 화면·데이터와 일치하는지 확인한다. |
| `ACCESS_DENIED` | 권한 또는 입력 거부. 기대한 경계에서 거부했는지 확인하며 정상 CRUD 실행으로 세지 않는다. |
| `METHOD_BLOCKED` | 지원하지 않는 메서드 차단. 해당 API의 정상 메서드 검증을 대신하지 않는다. |
| `UNCONFIGURED` | 기능 설정 제약. 준비되지 않은 기능의 정상 동작을 입증하지 않는다. |
| `FIXTURE_LIMIT` | 합성 대상 부족 등 fixture 제약. 제품 통과로 간주하지 않는다. |
| `NOT_PUBLIC_ENTRY` | 프레임워크 내부 항목. HTTP 요청 수에 포함하지 않는다. |
| `PRODUCT_ERROR` | 요청 실패·서버 오류·오류 화면 등 수정할 제품 오류 후보. |
| `INFRASTRUCTURE_ERROR` | 격리 전송 또는 실행 기반 실패. 성공 응답에 흡수되더라도 정상으로 세지 않는다. |

## 수집한 증거와 한계

### 최종 전체 HTTP 결과

| 분류 | 최종 결과 행 수 |
| --- | ---: |
| `NORMAL` | 275 |
| `ACCESS_DENIED` | 436 |
| `METHOD_BLOCKED` | 72 |
| `UNCONFIGURED` | 18 |
| `NOT_PUBLIC_ENTRY` | 2 |
| `PRODUCT_ERROR` | 0 |
| `INFRASTRUCTURE_ERROR` | 0 |
| 합계 | 803 |

`UNCONFIGURED` 18행은 준비되지 않은 학사 업로드 경로의 설정 제약이며 정상 업로드 성공을 입증하지 않는다. `NORMAL`도 정상 진입 후보 분류로, 275개 기능이 모두 검증됐다는 뜻이 아니다. 진단은 서버 준비를 기다리는 `STARTUP_RETRY` 1종뿐이고 실패 진단은 없다. 서버 자손·임시 DB 정리까지 확인한 실행 종료 코드는 `0`이다.

### 수정 전 전체 HTTP 기준선

`ed38701`의 compiled manifest는 **125개 항목**이다. `/_global-error`·`/_not-found` 내부 항목 2개를 분류했고 **실제 HTTP 요청은 801건, 결과 행은 803개**다. 공개 글꼴 읽기가 필요한 빌드와 외부 요청을 제한하는 HTTP 단계를 분리한 기준선 재실행에서 다음 분류를 확인했다.

| 분류 | 결과 행 수 |
| --- | ---: |
| `NORMAL` | 272 |
| `ACCESS_DENIED` | 432 |
| `METHOD_BLOCKED` | 72 |
| `UNCONFIGURED` | 18 |
| `NOT_PUBLIC_ENTRY` | 2 |
| `PRODUCT_ERROR` | 7 |
| 합계 | 803 |

이 기준선은 검사와 정리를 완료했지만 제품 오류 7건 때문에 **종료 코드 `1`**이다. 수정 이후 전체 결과로 재사용하지 않는다. 이후 경로나 fixture가 바뀌면 manifest와 행렬 수도 다시 계산한다.

### 별도 쓰기·브라우저·운영 읽기 검사

| 검사 | 확인한 범위 | 해석할 때의 제한 |
| --- | --- | --- |
| 관리자 쓰기 QA | 최종 SHA에서 **쓰기 동작·거부·전송기 검증을 합친 400/400 통과**. 66개 함수 각각의 정상 실행 66개와 잘못된 입력·역할 경계·배치 전송 회귀를 포함한다. | 400개 모두 데이터 변경을 실행했다는 뜻이 아니다. 실제 액션·Drizzle·격리 PostgreSQL을 연결하되 인증 세션·Next 캐시/이동·Blob 응답은 격리한다. |
| 개별 오류 회귀 | 최종 SHA의 저장 원자성·회원 참조 보존·없는 언론보도/FAQ 수정 계약 **4/4 통과**. 각 PR에서도 관련 회귀를 수행했다. | 위 400개와 중복·별도 여부를 구분한다. 회원 참조 23개·정보 최소화 84개 등의 개별 수치를 전체 행렬에 합산하지 않는다. |
| 공개 지원서 Chromium | 합성 양식으로 **12개 시나리오**. 실제 5종 질문, 필수 누락, 제출 없이 이탈, 정상 제출, 중복 거부와 입력 유지, 비공개 전환, 모집 날짜 전후를 확인했다. | 기존 빌드·격리 DB를 사용했다. 취소 전용 UI 대신 이탈을 검사했으며 외부 구글폼·실제 연락 수신은 확인하지 않았다. 내부 접수는 [공개 여부 정책](../recruitment-intake-policy.md)을 따른다. |
| 수정 전 운영 공개 UI Chromium | 공개 16경로 × 390·800·1280px의 **48개 조합**, hydration 후 문서 가로 넘침을 측정했다. | QA006 수정 전 표본이며 당시 홈 800px 가로 넘침만 확인했다. 수정 후 전체 48조합 재검증 결과로 해석하지 않는다. |
| 수정 후 운영 공지 Playwright | 검색·방문 기록·입력 보존 회귀 **3개 통과**. | QA005의 운영 직접 증거이며 전체 HTTP·CRUD 검사를 대신하지 않는다. |
| 수정 후 운영 달력 Playwright | 달력 화면 회귀 **5개 통과**. | QA006의 운영 직접 증거이며 수정 전 48폭 조합 검사와 구분한다. |
| 운영 읽기 전용 HTTP | 최종 SHA에서 공개 16경로와 익명 관리자 접근 차단 1건 **17/17 통과**. 별도 기존 감사에서 실제 링크로 선택한 공지·갤러리·수료생 이야기 상세 각 1건, 한글 OG 이미지를 직접 확인했다. | 운영 로그인·쓰기 없이 읽었다. 운영 지원서 상세는 공개 목록에 링크가 없어 확인하지 않았고 합성 지원서 검사로 구분했다. |

쓰기 QA는 전체 HTTP 실행기에 포함되지 않는다. 환경 파일 없는 대상에서 별도로 실행한다.

```bash
(
  cd "$audit_worktree"
  HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin \
    ./node_modules/.bin/vitest run \
    tests/unit/route-audit-admin-crud.test.ts \
    tests/unit/route-audit-admin-postgres.test.ts
)
```

모든 검사는 정보 최소화 원칙을 적용한다. 공개 문서나 결과 공유에 실제 개인정보·인증 자료·SQL 매개변수·실제 파일 URL·오류 원문을 포함하지 않는다.

## 감사 당시의 별도 정책·외부 설정과 후속 학사 작업

감사 당시 확인한 13종과 별개로 **12개 열린 이슈**가 남아 있었다. 아래 표는 그 시점의 후속 범위를 보존하며 현재 열린 이슈 수나 우선순위 목록이 아니다. 최신 작업 순서는 [검토 후속 우선순위 추적 #300](https://github.com/Human-Renaissance-Academy/hra-website/issues/300)과 각 이슈의 현재 상태를 확인한다. 기관 정책·외부 설정 또는 선행 정책에 연결된 후속 구현을 구분하며, 이 감사의 기술 수정으로 정책을 확정하거나 운영 설정을 활성화하지 않는다.

| 이슈 | 남은 조건·범위 |
| --- | --- |
| [#142](https://github.com/Human-Renaissance-Academy/hra-website/issues/142) | 학사 개인정보·제출 파일의 보존·백업·파기 정책 확정 |
| [#143](https://github.com/Human-Renaissance-Academy/hra-website/issues/143) | 운영 인력·출결·교수 과제 검토·수료 정책 확정 |
| [#157](https://github.com/Human-Renaissance-Academy/hra-website/issues/157) | 관측 체계 기술 구현은 완료. #142의 보존·백업 정책과 일치하는지 확인 대기 |
| [#159](https://github.com/Human-Renaissance-Academy/hra-website/issues/159) | #143을 전제로 한 출결 모델·정정 서버 계약 |
| [#160](https://github.com/Human-Renaissance-Academy/hra-website/issues/160) | #143을 전제로 한 운영 인력의 출결 입력·현황·본인 열람 화면 |
| [#161](https://github.com/Human-Renaissance-Academy/hra-website/issues/161) | #143을 전제로 한 교수 계정 연결·담당 수업/과제 검토 권한 |
| [#162](https://github.com/Human-Renaissance-Academy/hra-website/issues/162) | #143을 전제로 한 과제 검토·피드백 이력·담당자 평가 화면 |
| [#163](https://github.com/Human-Renaissance-Academy/hra-website/issues/163) | 수료 기준·심사·확정 이력에 필요한 정책과 후속 구현 |
| [#164](https://github.com/Human-Renaissance-Academy/hra-website/issues/164) | 단계별 학사 전환의 추적 이슈. 선행 정책·구현 완료에 따라 갱신 |
| [#165](https://github.com/Human-Renaissance-Academy/hra-website/issues/165) | #143을 전제로 한 기수별 어드바이저·조교 배정과 출결 권한 |
| [#168](https://github.com/Human-Renaissance-Academy/hra-website/issues/168) | 릴리스 자동화의 봇·전용 토큰 설정이 미구성·비활성. 확인한 39회 실행은 모두 `SKIPPED`, 실패 0건으로 현재 권한 실패가 확인된 상태는 아님 |
| [#178](https://github.com/Human-Renaissance-Academy/hra-website/issues/178) | 카카오 콘솔 동의 설정과 실제 계정 이메일의 외부 확인 |

## 완료 확인

- [x] 확정 오류 13종을 한 건씩 수정하고 각 PR의 관련 회귀·빌드·CI 통과 후 병합했다.
- [x] 오류를 재현하던 별도 테스트를 수정 후 기대 계약의 회귀로 갱신했다.
- [x] 최종 앱 SHA에서 전체 manifest·HTTP 행렬, 쓰기 QA 400개와 수정 계약 회귀 4개를 각각 다시 실행했다.
- [x] 최종 SHA·경로/요청/결과 수·분류·종료 코드·정리 결과와 남은 제약을 문서와 JSON 행렬에 기록했다.

정상 Blob 실물 업로드·파일 스트림, OAuth 실제 계정 로그인, cron 정리 쓰기, 운영 자격정보를 사용하는 변경은 이 감사의 완료 근거에 포함하지 않는다. 합성 환경의 G1 검사로 운영 학사 활성화를 선언하지 않으며, G2 운영 인력·출결 권한의 미정 정책도 결정된 것으로 간주하지 않는다. 관련 범위는 [학사관리 로드맵](../ACADEMIC-MANAGEMENT-ROADMAP.md)과 [DB 변경 절차](database-change-procedure.md)를 따른다.

