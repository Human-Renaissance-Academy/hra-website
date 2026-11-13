# 확장 E2E 회귀 검사

관련: [#332](https://github.com/Human-Renaissance-Academy/hra-website/issues/332). 기본 PR CI와 별도로 공개 브라우저 흐름을 검사하고 학사 G1의 사용자 여정을 다시 실행합니다. 모든 E2E 파일을 전수 실행하는 명령은 아닙니다.

## 실행과 비용

Node 24, PostgreSQL 실행 파일, Chromium을 준비한 **환경 파일 없는 worktree**에서 실행합니다. `HRA_TEST_PG_BIN`은 `initdb`·`pg_ctl`·`psql`이 있는 디렉터리입니다. 운영 DB·Blob·OAuth 설정을 전달하지 않습니다.

```bash
npm ci
npx playwright install chromium
node --test scripts/tests/expanded-*.test.mjs
HRA_TEST_PG_BIN="$(pg_config --bindir)" npm run test:e2e:expanded
```

이 명령은 전체 스키마·합성 공개 fixture를 새 PostgreSQL에 설치하고 실제 production 빌드를 만듭니다. 공개 테스트를 `--list`로 먼저 수집한 뒤 별도 프로세스에서 24건 실행합니다. 그 다음 기존 `test:academic-g1`이 별도의 축소 스키마 DB·합성 계정·로컬 private-store에서 10개 필수 사례를 실행합니다. 두 fixture의 계정 비밀번호와 스키마를 혼용하지 않습니다. 어느 단계든 실패하면 성공으로 끝내지 않습니다.

`.github/workflows/expanded-e2e.yml`은 매일 한국 시간 03:23과 수동 실행을 지원하며, 실행기·공개 spec·해당 workflow를 수정한 PR에서도 자체 검증을 실행합니다. 일반 PR의 기존 `.github/workflows/ci.yml`은 유지합니다. 예약은 GitHub 대기열에 따라 지연될 수 있습니다. 한 ref의 실행은 직렬 처리하고 25분 제한을 둡니다. 일일 한 번부터 시작하며 실제 소요와 불안정성은 Actions 로그의 단계 시간과 실패 사례로 판단합니다. 실행하지 않은 플랫폼의 시간·비용을 추정값으로 완료 보고하지 않습니다.

## 전체 spec 목록과 실행 범위

| spec | 흐름·위험 | 기본 PR CI | 확장 검사·외부 조건 |
| --- | --- | --- | --- |
| `home.spec.ts` | 공개 홈 제목·응답 | 미실행 | 합성 공개 DB, 1건 |
| `home-calendar-responsive.spec.ts` | 390·768·800·1024·1280px 달력 넘침·날짜/월/오늘 탐색 | 미실행 | 합성 공개 DB, 5건 |
| `keyboard-navigation.spec.ts` | 헤더·커리큘럼·FAQ·달력 키보드 탐색 | 미실행 | 합성 공개 DB, 3건 |
| `notice-search-history.spec.ts` | 검색·입력 유지·뒤로/앞으로 이동 | 미실행 | 합성 공개 DB, 3건 |
| `home-hero-reduced-motion.spec.ts` | 홈 Hero 모션 감소(SSR·JS 비활성 포함)와 타이핑 완료 시 제목 크기 전환의 레이아웃 안정성(390·768·1024·1280px) | 미실행 | 합성 공개 DB, 6건 |
| `faq-accordion.spec.ts` | FAQ 접힌 답변 inert·Tab 순서 제외, 열림/닫힘, 연락처 툴팁 | 미실행 | 합성 공개 DB, 4건 |
| `ci-smoke.spec.ts` | 로그인·이미지·보안 헤더·익명 보호 경로 | 실행 | 기존 필수 CI에서 유지 |
| `auth-protection.spec.ts` | 비로그인 보호 경로 | 직접 미실행 | 선택 제외. 공통 경로의 익명 거부는 필수 smoke로 확인 |
| `academic-roster.spec.ts` | 승인자 학생 등록·중복 거절 | 직접 미실행 | 선택 제외. 별도 storage state·기수 fixture 필요, 확장 G1의 명부 사례로 핵심 경계 확인 |
| `academic-assignment-admin.spec.ts` | 학사 과제 초안·공개·종료·잘못된 참조 | 직접 미실행 | 선택 제외. 별도 storage state·수업 fixture 필요, 확장 G1 관리자 사례 재사용 |
| `academic-submission-statuses.spec.ts` | 비로그인 현황·CSV 거부 | 직접 미실행 | 선택 제외. G1 역할 행렬·CSV 및 필수 Proxy에서 핵심 인가 확인 |
| `academic-student-ui.spec.ts` | 학생 목록·완료·모바일 오류·실제 공급자 업로드 | 직접 미실행 | 선택 제외. 명시적 UI QA 환경 필요. 실제 공급자 사례는 별도 승인된 Blob QA 필요 |
| `academic-g1.spec.mts` | 명부·관리자 과제·역할/기수 거부·학생 업로드/제출/다운로드·장애 복구·경합·CSV·보존 | 전용 runner 실행 | 같은 기존 runner로 필수 10개 사례 재실행, skip·중복·retry 불허 |

선택한 공개 24건도 고정 사례 목록과 개수를 검증하며 skip·중복·retry·`test.only`를 허용하지 않습니다. 목록 출력은 실제 실행과 구분됩니다. G1의 관리자 검증 범위는 학사 명부·과제이며 홈페이지 CMS의 모든 CRUD 화면을 브라우저로 전수 검사했다는 뜻은 아닙니다.

## 격리·실패 진단·정리

서버는 기존 `site-route-preload.mjs`의 DB 전송·fetch·undici·소켓 제한을 사용합니다. 공개 브라우저도 현재 앱 원점만 허용하며 리디렉션·WebSocket은 실패 처리합니다. 선택한 공개 화면은 production에서 두 기능에 의존하지 않습니다. 별도 로컬 canary 서버로 직접 외부 HTTP·외부로 향하는 리디렉션·WebSocket의 연결 0건과 검사 실패를 실제 Chromium에서 확인합니다. 실제 Google/Kakao 로그인, 실제 Vercel Blob, Production 가용성, Android/iOS는 이 검사의 범위가 아닙니다. Private 파일은 기존 G1의 로컬 저장소로 검증합니다. 상세 G1 사례는 [G1 품질 게이트](academic-g1-quality-gate.md)를 따릅니다.

공개 결과는 `test-results/expanded-public.json`에 source SHA·실행 범위·사례 ID/파일/줄·상태·고정 실패 코드·정리 여부만 남깁니다. 실패한 경우도 같은 JSON 한 파일만 7일간 artifact로 보관합니다. 재현은 표시한 사례의 소스 줄과 합성 fixture를 사용합니다. G1 결과는 Actions의 `PASS/FAIL G1_*` 코드와 필수 사례 수로 확인합니다. 원본 HTML·SQL·예외·세션 쿠키·토큰·인증 상태 파일을 artifact에 넣지 않습니다. Trace·스크린샷·영상은 요청 헤더나 사용자 데이터가 섞일 수 있으므로 이 게이트에서 비활성화합니다.

실패를 retry로 숨기지 않습니다. 누락·시간 초과·네트워크 차단도 실패로 기록하며, 수집 결과만 있거나 `completed`/`cleanupComplete`가 거짓이면 성공으로 읽지 않습니다. 실행기는 자신이 만든 앱/브라우저 프로세스 그룹과 임시 DB·브라우저 출력·설정 파일을 정리합니다. 정리가 확인되지 않으면 게이트를 실패 처리합니다. 공개 report만 임시 DB 밖의 무시되는 `test-results/`에 남깁니다.
