# 인증 비용과 권한 회수 검증

#334의 측정기는 운영 자격 증명 없이 실제 Next production 서버·Auth.js·전체 스키마의 일회용 PostgreSQL을 사용합니다. 비용 비교와 인가 회귀를 같은 실행에서 확인합니다.

## 재현

Node 24와 PostgreSQL 실행 파일을 준비하고 `.env.example` 외 환경 파일이 없는 깨끗한 worktree에서 실행합니다. 비교할 기준은 현재 commit의 조상이며 `package-lock.json` 내용이 같아야 합니다.

```bash
npm ci
node --test scripts/tests/auth-measurement*.test.mjs
HRA_TEST_PG_BIN="$(pg_config --bindir)" npm run verify:auth-measurement -- \
  --compare --baseline-ref 0ad2aab88a154c3c5ccf1ab0cfe52b99f3c9feec \
  --output test-results/authentication-measurement.json
```

기본값은 주요 시나리오당 20회와 합성 계정 200개입니다. `--samples 1..50`, `--population 1..200`으로 줄일 수 있습니다. `--single`은 현재 소스만 실행합니다. 개발 중 `--reuse-build`는 현재 `.next`를 재사용하므로 소스와 빌드가 일치한다는 증거가 되지 않습니다. 최종 비교는 commit 후 재사용 옵션 없이 실행합니다.

기준 소스는 실행기가 소유한 detached worktree에서, 현재 소스는 현재 worktree에서 별도로 빌드합니다. 양쪽은 같은 설치 의존성과 계측기를 사용하고 DB·서버·세션은 공유하지 않습니다. lockfile이 다르면 의존성 차이까지 최적화 효과로 오인하지 않도록 실패합니다. 새로운 Next/Auth.js 버전에서 관측 계약이 바뀌면 추정하지 않고 소스 계약 오류로 중단합니다.

[인증 비용·권한 회수 회귀 Actions](https://github.com/Human-Renaissance-Academy/hra-website/actions/workflows/authentication-measurement.yml)는 인증 관련 PR과 수동 실행에서 같은 비교를 수행합니다. 수동 실행에는 비교할 전체 commit SHA를 지정합니다. 최소 읽기 권한만 사용하고 정제 JSON 하나를 7일간 보관합니다. 외부 OAuth·Blob·운영 DB 비밀은 전달하지 않습니다.

## 관측 대상과 해석

| 시나리오 | 실제 요청과 검증 |
| --- | --- |
| 익명 공개 | `/curriculum` 정상 화면, 세션 없는 인증 호출도 집계 |
| 익명 보호 | `/mypage`의 로그인 이동 |
| 첫 로그인 | 정상 CSRF를 준비한 credentials callback POST, 비밀번호 검증·로그인 제한 DB 포함 |
| 회원·관리자·학사 승인자 | 각각 `/mypage`, `/admin/docs`, `/admin/academics` |
| Route Handler | 비활성 학사 파일 API: 인증 후 404, 학사 테이블·Blob 조회 없음 |
| Server Action | 교수진의 실제 `createClassMaterial`에 빈 입력: 인가 후 검증 실패, 업무 쓰기 없음 |
| 계정 규모 | 1·25·100·200개 서로 다른 세션으로 `/mypage` 직렬 순회, PENDING은 이동 검증 |

`auth()` 관측은 설치된 Auth.js의 검증된 내부 세션 Request 구성에서 수행합니다. 래퍼 등록이나 일반 `/api/auth/session` HTTP 요청을 호출수로 세지 않습니다. JWT callback만 세면 놓치는 익명 호출도 포함합니다. Proxy는 실제 호출 스택, RSC·Action은 이미 생성된 Next 실행 문맥, 로그인·Route는 드라이버의 고정 시나리오로 구분합니다. 단계를 알 수 없으면 실패합니다. 읽는 스택·SQL·쿠키는 보고서에 저장하지 않습니다.

DB 왕복은 격리 전송 계층의 **논리 Neon HTTP POST** 수입니다. 로컬 psql 어댑터가 결과 형식·타입을 구하는 부가 명령은 별도 업무 쿼리로 세지 않습니다. HTTP p50/p95는 최근접 순위이며 응답 본문 소비·화면 렌더링·로컬 어댑터 비용을 포함합니다. DB 시간도 이 어댑터의 시간이며 파일·스택 관측의 계측 비용도 포함합니다. 운영 Neon/Vercel 지연이나 수용 용량을 나타내지 않습니다. 200개는 서로 다른 계정 수이며 동시 접속 200명이 아닙니다. 동일 환경의 호출수 감소가 주된 판단 근거입니다.

Action 실패 응답에 후속 RSC 렌더가 없으면 RSC 호출수는 0이 맞습니다. Proxy와 RSC를 하나의 캐시로 합치지 않습니다. DB 오류율은 정상 측정 표본의 실패 POST/전체 POST이며, 별도 장애 주입 회귀 결과와 구분합니다. 작은 표본과 한 번의 전후 실행으로 통계적 성능 보장을 주장하지 않습니다.

## 중복 제거와 회귀 경계

`src/lib/request-session.ts`의 모듈당 단일 React `cache()` 함수는 동일 서버 렌더 패스의 세션 조회만 공유합니다. 회원·관리자·학사 승인자 헬퍼는 매번 각자의 권한을 검사합니다. Proxy와 직접 인증하는 액션·API, JWT의 DB 사용자·역할·`sessionVersion` 재검증은 유지합니다.

React는 다음 요청에 이 결과를 재사용하지 않습니다. 액션과 Route Handler는 렌더 패스 밖이어서 이 래퍼로 메모이제이션되지 않습니다. TTL·전역 역할 캐시가 아니며 다음 실제 요청에서 변경된 DB 상태를 확인합니다. 이미 진행 중인 한 렌더 패스에서는 첫 세션 결과를 공유하므로 그 패스 중간의 DB 변경을 즉시 다시 읽는다는 뜻은 아닙니다. 레이아웃만으로 인가하거나 개별 페이지·업무 인가를 삭제하지 않습니다.

각 비교에서 A→B→A 계정 교대와 A/B 동시 요청의 화면 식별을 확인합니다. 별도 요청 전 DB의 `sessionVersion` 증가·ADMIN 강등·PENDING 전환·사용자 삭제를 적용하여 구 쿠키의 보호 화면 거부를 확인하며, 세션 폐기 뒤 새 로그인도 확인합니다. 실제 `users` 테이블을 잠시 사용할 수 없게 만드는 장애에서 학사 파일 API가 실패 차단하는지 확인하고 반드시 복구합니다.

Provider binding은 외부 OAuth를 흉내 낸 성공 건수로 보고하지 않습니다. 다음 99개 기존 회귀를 변경 전후 모두 실행합니다. 설치된 실제 Auth 공개 API의 합성 공급자 PKCE·공급자 혼동 거부, 애플리케이션 signIn IO 순서·바인딩 판단, JWT의 바인딩 우선 조회·이메일 대체 조회 금지를 확인합니다. 실제 Google/Kakao 운영 설정 검증은 별도 #267 범위입니다.

```bash
npx vitest run tests/unit/oauth-provider-boundary.test.ts \
  tests/unit/auth-signin-io.test.ts tests/unit/auth-jwt-session.test.ts
```

공식 근거: [React cache](https://react.dev/reference/react/cache), [Next 인증 DAL](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal). 설치된 Next 16.4.2 안내도 `node_modules/next/dist/docs/01-app/02-guides/authentication.md`에서 확인했습니다.

## 출력과 정리

JSON에는 소스 SHA·lock hash·설치 버전·고정 시나리오의 수치·회귀와 정리 성공 여부만 남깁니다. `worktreeClean`과 `reusedBuild`는 HEAD와 실제 작업·빌드의 차이를 해석하는 표식입니다. 최종 증거는 각각 참·거짓이어야 합니다. 계정 UUID·이메일·토큰·쿠키·SQL·HTML·원본 예외·환경 값은 저장하지 않습니다. 실행기는 소유한 프로세스 그룹·임시 DB·기준 worktree를 종료·제거합니다. `complete`와 `cleanupComplete`가 모두 참이고 `diagnostics`가 비어 있어야 성공입니다. 실패한 집계 일부는 진단을 위해 보존할 수 있으나 완료 증거로 읽지 않습니다.

## 2026-10-22 합성 비교 결과

기준 `0ad2aab88a154c3c5ccf1ab0cfe52b99f3c9feec`, 변경 `291865082966921fe681e782c283818b9ad1c001`에서 빌드를 재사용하지 않고 실행했습니다. 두 worktree 모두 깨끗했고 lock hash는 `6ddeb5f8b7d8c115dca5b797612dcc8ca5ff62c28db2439e0723086755a6638e`로 같았습니다. Node v24.14.0, Next 16.4.2, Auth.js 5.0.0-beta.32, PostgreSQL 14.24 환경입니다.

아래 인증·DB 수는 요청당 p50이며 HTTP 시간 단위는 ms입니다. 모든 정상 측정 시나리오의 DB 오류율은 양쪽 모두 0입니다.

| 시나리오 | 표본 수 | 인증 전→후 | DB 전→후 | HTTP 전 p50/p95 | HTTP 후 p50/p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| credentials 첫 로그인 | 20 | 0→0 | 4→4 | 357.90/381.90 | 393.77/445.68 |
| 익명 공개 | 20 | 1→1 | 0→0 | 9.73/66.99 | 12.42/21.52 |
| 익명 보호 | 20 | 1→1 | 0→0 | 2.59/15.36 | 2.73/11.76 |
| 회원 화면 | 20 | 3→2 | 3→2 | 46.66/82.09 | 41.57/98.77 |
| 관리자 화면 | 20 | 3→2 | 3→2 | 47.39/69.07 | 52.72/65.07 |
| 학사 승인자 화면 | 20 | 3→2 | 3→2 | 41.41/55.44 | 36.32/58.39 |
| 학사 파일 Route | 20 | 1→1 | 1→1 | 14.25/18.52 | 17.75/41.33 |
| 교수진 검증 실패 Action | 20 | 2→2 | 2→2 | 31.22/42.77 | 34.73/58.29 |
| 계정 1개 순회 | 1 | 3→2 | 3→2 | 53.33/53.33 | 42.73/42.73 |
| 계정 25개 순회 | 25 | 3→2 | 3→2 | 49.89/65.20 | 38.87/51.81 |
| 계정 100개 순회 | 100 | 3→2 | 3→2 | 44.65/58.91 | 39.74/63.26 |
| 계정 200개 순회 | 200 | 3→2 | 3→2 | 42.99/52.62 | 38.39/53.15 |

회원·관리자·승인자 화면은 각각 Proxy 1회 + RSC 2회가 Proxy 1회 + RSC 1회가 되어 인증·DB 조회가 3→2회로 줄었습니다. 200계정 순회의 DB 합계는 598→399회입니다. 마지막 PENDING 계정은 Proxy에서 거부되어 양쪽 모두 1회입니다. credentials callback의 인증 호출수 0은 로그인 생략을 뜻하지 않습니다. 공개 Auth HTTP 핸들러가 직접 로그인 처리하며 이 지표의 `auth()` 헬퍼를 부르지 않고 DB 4회(로그인 제한 2·자격 조회 1·세션 조회 1)를 수행합니다.

양쪽 모두 계정 교대·동시 계정 분리·세션 버전 증가와 새 로그인·강등·PENDING·삭제·실제 DB 장애의 회귀 7개와 자원 정리에 성공했습니다. 공급자 바인딩 99개 회귀도 변경 전후 통과했습니다. 동일 렌더의 중복 DB 조회가 실제로 존재하므로 좁은 메모이제이션을 적용했습니다. p95는 회원·승인자 등 일부 표본에서 증가했으므로 운영 지연 개선이나 성능 보장을 주장하지 않습니다. 로컬 어댑터·계측·실행 편차를 포함한 단회 비교이며 호출수 감소가 채택 근거입니다.
