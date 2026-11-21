# 브라우저 CSP와 HTTPS 정책

관련: #269. HTML 문서는 요청별 CSP nonce로 스크립트·스타일 요소를 제한합니다. API와 파일 다운로드는 별도 정적 정책을 유지합니다. CSP는 입력 검증·Markdown 정화·인증·인가를 대체하지 않습니다.

## 실제 배포 관측과 적용 판단

2026-10-22 Production의 홈·로그인·커리큘럼·교수진·기수·모집·공지·언론·갤러리·수료생·FAQ 11경로를 인증 없는 Chromium으로 읽었습니다. 모두 200이었고 기존 report-only 위반은 각 경로의 inline script 2회·inline style 요소 2회, style 속성 0~9회였습니다. 외부 출처 위반과 enforce 위반은 관측되지 않았습니다. 이는 해당 탐색의 관측이며 운영 계정·외부 OAuth·실제 Blob 전송 검증은 아닙니다.

관찰기는 페이지 시작 전에 `securitypolicyviolation`을 구독하여 directive·disposition·고정 자원 종류·개수만 집계합니다. 원본 event의 문서/차단/소스 URL·referrer·sample·nonce·HTML·쿠키는 저장하지 않습니다. 실제 사용자 자료의 원본 CSP 보고를 수집하는 공개 endpoint나 `report-sample`은 추가하지 않습니다.

## 문서 정책과 최소 예외

| 지시어 | 적용 범위와 이유 |
| --- | --- |
| `default-src 'self'` | 지정하지 않은 자원은 같은 출처로 제한 |
| `script-src 'self' 'nonce-…' 'strict-dynamic'` | Next 초기 스크립트와 그 신뢰 사슬. production `unsafe-inline`·`unsafe-eval`·광역 HTTPS 허용 없음 |
| `style-src 'self' 'nonce-…' 'sha256-…'` | Next·TipTap·에디터·인쇄 style 요소는 nonce, 설치된 Sonner CSS와 초기 빈 CSS만 정확한 hash 허용 |
| `style-src-attr 'unsafe-inline'` | React·Sonner·편집기·달력의 style 속성에 한정한 호환성 예외. 임의 style 요소 허용과 구분 |
| `img-src` | self·data·blob와 `src/lib/blob-host.ts`의 정확한 공개 이미지 저장소 |
| `font-src 'self' data:` | 자체 호스팅 글꼴과 내장 글꼴 |
| `connect-src 'self' https://vercel.com/api/blob/` | 같은 출처 토큰 교환과 Blob SDK의 단일 PUT·multipart API 경로. 저장소 wildcard나 Vercel 전체 경로를 허용하지 않음 |
| `frame-src 'self'` | 인증된 같은 출처 PDF iframe. 현재 사용하지 않는 Office 외부 출처 삭제 |
| `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` | 기존 HTML 삽입·기준 URL·폼·프레임 보호 유지 |

Sonner 2.0.8의 CJS/ESM이 삽입하는 CSS 14,916바이트의 검토 hash는 `sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=`입니다. 먼저 빈 style 요소를 문서에 삽입한 뒤 CSS를 추가하므로 빈 문자열의 `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=`도 한정 허용합니다. 빈 CSS는 규칙을 부여하지 않습니다. 실제 Chromium에서 이후 임의 CSS로 변경·추가하거나 parser로 삽입하면 여전히 차단되는지 검증합니다. 정상 스타일의 위반을 무시하는 필터는 사용하지 않습니다.

계약 테스트는 설치 파일을 실행하지 않고 TypeScript AST의 정적 문자열을 읽어 양쪽 구현과 대조합니다. 패키지의 CSS가 바뀌면 검사도 실패하므로 출처·실제 스타일을 재검토한 후 hash를 갱신합니다. hash 자체가 공급망 안전성을 보증하지는 않습니다.

재검토 기록(UTC 2026-11-21, Dependabot #611): Sonner 2.0.7 → 2.0.8에서 삽입 CSS가 14,859바이트(`sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=`)에서 14,916바이트로 바뀌었습니다. 배포본은 `registry.npmjs.org`의 `sonner-2.0.8.tgz`이고 lock integrity가 레지스트리 값과 같습니다. 같은 AST 추출로 비교하면 CJS와 ESM의 CSS가 같고 규칙 수는 110개로 같으며, 바뀐 규칙은 세 개의 표시 속성뿐입니다. `[data-styled=true] [data-content]`에 `flex:1;min-width:0` 추가, 닫기 버튼의 `color`·`border` 색 변수가 `--gray12`·`--gray4`에서 `--normal-text`·`--normal-border`로 바뀜, `[data-swiped=true]`에 `-webkit-user-select:none` 추가입니다. `url()`·`@import`·`expression(` 같은 외부 자원 로드나 실행 구문은 없습니다. `__insertCSS`의 빈 style 요소 삽입 후 텍스트 추가 방식도 같아 빈 문자열 hash는 유지했습니다. 이전 hash는 제거하여 허용 목록을 넓히지 않았고 `unsafe-inline` 등 완화는 추가하지 않았습니다.

실제 설치 Blob은 lockfile 기준 2.4.0입니다. SDK는 `/api/blob/?pathname=…`와 `/api/blob/mpu`를 사용하므로 뒤의 `/`가 없는 정확한 `/api/blob` 한 경로만 허용하면 업로드가 깨집니다. 브라우저 검증은 설치 SDK를 그대로 번들하여 1KiB 단일 전송과 10MiB multipart(8+2MiB)를 합성 응답으로 실행합니다. 토큰·파일·전송은 모두 합성이며 실제 공급자 연결은 하지 않습니다.

style 속성 예외와 신뢰된 스크립트의 동적 코드 로드는 남는 신뢰 경계입니다. 음성 검사는 parser가 삽입하는 nonce 없는 script와 허용되지 않은 style이 차단되는지, 올바른 nonce를 가진 양성 대조가 실행되는지 함께 확인합니다. 신뢰된 JavaScript에서 생성한 코드를 동일한 음성 검사라고 오인하지 않습니다.

## nonce와 요청·탐색 수명

`src/proxy.ts`는 매 HTML 요청에 256비트 nonce를 생성하고 외부 `x-nonce`·CSP를 덮어씁니다. 렌더 요청 헤더와 응답 CSP에 같은 값을 전달합니다. 응답 헤더만 바꾸면 Next 렌더러가 nonce를 알 수 없습니다. root layout은 `headers()`를 읽어 동적 렌더링을 명시하고 누락·잘못된 nonce를 임의 생성으로 보완하지 않습니다.

초기 문서의 nonce는 client context의 최초 state로 유지합니다. Link·prefetch·뒤로/앞으로·router refresh의 새 RSC 응답은 기존 문서 CSP를 바꾸지 않으므로 새 RSC nonce로 인쇄·편집기 style을 교체하지 않습니다. 전체 문서를 새로 읽으면 새 nonce를 사용합니다. TipTap의 자체 CSS 주입에도 같은 문서 nonce를 전달합니다.

기존 공개 layout은 이미 세션에 의존해 동적이었으며, 로그인·오류·404도 요청별 렌더링 대상이 됩니다. nonce 문서는 정적 HTML·ISR·PPR·기본 CDN HTML 캐싱의 이점을 유지할 수 없습니다. 이를 요청 간 nonce/세션 캐시로 우회하지 않습니다. 개발 모드에만 React 디버깅용 `unsafe-eval`을 허용하며 production 정책을 느슨하게 바꾸지 않습니다.

Proxy의 nonce 처리 범위와 인증 범위는 구분합니다. Auth.js는 기존 `/admin`, `/resources`, `/member`, `/mypage` 경로에서만 실행합니다. 원본 request/event를 유지하는 요청별 closure로 forwarding headers를 넘기며 애플리케이션에서 Server Action 본문을 읽거나 clone/tee하지 않습니다. 기존 redirect·403·갱신 쿠키·실패 차단과 #334의 동일 렌더 세션 공유를 유지합니다.

## API·PDF·학사 파일 정책

Next의 config 헤더는 Route가 만든 같은 이름의 응답 헤더보다 우선할 수 있습니다. 따라서 다음 규칙 순서를 실제 HTTP로 검증합니다.

1. 전역 X-Frame-Options·nosniff·Referrer-Policy·Permissions-Policy 유지.
2. API 경로에는 기존 frame/base/object/form CSP를 유지하여 Auth.js의 API HTML도 보호.
3. 자료실 다운로드(`/api/resources/:kind/:id/download`)는 `SAMEORIGIN`을 유지하고 기본 응답(첨부·이미지)에 `sandbox; default-src 'none'; frame-ancestors 'self'`를 둡니다. `?inline=1` PDF 미리보기만 뒤 규칙에서 `frame-ancestors 'self'` 기반의 기존 임베드 정책으로 덮습니다(#513). 2026-11-18·19 확인에서 Chromium 156과 Firefox 157(pdf.js)은 sandbox CSP가 붙은 PDF를 같은 출처 iframe과 직접 열기 모두에서 표시했습니다. WebKit·Safari 내장 뷰어는 확인하지 않았습니다.
   - **결정(#513):** Safari 미확인이므로 `?inline=1` 미리보기는 기존 임베드 정책을 유지합니다. Safari에서 sandbox CSP PDF가 iframe·직접 열기 모두 표시되는 것을 확인하면 미리보기도 같은 sandbox 정책으로 통일하고, `next.config.ts`·`scripts/verify-site-routes.mjs`·단위 테스트를 함께 바꿉니다.
   - Route는 `inline` 파라미터가 정확히 한 번 `1`일 때만 미리보기로 취급합니다. Next의 `has`(마지막 값)와 Route(첫 값)의 해석이 갈려 미리보기 응답에 sandbox 없는 정책이 붙는 일을 막습니다. 첨부 응답 검사에는 `private, no-store`도 포함합니다.
4. 학사 제출 파일은 마지막 config 규칙에서도 `sandbox; default-src 'none'`을 명시하여 broad API 규칙이 더 엄격한 정책을 덮지 않게 함.

자료 PDF는 실제 SDK PUT으로 G1 로컬 private 저장소에 넣은 합성 파일을 사용합니다. Next의 정상 200·PDF 바이트 해시·inline·private/no-store·nosniff·프레임 정책을 확인하며 404의 헤더만 보고 완료하지 않습니다. 학사 G1의 정상 다운로드에서도 sandbox·attachment/octet-stream·감사 및 바이트를 확인합니다. 업무 DB 제약이나 인가는 완화하지 않습니다.

## HTTPS와 HSTS

확인한 canonical 운영 host는 `hra-website-theta.vercel.app`입니다. HTTP 로그인 요청은 같은 host의 HTTPS로 308 이동했고 HTTPS 11응답 모두 `max-age=63072000; includeSubDomains; preload`가 관측됐습니다. [Vercel 공식 안내](https://vercel.com/docs/headers/response-headers#strict-transport-security)는 기본 2년 HSTS를 설명합니다. 충분한 플랫폼 제공 정책을 앱에서 중복 설정하지 않습니다.

[운영 smoke](../operations/production-smoke.md)는 실제 Production 네 응답의 유효한 단일 HSTS와 최소 1년 max-age를 자동 검사합니다. `preload` 토큰은 실제 preload 목록 등재의 증거가 아닙니다. 확인하지 않은 custom domain·하위 도메인 전체의 HTTPS나 로컬 HTTP·Preview 보호 상태를 보장하지 않습니다. 별도 운영 도메인을 추가하면 HTTPS redirect·HSTS를 그 host에서 다시 확인합니다.

## 실행·배포·복구

```bash
node --test scripts/tests/csp-browser.test.mjs
HRA_TEST_PG_BIN="$(pg_config --bindir)" npm run verify:csp
HRA_TEST_PG_BIN="$(pg_config --bindir)" npm run test:e2e:expanded
```

`verify:csp`는 새 전체 스키마·합성 계정·private fixture 저장소·실제 production 빌드에서 실행합니다. 격리 브라우저의 8개 고정 사례는 권한별 HTML, nonce 분리/위조 방지, 실제 Next 탐색의 에디터, 인쇄 3종, 음성/양성 canary와 실제 SDK를 포함합니다. 별도 G1 10개 사례와 공개 24개 사례도 유지합니다. 종료 때 소유 브라우저·서버·DB·저장소를 제거하고 외부 통신·의도된 자원 위반·hydration 오류가 있으면 실패합니다.

CSP UI 진단에만 `--reuse-build true`를 사용할 수 있으며 보고서에 재사용을 표시합니다. 최종 검증과 CI는 이 옵션 없이 새 빌드를 사용합니다. 실제 Preview가 Vercel SSO로 보호되면 인증 우회를 새 승인 조건으로 만들지 않고 접근 한계를 기록합니다. 최신 head의 격리 production 브라우저·CI·Vercel Preview 빌드 성공 후 머지하고, 정확한 merge SHA의 Production 배포 성공과 실제 공개 CSP/HSTS 관측을 확인합니다. 플랫폼에서 회귀가 발견되면 다음 이슈의 push/merge를 중단하고 수정 또는 검증한 이전 버전 복구를 우선합니다.

공식 근거: [Next CSP 가이드](https://nextjs.org/docs/app/guides/content-security-policy), [CSP3 요소·출처 판정](https://www.w3.org/TR/CSP3/#match-element-to-source-list), [CSP 위반 이벤트](https://www.w3.org/TR/CSP3/#securitypolicyviolationevent). 설치된 Next 16.4.2 가이드·헤더 문서·응답 전송 소스도 함께 확인했습니다.
