-- 모바일 세션의 owned-local 신규 설치 후보. 테이블·제약·인덱스는 schema-export가 소유한다.
-- 원천: scripts/migrate-mobile-sessions.sql의 COMMENT 문장만 복제한 export 보완 후보다.
-- 자체 BEGIN/COMMIT·잠금·기대 schema 검사는 기존 DB용 원문에만 둔다.
-- 전체 bundle 승격·운영 적용 승인을 뜻하지 않으며 적용기가 파일 transaction을 소유한다.
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
