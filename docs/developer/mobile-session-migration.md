# 모바일 세션·갱신 가족 이력 적용 검토 (#273)

## 범위와 적용 경계

`public.mobile_sessions`는 로그인 한 건당 접근·갱신 토큰의 SHA-256 해시와 만료·회수 상태를 저장한다. `public.mobile_session_refresh_history`는 성공적으로 소비한 모든 갱신 토큰 해시를 로그인에 연결한다. 원문은 발급/회전 성공 응답에만 전달하며 DB·로그·분석 도구에 저장하지 않는다. 기기 이름과 해시도 로그에 기록하지 않는다.

구조의 정본은 `src/lib/db/mobile-sessions.ts`와 `schema.ts`의 두 모델 재수출이다. 기존 DB 변경 후보는 **하나의** `scripts/migrate-mobile-sessions.sql`이다. 신규 설치는 47개 표의 schema-export 후보와 한국어 COMMENT 보완 `mobile-sessions.sql` 후보를 사용한다. 독립 reference는 원문 migration을 실행하고 후보 bundle은 export와 COMMENT를 실행하여 전체 prefix 카탈로그를 비교한다. 고정 digest 갱신은 적용 승인이나 과거 적용 이력이 아니다. 운영 manifest는 `unset`, `freshReady`와 `productionReady`는 `false`로 유지한다.

이 작업은 소유 일회성 로컬 PostgreSQL에서만 검증한다. 실제 DB에는 적용하지 않는다. 운영 적용은 Production migration gate인 [#280](https://github.com/Human-Renaissance-Academy/hra-website/issues/280)의 경계와 [DB 변경 절차](database-change-procedure.md)의 대상·소유권·백업·복구·승인 확인을 따른다. 앱 배포 과정에 SQL 실행을 끼우지 않는다.

## 검토·별도 적용

1. 대상 DB의 `public.users` 및 정수 NOT NULL `session_version`을 확인한다. 대상 표시·백업/복원 시험·승인·허용 잠금 시간을 별도로 검토한다. 적용 역할은 `public` 표 생성 권한 외에 **DB의 `CREATE` 권한**이 필요하다. 원문은 같은 transaction 안에서 임시 대조 schema `hra_mobile273_expected`를 만들고 끝에 삭제하므로, 이 권한이 없거나 같은 이름의 schema가 이미 있으면 아무것도 바꾸지 않고 실패한다.
2. 원문/inventory SHA와 Drizzle export를 대조한다. 세션 UUID PK, 현재 해시 UNIQUE, 이력 hash PK와 소문자 64자리 hex CHECK, 양쪽 CASCADE FK(Drizzle export와 같은 `mobile_sessions_user_id_users_id_fk`, `mobile_session_refresh_history_session_id_mobile_sessions_id_fk` 이름), 회수 사유 집합, 시간 순서와 인덱스를 확인한다. 이력 `session_id`에는 전체 인덱스가 필요하다.
3. 세션의 전체 `user_id` 인덱스는 회수된 세션까지 FK 삭제를 지원한다. 활성 사용자 부분 인덱스는 별도로 유지한다. 만료 인덱스는 `now()` 등 움직이는 predicate가 없는 전체 `refresh_expires_at` 인덱스다.
4. 원문은 자체 `BEGIN/COMMIT`, `lock_timeout=5s`, `statement_timeout=60s`, transaction advisory lock을 가진다. 외부 트랜잭션으로 감싸지 않는다. 실패하면 전체 변경이 롤백되며 원인을 확인한 뒤 재시도한다.
5. 기대 schema의 같은 DDL과 열·기본값·제약(이름 포함)·인덱스(이름 포함)·RLS·사용자 trigger를 대조한다. 이름만 PostgreSQL 기본값(`*_fkey`)인 기존 FK도 불일치로 거부한다. 느슨한 CHECK/FK/index나 동명 기존 객체를 자동 보정하지 않는다. **이 shape 검사는 표 소유자·ACL을 검증하지 않는다.** 재실행 성공도 운영 승인이나 적용 이력을 증명하지 않는다.
6. 아래 카탈로그·격리 회귀·독립 보안 검토를 완료한 뒤 승인된 운영 절차에서만 별도로 적용한다. 검증 증거에 실제 계정·원문 토큰·해시·기기 이름을 붙이지 않는다.

## 카탈로그 확인 (읽기 전용)

```sql
SELECT a.attrelid::regclass AS relation,a.attname,
       format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,
       pg_get_expr(d.adbin,d.adrelid) AS default_expression,
       col_description(a.attrelid,a.attnum) AS description
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass)
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attrelid,a.attnum;

SELECT conrelid::regclass,conname,contype,convalidated,condeferrable,
       confdeltype,pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass)
ORDER BY conrelid,conname;
-- user_id·session_id FK의 confdeltype=c, validated=true, deferred=false 확인.

SELECT indrelid::regclass,indexrelid::regclass,indisunique,indisprimary,
       indisvalid,indisready,pg_get_indexdef(indexrelid),pg_get_expr(indpred,indrelid)
FROM pg_index
WHERE indrelid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass);

SELECT oid::regclass,pg_get_userbyid(relowner) AS owner,
       relkind,relrowsecurity,relforcerowsecurity,obj_description(oid)
FROM pg_class
WHERE oid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass);
-- owner가 승인된 운영 소유자인지 별도 확인. shape 검사만으로는 보장하지 않음.

SELECT c.oid::regclass AS relation,a.privilege_type,a.is_grantable
FROM pg_class c,
LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
WHERE c.oid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass)
  AND a.grantee=0;
-- 0행이어야 PUBLIC 표 권한이 없음. 기본 ACL과 실제 앱 역할의 최소 권한도 별도 검토.

SELECT a.attrelid::regclass,a.attname,p.privilege_type
FROM pg_attribute a,LATERAL aclexplode(a.attacl) p
WHERE a.attrelid IN ('public.mobile_sessions'::regclass,'public.mobile_session_refresh_history'::regclass)
  AND a.attnum>0 AND NOT a.attisdropped AND p.grantee=0;
-- 열 단위 PUBLIC 권한도 0행인지 확인.
```

## 원자성·DB 시각 규칙

Neon HTTP는 대화형 transaction에 의존할 수 없으므로 회전은 한 SQL 문장이다. 각 해시 인덱스(현재/직전/이력 PK)로 로그인 ID를 찾고, **ID 조건**으로 `FOR UPDATE`를 획득한다. 잠금 대기 중 추가 회전으로 토큰이 직전 세대에서도 밀려나더라도 ID는 유지되므로 READ COMMITTED의 EvalPlanQual가 최신 로그인 행을 읽는다. 해시로만 잠금 조건을 제한하거나 별도 선조회·갱신을 하지 않는다.

회전은 세션 `FOR UPDATE` 다음 그 행에 의존하는 `account AS MATERIALIZED`에서 계정 `FOR SHARE`를 획득한다. 일반 MVCC 조인은 대기 전 계정 튜플을 볼 수 있지만 `FOR SHARE`는 EvalPlanQual로 최신 커밋 버전을 재확인하고 동시 역할·버전 변경자를 대기시킨다. 계정 삭제는 사용자→세션 CASCADE 순서이므로 세션→사용자 회전과 드물게 deadlock이 가능하다. PostgreSQL이 한쪽 문장 전체를 중단하며 저장소 오류 503으로 닫는다. 부분 토큰 교체·부분 이력 기록은 남지 않는다.

두 잠금에 의존하는 `MATERIALIZED clock` CTE에서 `COALESCE(test_now,clock_timestamp())`를 한 번 평가한다. 만료·유예·회전 및 새 접근/갱신 만료는 모두 **두 잠금 획득 후의 동일한 DB 시각**을 사용한다. `now()`/`statement_timestamp()`나 앱 서버 `Date`는 판단에 쓰지 않는다. 발급도 계정 잠금 후 DB 시각을 사용한다. 접근 인증은 핫패스의 쓰기 증폭을 줄이기 위해 비잠금 문장 스냅샷으로 판정한다. 분당 접근 기록 후보만 `FOR UPDATE SKIP LOCKED`로 잡아 회전 중인 행은 기다리지 않고 기록을 생략한다. 따라서 문장 시작 뒤 커밋된 회수는 다음 인증/인가 체크포인트에서 반영된다.

공개 서비스의 선택 `now`/내부 `testNow`는 격리 테스트 전용 주입점이다. 운영 호출자는 전달하지 않는다. 정리는 `purgeExpiredSessions(undefined, limit)`로 호출한다. 접근 기록의 실제 쓰기는 60초 간격이며 부하를 측정한다. DB 자체 시계 역행은 별도 운영 감시 대상이다.

`validateMobileSession({ sessionId, expectedVersion })`는 인가 호출마다 잠금 없이 재조회한다. 회수 없음, 갱신·절대 수명(DB 시계), 세션/계정 양쪽 버전 일치를 요구하며 현재 역할을 반환한다. 최초 인증된 요청이 15분 경계를 지나도 마무리할 수 있도록 접근 만료는 재검사하지 않는다. Blob 검증 후 제출 최종화 직전에도 이 체크포인트가 다시 실행되며 결과를 캐시하지 않는다.

## 갱신 가족 재사용 판정과 한계

접근 15분, 갱신 30일 슬라이딩, 최초 로그인부터 절대 90일, 직전 세대 유예 10초다. 새 접근·갱신 만료는 절대 만료로 제한한다. 잠금 후 다음 순서로 판정한다.

| 조건 | 결과·변경 |
| --- | --- |
| 세션을 찾지 못함 | `INVALID` |
| 이미 회수됨 | `REVOKED` |
| 갱신 또는 절대 만료 정각 이후 | `EXPIRED` |
| 사용자 버전 불일치 | `VERSION_MISMATCH` |
| 현재 refresh hash | `ROTATED`: 새 해시·만료로 교체하고 소비 hash를 같은 SQL 이력에 삽입 |
| 현재 refresh hash이며 `mayRotate=false` | `THROTTLED`: 행·이력 변경 없이 HTTP 429 |
| 직전 hash이고 DB 시각 ≤ rotated_at + 10초 | `WITHIN_LEEWAY`: 401, 회수·행 변경 없음 |
| 그 외 식별된 소비 hash | `REUSE_DETECTED`: 로그인 전체 회수 |

따라서 R0→R1→R2 후 R0는 최신 회전 유예 중에도 즉시 재사용이다. 이력은 로그인 가족이 사라질 때까지 유지하며 크기에 비례하는 배열 검색 대신 unique PK 조회를 사용한다. 활성 가족의 이력을 먼저 삭제하면 오래된 탈취 토큰 탐지가 사라지므로 개별 조기 정리하지 않는다.

세션 예산 소진은 발급만 제한한다. `rotateRefreshToken(raw, testNow?, { mayRotate? })`의 기본값은 true다. false여도 REUSE_DETECTED·WITHIN_LEEWAY·REVOKED·EXPIRED·VERSION_MISMATCH 판정을 그대로 수행하므로 제한된 가족의 탈취 토큰도 회수할 수 있다. 조회 전 IP 제한은 기존처럼 즉시 429다.

승자 한 요청에만 새 원문을 전달한다. **갱신 성공 응답 유실 시 원문 복원이 불가능해 재로그인이 필요하다.** 유예는 새 토큰 재전달이 아니다. 앱은 단일 refresh 실행과 로컬 세대 번호로 오래된 실패가 새 자격을 지우지 않게 하고, 모호한 네트워크 실패 후 이전 refresh를 자동 재시도하거나 쓰기 요청을 자동 재생하지 않는다. 토큰 탈취가 항상 탐지되는 것은 아니며 정당한 보유자가 소비 토큰을 다시 제시해야 탐지가 일어난다. 접근 토큰 자체는 만료·회수까지 사용될 수 있다. TLS·SecureStore·요청 제한은 별도 HTTP/앱 경계에서 유지한다.

## 비밀번호·역할·버전 정책

역할은 매 인증마다 현재 `users`에서 읽지만, 실제 그룹 변경 저장소(`src/features/users/admin/repository.ts:72-76`)는 역할 또는 기수가 달라지면 같은 UPDATE에서 `session_version + 1`을 수행한다. Web-style 버전 비교와 모바일 접근/갱신이 함께 무효화된다. 계정 삭제는 세션과 이력을 CASCADE 삭제한다. 전체 모바일 로그아웃은 계정 버전을 바꾸지 않아 Web 로그인은 유지한다.

**모든 비밀번호 변경·초기화는 `password_hash`와 `session_version = session_version + 1`을 같은 SQL 문장에서 변경해야 한다.** 해시만 바꾸면 기존 Web/mobile 자격은 계속 유효하다. 통합 정책 시험은 이 한계를 명시적으로 재현하고 원자 버전 증가가 차단함을 확인한다. `scripts/seed-admin.mjs`의 기존 관리자 안내도 이 정책을 명시한다. OAuth 연결 규칙은 바꾸지 않는다.

## 정리 주기·보존·복구

권장 정리는 **매시간** 실행하고 한 요청당 최대 1,000세션(상황에 맞춘 작은 배치)을 삭제한다. 실제 cron 등록·운영 승인·실행 여부는 별도 확인한다. 미처리 잔량과 실행 지연을 감시하고 필요하면 제한된 횟수로 추가 배치를 수행한다. `SKIP LOCKED`로 회전 중인 행을 기다리지 않는다. 갱신/절대 만료 또는 회수 시각에 도달한 로그인은 다음 정리에서 삭제 가능하며 별도 감사 보존기간은 추가하지 않는다. 활동 세션은 최대 절대 90일이며 소비 이력은 해당 세션과 함께 cascade 삭제한다. 백업의 별도 보존·파기 정책도 운영자가 확인한다.

앱만 롤백할 때는 표를 두고 모바일 진입점을 비활성화한다. 이력이 있는 상태에서 이전의 직전 세대 전용 구현으로 돌아가면 가족 탐지 보장이 약해지므로 모바일 기능을 닫고 호환성을 먼저 검토한다. 자동 down SQL은 제공하지 않는다. 표 삭제는 모든 모바일 로그인을 잃으므로 승인된 백업·삭제·복구 계획 없이 DROP하지 않는다. 원문 토큰은 복원할 수 없으며 해시 백업만으로 자격을 재발급하지 않는다.

## 격리 검증

```sh
HRA_TEST_PG_BIN=/usr/lib/postgresql/14/bin node --test tests/integration/mobile-session-persistence.test.mjs tests/integration/db-fresh-reference.test.mjs tests/integration/db-fresh-bundle.test.mjs
npx vitest run tests/unit/mobile-session-tokens.test.ts
node scripts/check-db-source-inventory.mjs
node scripts/check-db-installation-contract.mjs
node scripts/check-db-migration-manifest.mjs
node --test scripts/tests/db-*.test.mjs
```

회귀는 기존 사례를 유지하며 12개 독립 연결 경합 5회(각 한 승자·소비 hash 한 행), 가족 탈취, 유예 경계, `pg_blocking_pids()`로 확인한 실제 잠금 대기와 만료·유예 횡단, DB 기본 시계와 절대 만료 제한, 그룹/비밀번호 버전 정책, 사용자 삭제/정리 이력 cascade, 이력 CHECK/FK/FK 이름/index drift 거부, migration 결과와 Drizzle export 번들의 제약·인덱스 이름·정의 일치를 확인한다. raw reference는 원문을, 후보는 별도 고정 bytes를 실행하며 COMMENT·catalog도 비교한다. 로컬 PostgreSQL 시험은 실제 hosted Neon의 전송 장애·pooling·운영 대상 권한 검증을 대신하지 않는다.
