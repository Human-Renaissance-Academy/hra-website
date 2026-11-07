# Android·iOS 공용 디바이스 및 Push 알림 서비스

> 상태: **순수 NotificationService 계약·단위 테스트 구현** (#275). DB 테이블, API, OAuth/Bearer 인증 연결, 실제 FCM/APNs/Expo Push 공급자, 큐·스케줄러와 모바일 OS 알림 권한은 **아직 구현되지 않았습니다**. 이 문서가 앱에서 푸시를 실제 발송한다는 뜻은 아닙니다.

## 목표와 범위

앱은 하나의 React Native 코드베이스(#274)를 유지하고 Android·iOS를 같은 서버 정책으로 처리합니다. `fcm_token` 같은 Android 전용 사용자 컬럼을 추가하지 않습니다. 첫 업무 알림은 과제 공개와 마감 임박으로만 한정합니다. 알림 성공 여부는 **과제 공개·과제 제출 트랜잭션의 성공에 영향을 주면 안 됩니다**.

현재 구현 위치:

- `src/features/notifications/service.ts`: SDK/DB에 의존하지 않는 DeviceInstallation·NotificationEvent·NotificationProvider·NotificationDeliveryStore 계약, `dispatchNotification` 순수 오케스트레이션
- `tests/unit/notification-delivery.test.ts`: Android·iOS 동시 등록, 서로 다른 사용자 차단, 중복 입력/재실행, 만료·해제 토큰, 공급자 실패·영구 장애·재시도 제한, 저장소 장애·원문 누출 방지 검증

## 저장소 모델 — 설계안, 아직 migration 아님

```text
device_installations
  id UUID PRIMARY KEY
  user_id UUID NOT NULL REFERENCES users(id)
  platform ANDROID | IOS NOT NULL
  push_token_encrypted TEXT NOT NULL       -- 앱에서 받은 원문을 DB 평문 로그로 남기지 않음
  push_token_fingerprint BINARY/TEXT       -- 중복 기기 판단용 HMAC, 단순 해시보다 비밀 키 HMAC 권고
  app_version TEXT
  last_seen_at TIMESTAMPTZ NOT NULL
  revoked_at TIMESTAMPTZ NULL

notification_events
  id UUID PRIMARY KEY                     -- 업무 트랜잭션 commit과 함께 남기는 outbox
  user_id UUID NOT NULL
  kind ASSIGNMENT_PUBLISHED | ASSIGNMENT_DUE_SOON
  assignment_id UUID NOT NULL
  committed_at TIMESTAMPTZ NOT NULL

notification_deliveries
  event_id UUID NOT NULL
  installation_id UUID NOT NULL
  state CLAIMED | DEFERRED | SENT | TERMINAL
  attempt_count INTEGER NOT NULL
  lease_until TIMESTAMPTZ
  retry_at TIMESTAMPTZ
  PRIMARY KEY (event_id, installation_id)
```

개인정보·토큰 보존/파기 기간 및 백업 범위는 #142의 실제 운영 정책 결정 후 확정합니다. 기기별 토큰은 암호화와 암호키 회전·전송 제한을 검토해야 하며, 단순 SHA-256으로 토큰을 복원 불가능하다고 단정하지 않습니다. DB 미도입 상태라 이 필드 이름과 보존 정책도 최종이 아닙니다.

## 인가와 디바이스 등록

1. Web Auth.js 쿠키 또는 모바일 Bearer가 #273의 **현재 계정 행으로 검증된 Principal**로 변환된 뒤에만 기기를 등록합니다. 본문에서 임의 `userId`를 받지 않고 인증 주체 ID를 사용합니다.
2. Android·iOS 플랫폼과 Expo/FCM/APNs push token 형식을 서버에서 검증합니다. 필요하면 동일 사용자·동일 설치의 token rotation을 원자 업데이트하며 다른 사용자의 설치로 토큰을 옮기지 않습니다.
3. 로그아웃, refresh token revoke, 장기간 미사용, 공급자의 `invalid-token` 결과에 기기 해제를 연결합니다. 세션 무효화가 과거 수신된 OS 알림을 되돌리지는 못합니다.
4. 푸시 권한이 거부된 디바이스에도 과제 열람/제출은 계속 가능해야 하며, 앱 화면에 읽기 가능한 알림 대안은 후속 UX 결정입니다.

## 알림 전송과 장애 정책

- **원자성 분리:** 과제 공개/마감 처리 트랜잭션은 원장(outbox) 이벤트만 commit합니다. 비동기 전송 worker는 커밋된 이벤트만 읽습니다. 현재는 outbox/worker가 없으므로 실제 알림은 발생하지 않습니다.
- **원자 claim:** DB의 `(event_id, installation_id)` 고유 키와 lease 또는 동등한 DB 경쟁 제어로 각 worker의 중복 claim을 차단합니다. 메모리 mock 검증만으로 실 DB 원자성을 증명하지 못합니다.
- **Idempotency:** 서비스가 `eventId:installationId` UUID 기반 키를 공급자에 전달합니다. 공급자가 동일 키를 지원하지 않거나 전송 후 DB 성공 기록이 실패하면 **정확히 한 번 전달은 보장할 수 없습니다**. at-least-once 가능성과 사용자 중복 수신 위험을 인정하고 관측합니다.
- **재시도:** `transient-failure` 또는 예외 시 1회 후 60초, 2회 후 300초, 총 3회까지만 시도하고 terminal 처리합니다. 예약 시간 이전 재시도는 DB adapter 책임입니다. `invalid-token`은 기기를 revoke하고 terminal, `permanent-failure`은 즉시 terminal합니다.
- **안전성:** 공급자 원문 오류, 요청/응답, push token, 과제 본문, 사용자 이메일을 서버 일반 로그·메트릭·리포트에 포함하지 않습니다. 서비스 결과는 정수 집계만 돌려줍니다. 현재 서비스 자체는 로깅하지 않습니다.
- **보존:** 실패 이벤트의 재실행/보관 기간, 로그 접근자, 토큰 삭제 기준 및 배포 시 원격 전송 금지는 #142 정책을 따릅니다.

## 실제 구현 이전 필요 조건

1. #273 공용 Principal/모바일 세션 구현과 인증 검증(로그아웃/기기 해제 접근 차단)
2. #280 DB versioned migration과 운영 적용 이력·실제 PostgreSQL race/재시도 테스트. 표/인덱스/암호화 schema를 이 경로로만 설치
3. 설치 등록·회전·해제 HTTP API v1 + OpenAPI 정본(#272) 및 모바일 OS 권한/토큰 갱신 코드
4. 승인한 Expo/FCM/APNs 공급자 선택, 프로젝트/계정·환경 분리(#279) 및 실기기 검증(#274/#276/#283)
5. 과제 공개·마감 이벤트의 commit-after outbox, 재처리 worker, 비용·rate limit·불필요한 알림 방지 및 장애 추적
6. 개인정보/보존 정책(#142), 운영 알림 수신 허용 여부 및 배포 전 운영 승인

위 조건이 갖춰지기 전에는 `dispatchNotification`을 API에서 직접 호출하거나 실제 push provider를 실서비스에 연결하지 않습니다. 신규 queue·broker·마이크로서비스를 미리 도입하지 않습니다.
