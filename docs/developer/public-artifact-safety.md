# 공개 JSON 산출물 검사

공개 저장소의 Actions 산출물은 다운로드 권한을 가진 사용자가 열람할 수 있다. 세 보고서 업로드 바로 앞에서 `scripts/check-public-artifact.mjs`를 실행하며, 검사 성공 때만 같은 파일을 7일 보관한다.

| 종류 인수 | 검사·업로드 파일 | 허용 내용 |
| --- | --- | --- |
| `expanded-public` | `test-results/expanded-public.json` | 고정 공개 브라우저 12사례, 정제 오류 코드·줄 번호·완료 상태. 공개 모드의 작업 루트는 `.`이다. |
| `authentication-measurement` | `test-results/authentication-measurement.json` | 고정 시나리오·단계별 수치, SHA·lock hash·버전, 회귀 boolean, 고정 진단 코드 |
| `production-smoke` | `test-results/production-smoke.json` | 고정 공개 경로 4개, HTTP 상태·소요 시간·고정 오류 코드, 소스 SHA와 한계 문구 |

예시:

```bash
node scripts/check-public-artifact.mjs --kind production-smoke --file test-results/production-smoke.json
node --test scripts/tests/public-artifact-policy.test.mjs
```

검사는 Node 내장 기능만 사용한다. 파일 누락, 256 KiB 초과, 잘린 JSON, 잘못된 UTF-8, 중복 JSON 키·비정규 표기, 알려지지 않은 인수·필드·중첩 필드, 허용되지 않은 문자열·비정상 수치를 거부한다. credential·cookie 표식, 이메일·전화·UUID·URL의 대표 위험 패턴도 거부한다. 정상 보고서의 SHA와 버전, 고정 공개 경로와 진단 코드는 닫힌 계약으로 허용한다. 새로운 필드·한계 문구·버전 형식이 필요하면 생산자와 검사를 함께 검토한다. 임의 오류 메시지·SQL·HTTP 본문·브라우저 trace·실제 식별자·secret URL을 추가하지 않는다.

검사 단계는 `always()`로 앞선 실행이 실패해도 동작한다. 업로드는 `always() && steps.artifact_safety.outcome == 'success'`에 연결한다. 파일이 없으면 검사도 실패하고 업로드를 막는다. 운영 smoke의 합성 알림 모드는 고정된 `fixture` 보고서를 검사·보관하지만 원래 의도된 job 실패를 성공으로 바꾸지 않는다. 검사와 업로드 사이 파일을 수정하는 단계를 추가하지 않는다.

검사 로그는 성공 표식 `PUBLIC_ARTIFACT_SAFE` 또는 실패 표식 `PUBLIC_ARTIFACT_REJECTED`만 출력하며 파일 경로·원문·예외를 기록하지 않는다. 이 게이트는 세 JSON의 알려진 공개 계약과 대표 위험 패턴을 검증하는 방어층이다. 모든 개인정보·비밀정보 부재를 증명하지 않으며 숫자에 인코딩한 정보나 악의적으로 수정한 생산자까지 완전히 탐지하지 않는다. 소스·Git history 검사와 별도로 유지한다. 임의 스캐너 원본 결과를 새 산출물로 업로드하지 않는다.

## JSON 보고서가 아닌 산출물

위 세 JSON 보고서 외에 모바일 workflow 두 개가 산출물을 올립니다. 이 파일들은 `check-public-artifact.mjs`의 종류 검사 대상이 아니므로 아래 근거로만 허용하며, 공개 저장소에서 계속 보관할지는 소유자가 정합니다.

| workflow | 산출물 | 내용과 근거 |
| --- | --- | --- |
| `mobile.yml` | `hra-android-debug` (debug APK, 7일) | 공개 소스의 debug 빌드입니다. 운영 API 주소와 비밀값을 주입하지 않으며, 같은 방식으로 로컬에서 만든 APK의 압축을 풀어 비밀 패턴이 없음을 확인했습니다. 생성 프로젝트의 기본 debug 키로 서명되어 배포용이 아닙니다. |
| `mobile-server-e2e.yml` | `mobile-server-failure` (실패 때만, 7일) | 환경을 비운 빌드 출력과 하네스 출력입니다. 하네스는 고정 사례명·오류 코드·소스 위치와 토큰·비밀번호 패턴을 걸러낸 모듈 로드 오류 한 줄만 출력합니다. |

두 workflow 모두 `secrets.*`를 참조하지 않습니다. 이 근거는 현재 하네스의 출력 계약과 APK 설정에 의존하므로 그 둘을 바꿀 때 다시 확인해야 합니다.

## 공개 문서·테스트의 대표 개인정보 표식

```bash
node scripts/check-public-sources.mjs
node --test scripts/tests/public-source-policy.test.mjs
```

소스 검사 명령은 인수를 받지 않으며 저장소 루트에서 실행한다. 현재 `git ls-files`에 포함된 `docs/`, `tests/`, `content/`, 루트 `README.md`·`AGENTS.md`·`.env.example`, `.github/ISSUE_TEMPLATE/`·`.github/PULL_REQUEST_TEMPLATE.md`가 범위다. 임의 다른 디렉터리와 미추적 파일, Git history의 개인정보는 이 검사 범위에 포함하지 않는다. 전체 fetched history와 다른 소스의 credential 검사는 별도 Gitleaks 게이트가 담당한다.

텍스트 확장자 `md`, `mdx`, `txt`, `json`, `yaml`, `yml`, `js`, `mjs`, `cjs`, `ts`, `mts`, `cts`, `tsx`, `html`, `css`, `sql`, `csv`, `py`, `sh`, `svg`, `snap`과 `.env.example`을 읽는다. PDF·사진·폰트 등 바이너리 내부의 개인정보나 OCR은 검사하지 않는다. 범위 안의 심볼릭 링크·상위 경로 이탈, 누락된 추적 파일, 잘못된 UTF-8, 파일당 4 MiB·전체 64 MiB 한도 초과는 검사 실패다. 최대 추적 경로 수는 10,000개다.

일반 이메일, 한국 휴대전화(`+82`·공백·점·하이픈 변형 포함), 주민등록번호 모양, literal Auth.js/NextAuth 세션 쿠키 대입과 JWT 모양을 탐지한다. 이는 알려진 패턴의 방어층이며 모든 개인정보·비밀정보 부재를 증명하지 않는다. 암호화·난독화·인코딩·분할한 값과 이름·주소 등의 자연어 개인정보까지 포괄하지 않는다. URL의 userinfo도 이메일 표식을 검사한다. URL 전체나 userinfo를 광범위하게 제외하지 않으며 credential 노출 여부는 Gitleaks가 별도로 검사한다.

[예약 예시 도메인 RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)에 따라 `.invalid`·`.test`·`.example`·`.localhost`, `example.com`·`example.net`·`example.org` 및 각각의 하위 도메인은 이메일 예시로 허용한다. GitHub의 정확한 `users.noreply.github.com`·`noreply.github.com`과 프로젝트 내부 주소의 정확한 `oauth.placeholder`도 기술 namespace로 허용한다. `oauth.placeholder.com`과 임의 하위 도메인·유사 도메인은 광범위하게 제외하지 않는다.

기존 redaction·DTO·지원서·props·SDK 잘못된 메타데이터·단발성 스크립트 안전 테스트 및 `.env.example`의 직접 작성 합성 표본은 `security/source-fixtures.json`에 **파일·규칙·매칭 값 SHA-256·검증 목적** 조합으로만 기록한다. 같은 파일의 다른 새 값도 실패한다. 파일 전체·`tests/**`·임의 정규식 예외는 금지한다. 이 목록은 개인정보를 수집하는 목록이 아니며 원문 값을 추가하지 않는다. 합성 여부와 실제 테스트 목적을 검토한 후에만 예외를 바꾼다.

정상 검사 결과는 `PUBLIC_SOURCE_CHECKED`와 고정 규칙별 발견 수·검토된 합성 표본 수만 출력한다. 미분류 표식이 하나라도 있으면 종료 코드 1이다. 실행·입력 오류는 `PUBLIC_SOURCE_CHECK_FAILED`만 출력한다. CLI는 원문·파일 경로·줄 번호·해시를 출력하지 않으며 원본 finding 보고서를 artifact로 올리지 않는다. 실제 개인정보가 의심되면 공개 이슈·로그에 값을 복제하지 않고 비공개 대응 절차를 따른다.
