# 운영 공개 경로 점검과 장애 확인

관련: [#333](https://github.com/yeongseon/hra-website/issues/333). **배포 성공**은 앱 생성·배포 결과이고 **smoke 성공**은 공개 경로 여섯 개의 콘텐츠·보안 헤더 응답 계약 결과입니다. 로그인·관리자 쓰기·과제·OAuth·실제 업로드 성공을 대신하지 않습니다. 이 점검의 HTTP 응답만으로 서비스 중인 SHA를 증명하지도 않습니다.

## 대상과 실행

`scripts/verify-production-smoke.mjs`는 `https://hra-website-theta.vercel.app`만 대상으로 하며 `/`, `/login`, `/favicon.ico`, `/api/health`, `/robots.txt`, `/sitemap.xml`을 GET으로 읽습니다. 동시 요청은 최대 2개, 경로별 제한은 15초, 본문 상한은 2MiB, redirect는 거부하고 retry는 하지 않습니다. Cookie·Authorization·health secret을 보내거나 환경 파일을 읽지 않습니다.

| 경로 | 성공 계약 | 실패 의미 |
| --- | --- | --- |
| `/`, `/login` | 200, HTML, 한국어 lang와 HRA 표식 | 상태 코드·MIME·예상 콘텐츠 불일치 |
| `/favicon.ico` | 200, ICO MIME와 파일 헤더 | HTML fallback 등 잘못된 정적 응답 |
| `/api/health` | 200, JSON `{status: "ok"}`만 포함 | DB를 포함한 공개 health 실패 또는 상세 정보 노출 |
| `/robots.txt` | 200, text/plain, 기본 UA의 공개 허용·보호 경로 거부·고정 sitemap 주소 | 그룹·경로 대소문자·색인 정책 오류 |
| `/sitemap.xml` | 200, XML MIME, sitemap namespace·완결된 URL 구조·같은 origin의 공개 URL | 손상 문서·주석뿐인 URL·보호 경로·쿼리 URL 포함 |

robots는 [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)의 그룹·주석을 구분하고 키워드·UA의 대소문자와 경로의 대소문자를 혼동하지 않습니다. 다른 UA에만 적용되는 거부 규칙으로 기본 `*` 정책을 충족했다고 판정하지 않습니다. 특정 UA의 전체 차단은 허용하지만 보호 경로를 다시 허용하는 별도 그룹은 실패합니다. robots는 인가 수단이 아닙니다.

sitemap 검사는 **현재 Next가 생성하는 제한된 문법**(`urlset` namespace, `url`과 순서가 있는 `loc`·선택 `lastmod`/`changefreq`/`priority`)을 대상으로 합니다. XML 주석은 URL 항목으로 세지 않고, 미완성·중복 루트/요소·태그 중간 주석·알 수 없는 entity는 실패합니다. 정의된 문자 참조를 해제한 URL도 같은 origin·쿼리/fragment/자격정보 없음·보호 경로 제외 계약을 충족해야 합니다. 중복 슬래시와 원문·디코딩 후 역슬래시 경로는 Next의 정규화 차이를 추측하지 않고 거부합니다. 일반 XML 파서나 XML schema 전체 검증이 아니며 이미지·다국어 등 새로운 sitemap 문법을 도입하면 대응 검증도 함께 바꿔야 합니다. 원문은 보고서에 포함하지 않고 고정 `SEO_CONTENT`만 남깁니다. 실제 Preview 메타데이터·Search Console 소유/제출 상태는 이 점검의 범위 밖입니다.

여섯 HTTPS 응답 모두 `Strict-Transport-Security`의 단일 `max-age`가 유한한 안전 정수이며 최소 `31536000`초(1년)인지 검사합니다. 현재 canonical Production 관측값은 `63072000`초(2년)이며 앱에서 플랫폼 헤더를 중복 설정하지 않습니다. 숫자 또는 인용을 해제한 뒤 숫자인 `max-age`, 지시어 이름의 대소문자·HTTP 공백(SP·HTAB)과 선택적인 `includeSubDomains`·`preload`는 허용합니다. 누락 `max-age`, 이름의 대소문자를 무시한 모든 지시어 중복(`includeSubDomains`·`preload`·알려지지 않은 확장 포함), 쉼표로 합쳐진 복수 헤더, NBSP 등 HTTP 공백이 아닌 문자·숫자 뒤의 임의 문자·소수·지수·음수·1년 미만 값은 `HSTS_INVALID`입니다. 결과에는 원래 HTTP 상태와 고정 코드만 기록하며 헤더 원문은 저장하지 않습니다. 중복 지시어는 브라우저가 전체 헤더를 무시하는 [RFC 6797 §6.1](https://www.rfc-editor.org/rfc/rfc6797#section-6.1) 계약에 따라 거부합니다. HSTS가 정상인 비정상 HTTP 응답은 기존 `HTTP_STATUS`로 기록합니다.

`HSTS_INVALID`는 공개 콘텐츠가 200이어도 보안 헤더 계약이 실패했다는 의미이며 서비스 전체 중단과 구분합니다. 확인 범위는 위 canonical 호스트의 여섯 응답입니다. `preload` 토큰은 실제 브라우저 preload 목록 등재의 증거가 아니며, 확인하지 않은 커스텀 도메인·Preview·모든 서브도메인의 HSTS를 보장하지 않습니다. [Vercel HSTS 문서](https://vercel.com/docs/headers/response-headers#strict-transport-security)를 참고합니다. HTTP 루프백 `fixture` 모드에는 이 HTTPS 헤더 계약을 적용하지 않으므로 합성 health 503 알림 경로는 그대로 유지됩니다.

공개 health 503은 DB 연결·설정 등 원인 확인이 필요하다는 신호이며 DB 장애의 원인을 확정하지 않습니다. 상세 health는 별도 승인된 운영 절차에서만 `HEALTH_CHECK_SECRET`을 사용합니다. 이 자동화는 해당 비밀값을 받지 않습니다.

Node 24에서 의존성 설치 없이 명령을 재현할 수 있습니다.

```bash
npm run verify:production-smoke -- --sha "$(git rev-parse HEAD)" --sha-kind main --output test-results/production-smoke.json
node --test scripts/tests/production-smoke*.test.mjs
```

첫 명령은 실제 공개 사이트에 여섯 번 접속합니다. 결과의 `shaKind=main`은 점검 코드의 기준 SHA입니다. 성공한 배포 이벤트에서는 `shaKind=deployment`와 해당 deployment SHA를 기록합니다. 어느 값도 HTTP 응답의 암호학적 버전 증명은 아닙니다. 합성 테스트는 명시적인 fixture 모드에서만 숫자 루프백 서버를 허용합니다.

## 예약·배포 후 실행과 비용 범위

`.github/workflows/production-smoke.yml`은 성공한 **Production** `deployment_status` 뒤, 매시 17분 UTC, 수동 실행에서 점검합니다. Preview와 실패 배포에서는 실행하지 않고 PR 코드는 합성 계약만 검사합니다. 운영 점검 job은 직렬 처리하며 5분 제한을 둡니다. 시간당 6회, 일일 기본 144회의 공개 GET부터 시작하고 배포·수동 실행은 별도입니다. npm 설치·DB·상시 서버·외부 알림 서비스를 추가하지 않습니다. 비용·지속 SLA를 보장하지 않으며 실제 소요는 Actions 실행 시간을 확인합니다.

예약은 기본 브랜치에서 실행되고 플랫폼 부하로 지연·누락될 수 있으므로 상시 모니터/SLA로 취급하지 않습니다. 공개 저장소에 60일간 활동이 없으면 예약 workflow가 자동 비활성화될 수 있습니다. 운영 담당자는 주기적으로 마지막 실행 시각과 active 상태도 확인합니다. `inactive` deployment 상태는 이벤트 실행을 만들지 않습니다. [GitHub 일정·이벤트 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [deployment 상태 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status).

## 알림 채널과 담당자

최소 채널은 [운영 가용성 점검 Actions](https://github.com/yeongseon/hra-website/actions/workflows/production-smoke.yml)의 **실패 상태·작업 요약·정제 JSON artifact**입니다. 운영 확인 담당은 저장소 관리자(현재 `yeongseon`)이며 기수별 출결 담당 권한과는 관계없습니다. 스크립트의 실패 종료는 실제 job/run failure로 전파합니다. [종료 코드 계약](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/set-exit-codes), [작업 요약 계약](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary).

이메일·웹 알림은 개인 구독·설정에 따라 달라집니다. 저장소 소유자에게 자동 이메일이 도착한다고 보장하지 않습니다. 예약 알림 수신은 일정 작성/수정자와 재활성화 사용자에 영향을 받으므로 담당자 교체 시 cron·개인 알림 설정을 함께 점검합니다. 개인 이메일 수신 완료는 이 구현의 검증 범위가 아닙니다. [실행 알림](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs), [개인 알림 설정](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).

1. `fixture` 또는 **의도된 실패** 실행인지 먼저 구분합니다. 해당 수동 실행은 운영 장애가 아닙니다.
2. 실제 Production 실패는 해당 run의 SHA 종류·환경·실패 경로·코드·시각을 확인합니다. 첫 실패부터 Actions에 표시하며 두 번 연속 실패는 약 한 시간 간격의 표본에서 문제가 반복됐다는 확인 신호로 취급합니다. 그 사이의 연속 장애 시간이나 여섯 경로 표본을 서비스 전체의 5xx 비율·p95로 일반화하지 않습니다.
3. `HSTS_INVALID`이면 해당 canonical 호스트의 배포·플랫폼 보안 헤더를 확인합니다. 이를 콘텐츠 장애로 단정하거나 점검 통과를 위해 헤더 검사를 완화하지 않습니다. 상태 코드·콘텐츠 오류는 한 번 수동 재실행해 일회성 timeout과 반복 실패를 구분합니다. 자동 retry·실패 숨김은 없으며 동일 장애가 실행별 반복 알림으로 나타날 수 있습니다. 별도 Slack·호출 시스템과 중복 알림을 만들지 않습니다.
4. `/api/health` 503이면 승인된 상세 점검·서버 로그·DB 상태를 확인합니다. `PRODUCTION_SMOKE_FAILED`만 있거나 JSON이 정상인데 job이 실패하면 점검기 입력·요약/파일 저장 등 실행 환경 오류도 먼저 분리합니다. 운영 원문·URL·토큰을 공개 이슈에 붙이지 않습니다.
5. 배포 직후 문제라면 현재 SHA와 마지막 성공 배포를 구분합니다. 앱 롤백 여부는 [배포 안전 절차](../contributing/build-and-deploy-safety.md)에 따라 판단합니다. DB 변경이 얽히면 [DB 변경 절차](../developer/database-change-procedure.md)와 #280의 승인·백업·forward-fix를 따릅니다. 점검기는 자동 재배포·DB rollback/DROP·파일 삭제를 하지 않습니다.

## 합성 알림 경로 검증과 보관

로컬 테스트는 루프백 health 503·timeout·잘못된 콘텐츠·redirect와 실패 종료·요약 파일 생성을 확인합니다. 이것만으로 실제 Actions 알림 경로를 검증했다고 부르지 않습니다. 실제 채널 검증은 병합 후 기본 브랜치에서 다음 수동 실행을 사용합니다.

```bash
gh workflow run production-smoke.yml --ref main -f fixture_alert=true
```

이 실행은 자체 루프백 health만 503으로 만들고 실제 점검 CLI를 실행합니다. job/run **failure**와 `SMOKE_FIXTURE_EXPECTED_FAILURE`, `environment=fixture`인 JSON·작업 요약이 기대 결과입니다. 운영 사이트·계정·DB에는 접속하지 않습니다. 실행 ID와 결과를 #333/PR 검증 기록에 남기며 개인 메일·Slack 전달을 검증했다고 주장하지 않습니다. 이후 `fixture_alert=false` 정상 수동 점검으로 실제 공개 응답도 확인합니다.

결과에는 SHA·환경·시각·고정 경로·상태 코드·고정 진단·소요 시간만 보관합니다. 응답 본문·예외 메시지·헤더·쿠키·개인정보·trace는 저장하지 않습니다. 원격 JSON 한 파일은 7일 후 만료하며 임시 fixture 서버는 실행 종료 시 정리합니다. 운영 장애 추세나 대응 지연을 반복 확인하면 그때 지속 모니터·온콜·추가 채널을 별도 검토합니다.
