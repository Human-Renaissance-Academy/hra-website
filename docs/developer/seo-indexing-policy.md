# 검색 색인·canonical 정책

이 문서는 공개 사이트의 기준 주소(canonical·Open Graph URL), `robots.txt`, `sitemap.xml`을 환경별로 어떻게 만드는지 정리한다. 관련 이슈는 #413(sitemap·robots)과 #414(canonical 기준)이다. 이 문서는 저장소 코드의 규칙이며, 실제 Production·Preview 배포에서 생성 결과를 확인했다는 뜻이 아니다.

## 1. 기준 주소와 색인 허용

규칙의 정본은 `src/lib/site-url.ts`의 `resolveSiteConfig()`다.

| 실행 환경 | 기준 주소(`metadataBase`) | 색인 |
| --- | --- | --- |
| Vercel Production (`VERCEL_ENV=production`) | `VERCEL_PROJECT_PRODUCTION_URL` → 없으면 `https://hra-website-theta.vercel.app` | 허용 |
| Vercel Preview·Development (`VERCEL_ENV`가 다른 값) | 해당 배포의 `VERCEL_URL` → 없으면 `NEXT_PUBLIC_APP_URL`/localhost | 금지 |
| Vercel 밖 (로컬·CI·로컬 `next start`) | `NODE_ENV=production`이면 고정 운영 주소, 아니면 `NEXT_PUBLIC_APP_URL`/localhost | 금지 |

- Preview는 운영 canonical을 복사하지 않고 **자기 배포 주소**를 기준으로 삼는다. 대신 전역 `<meta name="robots" content="noindex, nofollow">`와 전체 차단 `robots.txt`로 검색 결과에 나오지 않게 한다.
- 확인되지 않은 custom domain을 가정하지 않는다. 운영 도메인을 바꾸면 Vercel이 제공하는 `VERCEL_PROJECT_PRODUCTION_URL`이 먼저 반영되고, 고정 주소는 그 값이 없을 때의 대비값이다.

## 2. canonical

- 루트 레이아웃에는 canonical을 두지 않는다. 루트에 두면 모든 하위·없는 페이지가 홈 canonical을 상속한다.
- 주요 공개 페이지(홈·소개·커리큘럼·교수진·기수·모집안내·공지사항·언론보도·갤러리·수료생 이야기·FAQ)는 자기 경로를 canonical로 선언한다.
- 공지사항·언론보도·수료생 이야기 목록의 검색어·페이지 쿼리는 canonical에 포함하지 않고 기본 목록을 대표 주소로 쓴다.
- 공지 상세는 **게시된 공지**, 수료생 이야기·갤러리 상세는 **존재하는 항목**에만 canonical을 선언한다. 잘못된 ID·없는 항목·미발행 공지는 404이며 canonical을 내보내지 않는다.
- 기존 페이지 제목은 바꾸지 않았다.

## 3. robots.txt (`src/app/robots.ts`)

- Production: `Allow: /`, 관리자(`/admin`, 학사 화면 포함)·회원(`/member`, `/mypage`, `/resources`)·인증(`/login`, `/register`)·승인 대기(`/pending`)·`/system-error`·`/api/`를 `Disallow`하고 sitemap 위치를 안내한다.
- 공개 지원서 목록 `/recruitment/apply`는 모집안내의 주요 링크 대상이므로 크롤링을 막지 않는다. 다만 모집 기간에 따라 내용이 바뀌는 진입 화면이고 `/recruitment`에서 바로 연결되므로 sitemap에는 별도로 넣지 않는다.
- 그 외 환경: `Disallow: /`만 내보내고 sitemap을 안내하지 않는다.
- **robots.txt는 접근 통제가 아니다.** 크롤러에 대한 요청일 뿐이므로 보호 경로의 인증·인가는 Proxy·서버 액션·서비스의 권한 검사가 담당한다. 이 파일에는 비공개 ID나 숨겨야 할 경로를 적지 않는다.

## 4. sitemap.xml (`src/app/sitemap.ts`)

- Production에서만 URL을 내보낸다. 다른 환경은 빈 sitemap을 반환하고 DB를 조회하지 않는다.
- 경로 선택은 `src/features/sitemap/service.ts`가 맡는다. 공개 정적 경로와 **게시(PUBLISHED) 공지**, 수료생 이야기, 갤러리 앨범 상세만 포함한다. 관리자·회원·인증·학사 경로와 비공개 ID는 포함하지 않는다.
- 수료생 이야기·갤러리는 현재 게시 여부 열이 없어 공개 목록과 같이 전체 행을 사용한다. 게시·공개 여부 열이 추가되면 공개 목록·상세 쿼리와 같은 필터를 `src/features/sitemap/repository.ts`에도 적용해야 하며, 단위 테스트가 이를 알려 준다.
- 동적 콘텐츠 조회가 실패하면 오류를 기록하고 정적 경로만 반환한다.
- 인증 없는 공개 URL이 요청마다 DB를 조회하지 않도록 `revalidate = 3600`으로 캐시한다. 빌드 시 한 번 만들고 최대 1시간마다 백그라운드에서 다시 만든다. 새 게시물 반영은 최대 1시간 늦을 수 있다.
- 환경(`VERCEL_ENV`)은 빌드 시점 값으로 판단한다. Preview 빌드는 DB 조회 없이 빈 sitemap이 고정된다. 빌드 중 DB에 접속할 수 없으면 정적 경로만 담긴 sitemap으로 빌드가 끝나고 다음 재생성 때 게시 콘텐츠가 포함된다.
- `robots.txt`는 요청마다 생성(`force-dynamic`)한다. DB를 읽지 않는다.

## 5. 별도 운영 확인

다음은 코드 변경으로 완료되지 않으며 운영자가 따로 확인한다.

- 실제 Production·Preview 배포에서 `metadataBase`·canonical·OG URL, `/robots.txt`, `/sitemap.xml`의 응답과 상태 코드 확인
- 루트 metadata의 noindex·기준 주소와 sitemap은 빌드·서버 시작 시점의 `VERCEL_ENV`로 결정된다. Preview 배포를 Production으로 승격할 때 Vercel이 다시 빌드하는지(또는 Production 환경변수로 다시 시작하는지) 확인한다. 재빌드 없이 승격되면 Production에 noindex·Preview 주소가 남을 수 있다.
- Google Search Console 등 검색엔진 도구의 사이트 등록·sitemap 제출·색인 상태 확인
