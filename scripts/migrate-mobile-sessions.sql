-- #273 모바일 로그인 영속화. users 및 session_version 준비 후 별도 검토·승인한다.
-- 자체 트랜잭션이며 다른 적용기의 BEGIN 안에서 실행하지 않는다. 운영 자동 적용 아님.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('hra:mobile-sessions:v1',0));

-- 같은 DDL로 기대 테이블을 별도 schema에 만들고 기존 객체와 정확히 대조한다.
-- IF NOT EXISTS만으로 기존의 느슨한 CHECK/FK/index를 정상으로 인정하지 않는다.
CREATE SCHEMA hra_mobile273_expected;
DO $install$
DECLARE ddl text; destination text;
BEGIN
  ddl=$ddl$CREATE TABLE IF NOT EXISTS %s (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT mobile_sessions_pkey PRIMARY KEY,
    user_id uuid NOT NULL CONSTRAINT mobile_sessions_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
    access_hash text NOT NULL CONSTRAINT mobile_sessions_access_hash_unique UNIQUE,
    refresh_hash text NOT NULL CONSTRAINT mobile_sessions_refresh_hash_unique UNIQUE,
    prev_refresh_hash text,
    session_version integer NOT NULL,
    access_expires_at timestamptz NOT NULL,
    refresh_expires_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL,
    rotated_at timestamptz NOT NULL,
    last_used_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revoke_reason text,
    platform varchar(7),
    app_version varchar(64),
    device_name varchar(100),
    CONSTRAINT mobile_sessions_access_hash_check CHECK (access_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT mobile_sessions_refresh_hash_check CHECK (refresh_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT mobile_sessions_prev_refresh_hash_check CHECK (prev_refresh_hash IS NULL OR prev_refresh_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT mobile_sessions_version_check CHECK (session_version >= 0),
    CONSTRAINT mobile_sessions_platform_check CHECK (platform IS NULL OR platform IN ('ANDROID','IOS')),
    CONSTRAINT mobile_sessions_revocation_check CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL AND revoke_reason IN ('LOGOUT','LOGOUT_ALL','REUSE_DETECTED','ADMIN','EXPIRED_CLEANUP'))),
    CONSTRAINT mobile_sessions_time_order_check CHECK (created_at <= rotated_at AND rotated_at <= last_used_at AND rotated_at < access_expires_at AND access_expires_at <= refresh_expires_at AND refresh_expires_at <= absolute_expires_at AND (revoked_at IS NULL OR revoked_at >= created_at))
  )$ddl$;
  FOREACH destination IN ARRAY ARRAY['public.mobile_sessions','hra_mobile273_expected.expected'] LOOP
    EXECUTE format(ddl,destination);
  END LOOP;
END $install$;
CREATE INDEX IF NOT EXISTS mobile_sessions_active_user_idx ON public.mobile_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS mobile_sessions_user_idx ON public.mobile_sessions(user_id);
CREATE INDEX IF NOT EXISTS mobile_sessions_expiry_idx ON public.mobile_sessions(refresh_expires_at);
CREATE INDEX IF NOT EXISTS mobile_sessions_prev_refresh_idx ON public.mobile_sessions(prev_refresh_hash) WHERE prev_refresh_hash IS NOT NULL;
CREATE INDEX mobile_sessions_active_user_idx ON hra_mobile273_expected.expected(user_id) WHERE revoked_at IS NULL;
CREATE INDEX mobile_sessions_user_idx ON hra_mobile273_expected.expected(user_id);
CREATE INDEX mobile_sessions_expiry_idx ON hra_mobile273_expected.expected(refresh_expires_at);
CREATE INDEX mobile_sessions_prev_refresh_idx ON hra_mobile273_expected.expected(prev_refresh_hash) WHERE prev_refresh_hash IS NOT NULL;
DO $shape$
DECLARE actual jsonb; expected jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.mobile_sessions'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    INTO expected FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='hra_mobile273_expected.expected'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'mobile_session_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY conname)
    INTO actual FROM pg_constraint WHERE conrelid='public.mobile_sessions'::regclass AND contype<>'n';
  SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY conname)
    INTO expected FROM pg_constraint WHERE conrelid='hra_mobile273_expected.expected'::regclass AND contype<>'n';
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'mobile_session_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array((SELECT relname FROM pg_class WHERE oid=indexrelid),indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_expr(indpred,indrelid)) ORDER BY (SELECT relname FROM pg_class WHERE oid=indexrelid))
    INTO actual FROM pg_index WHERE indrelid='public.mobile_sessions'::regclass;
  SELECT jsonb_agg(jsonb_build_array((SELECT relname FROM pg_class WHERE oid=indexrelid),indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_expr(indpred,indrelid)) ORDER BY (SELECT relname FROM pg_class WHERE oid=indexrelid))
    INTO expected FROM pg_index WHERE indrelid='hra_mobile273_expected.expected'::regclass;
  IF actual IS DISTINCT FROM expected OR EXISTS (SELECT 1 FROM pg_class WHERE oid='public.mobile_sessions'::regclass AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity))
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.mobile_sessions'::regclass AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'mobile_session_migration_mismatch'; END IF;
END $shape$;

-- 가족 이력도 같은 설치 문장·기대 객체 대조 방식으로 검증한다.
DO $history_install$
DECLARE destination text;
BEGIN
  FOREACH destination IN ARRAY ARRAY['public.mobile_session_refresh_history','hra_mobile273_expected.history'] LOOP
    EXECUTE format($ddl$CREATE TABLE IF NOT EXISTS %s (
      refresh_hash text CONSTRAINT mobile_session_refresh_history_pkey PRIMARY KEY,
      session_id uuid NOT NULL CONSTRAINT mobile_session_refresh_history_session_id_mobile_sessions_id_fk REFERENCES public.mobile_sessions(id) ON DELETE CASCADE,
      consumed_at timestamptz NOT NULL,
      CONSTRAINT mobile_session_refresh_history_hash_check CHECK(refresh_hash ~ '^[0-9a-f]{64}$')
    )$ddl$,destination);
  END LOOP;
END $history_install$;
CREATE INDEX IF NOT EXISTS mobile_session_refresh_history_session_idx ON public.mobile_session_refresh_history(session_id);
CREATE INDEX mobile_session_refresh_history_session_idx ON hra_mobile273_expected.history(session_id);
DO $history_shape$
DECLARE actual jsonb; expected jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    INTO actual FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.mobile_session_refresh_history'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    INTO expected FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='hra_mobile273_expected.history'::regclass AND a.attnum>0 AND NOT a.attisdropped;
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'mobile_history_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY conname)
    INTO actual FROM pg_constraint WHERE conrelid='public.mobile_session_refresh_history'::regclass AND contype<>'n';
  SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid)) ORDER BY conname)
    INTO expected FROM pg_constraint WHERE conrelid='hra_mobile273_expected.history'::regclass AND contype<>'n';
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'mobile_history_migration_mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array((SELECT relname FROM pg_class WHERE oid=indexrelid),indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_expr(indpred,indrelid)) ORDER BY (SELECT relname FROM pg_class WHERE oid=indexrelid))
    INTO actual FROM pg_index WHERE indrelid='public.mobile_session_refresh_history'::regclass;
  SELECT jsonb_agg(jsonb_build_array((SELECT relname FROM pg_class WHERE oid=indexrelid),indisunique,indisprimary,indisvalid,indisready,indnatts,indnkeyatts,indkey::text,indclass::text,indcollation::text,indoption::text,pg_get_expr(indexprs,indrelid),pg_get_expr(indpred,indrelid)) ORDER BY (SELECT relname FROM pg_class WHERE oid=indexrelid))
    INTO expected FROM pg_index WHERE indrelid='hra_mobile273_expected.history'::regclass;
  IF actual IS DISTINCT FROM expected OR EXISTS (SELECT 1 FROM pg_class WHERE oid='public.mobile_session_refresh_history'::regclass AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity))
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.mobile_session_refresh_history'::regclass AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'mobile_history_migration_mismatch'; END IF;
END $history_shape$;
-- 소유자·ACL은 이 shape 검사 범위 밖이다. 적용자는 문서의 카탈로그 SQL로 PUBLIC 권한도 확인한다.
DROP SCHEMA hra_mobile273_expected CASCADE;

COMMENT ON TABLE public.mobile_sessions IS '모바일 로그인별 토큰 해시·만료·회수 상태. 원문 토큰 저장 금지';
COMMENT ON COLUMN public.mobile_sessions.id IS '로그인 단위 UUID';
COMMENT ON COLUMN public.mobile_sessions.user_id IS '로그인 계정. 계정 삭제 시 세션도 삭제';
COMMENT ON COLUMN public.mobile_sessions.access_hash IS '현재 접근 토큰의 소문자 SHA-256 hex';
COMMENT ON COLUMN public.mobile_sessions.refresh_hash IS '현재 갱신 토큰의 소문자 SHA-256 hex';
COMMENT ON COLUMN public.mobile_sessions.prev_refresh_hash IS '직전 갱신 토큰 해시. 재사용 탐지만 허용';
COMMENT ON COLUMN public.mobile_sessions.session_version IS '발급 당시 users.session_version. 불일치 시 즉시 무효';
COMMENT ON COLUMN public.mobile_sessions.access_expires_at IS '접근 토큰 만료 시각';
COMMENT ON COLUMN public.mobile_sessions.refresh_expires_at IS '슬라이딩 갱신 토큰 만료 시각';
COMMENT ON COLUMN public.mobile_sessions.absolute_expires_at IS '로그인부터 연장 불가능한 절대 만료 시각';
COMMENT ON COLUMN public.mobile_sessions.rotated_at IS '마지막 토큰 회전 시각. 최초 발급 시 생성 시각';
COMMENT ON COLUMN public.mobile_sessions.last_used_at IS '쓰기 빈도 제한을 적용한 마지막 접근 시각';
COMMENT ON COLUMN public.mobile_sessions.created_at IS '최초 로그인 시각';
COMMENT ON COLUMN public.mobile_sessions.revoked_at IS '세션 회수 시각';
COMMENT ON COLUMN public.mobile_sessions.revoke_reason IS '닫힌 집합의 회수 사유';
COMMENT ON COLUMN public.mobile_sessions.platform IS '선택적 모바일 플랫폼 ANDROID 또는 IOS';
COMMENT ON COLUMN public.mobile_sessions.app_version IS '선택적 앱 버전. 인증 판단에 사용하지 않음';
COMMENT ON COLUMN public.mobile_sessions.device_name IS '선택적 기기 이름. 신뢰된 기기 증명이 아님';
COMMENT ON TABLE public.mobile_session_refresh_history IS '소비한 갱신 토큰 가족 이력. 세션 삭제 시 함께 삭제';
COMMENT ON COLUMN public.mobile_session_refresh_history.refresh_hash IS '소비한 갱신 토큰의 소문자 SHA-256 hex. 원문 저장 금지';
COMMENT ON COLUMN public.mobile_session_refresh_history.session_id IS '원래 로그인 UUID. 세션 삭제 시 이력도 삭제';
COMMENT ON COLUMN public.mobile_session_refresh_history.consumed_at IS '행 잠금 획득 후 DB 시계로 정한 소비 시각';
COMMIT;
