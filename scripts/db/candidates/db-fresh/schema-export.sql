-- 신규 owned-local DB 설치 검증 전용 Drizzle export 후보입니다. 운영 이력이나 적용 승인을 나타내지 않습니다.
-- 원본: src/lib/db/schema.ts (SHA256 db0cf6ce1111455a2726b25aa23b1f349d271e665b9be6d68f84ded0beb65eb5), drizzle-kit 0.31.10 exportQaSchemaSql().
-- 원본 생성 SQL SHA256: e6da7f90332505af92a6656ea624c0ad14f6695d0b8ec190e0f784b364d04b84.
-- 수동 검토한 차이: 비한정 CREATE TABLE 대상 47개에만 "public".을 명시했습니다.
-- enum/컬럼/제약/FK/index/기본값과 ALTER·INDEX 문장은 원본 바이트 그대로입니다.
-- 모바일 세션·가족 이력 추가를 독립 reference와 후보 bundle에서 대조합니다.
CREATE TYPE "public"."application_question_type" AS ENUM('SHORT_ANSWER', 'LONG_ANSWER', 'MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN');
CREATE TYPE "public"."application_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');
CREATE TYPE "public"."enrollment_status" AS ENUM('ENROLLED');
CREATE TYPE "public"."faculty_category" AS ENUM('CLASSICS', 'BUSINESS', 'LECTURE');
CREATE TYPE "public"."notice_status" AS ENUM('DRAFT', 'PUBLISHED');
CREATE TYPE "public"."recruitment_status" AS ENUM('UPCOMING', 'OPEN', 'CLOSED');
CREATE TYPE "public"."report_template_category" AS ENUM('template', 'guide');
CREATE TYPE "public"."schedule_event_type" AS ENUM('CLASS', 'EVENT');
CREATE TYPE "public"."session_category" AS ENUM('CLASSICS', 'ENGLISH', 'SPEECH', 'SPECIAL_LECTURE', 'CASE_STUDY');
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'FACULTY', 'MEMBER', 'PENDING');
CREATE TYPE "public"."assignment_status" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED');
CREATE TYPE "public"."assignment_upload_state" AS ENUM('INTENDED', 'VERIFIED', 'CONSUMED', 'EXPIRED');
CREATE TABLE "public"."academic_assignment_events" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"assignment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_status" text,
	"next_status" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"payload_digest" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_assignment_events_action_check" CHECK ("academic_assignment_events"."action" IN ('CREATE','UPDATE_DRAFT','PUBLISH','CLOSE')),
	CONSTRAINT "academic_assignment_events_previous_status_check" CHECK ("academic_assignment_events"."previous_status" IS NULL OR "academic_assignment_events"."previous_status" IN ('DRAFT','PUBLISHED','CLOSED')),
	CONSTRAINT "academic_assignment_events_next_status_check" CHECK ("academic_assignment_events"."next_status" IN ('DRAFT','PUBLISHED','CLOSED')),
	CONSTRAINT "academic_assignment_events_payload_digest_check" CHECK ("academic_assignment_events"."payload_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public"."academic_enrollment_link_batches" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"approval_reference_id" uuid NOT NULL,
	"verification_method" text NOT NULL,
	"plan" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"linked_count" integer NOT NULL,
	"enrolled_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_enrollment_link_batches_verification_method_check" CHECK ("academic_enrollment_link_batches"."verification_method" IN ('IN_PERSON', 'VERIFIED_CONTACT')),
	CONSTRAINT "academic_enrollment_link_batches_linked_count_check" CHECK ("academic_enrollment_link_batches"."linked_count" >= 0),
	CONSTRAINT "academic_enrollment_link_batches_enrolled_count_check" CHECK ("academic_enrollment_link_batches"."enrolled_count" >= 0)
);

CREATE TABLE "public"."academic_roster_registrations" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"verification_method" text NOT NULL,
	"evidence_reference" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_roster_registrations_enrollment_id_unique" UNIQUE("enrollment_id"),
	CONSTRAINT "academic_roster_registrations_verification_method_check" CHECK ("academic_roster_registrations"."verification_method" IN ('IN_PERSON', 'VERIFIED_CONTACT')),
	CONSTRAINT "academic_roster_registrations_request_fingerprint_check" CHECK ("academic_roster_registrations"."request_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public"."academic_students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"display_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "academic_students_display_name_not_blank" CHECK (length(btrim("academic_students"."display_name")) > 0)
);

CREATE TABLE "public"."academic_submission_file_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"access_scope" text NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "academic_submission_file_reads_scope_check" CHECK ("academic_submission_file_reads"."access_scope" IN ('OWNER', 'MANAGEMENT'))
);

CREATE TABLE "public"."academic_upload_authorizations" (
	"intent_id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"expected_size" integer NOT NULL,
	"received_at" timestamp with time zone,
	"verified_etag" varchar(255),
	"retired_at" timestamp with time zone,
	"cleanup_claimed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "academic_upload_authorizations_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "academic_upload_authorizations_size_check" CHECK ("academic_upload_authorizations"."expected_size" BETWEEN 1 AND 52428800),
	CONSTRAINT "academic_upload_authorizations_name_check" CHECK (length(btrim("academic_upload_authorizations"."original_name"))>0 AND "academic_upload_authorizations"."original_name" !~ '[/\\[:cntrl:]]' AND lower("academic_upload_authorizations"."original_name") LIKE '%.pdf')
);

CREATE TABLE "public"."alumni_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"title" varchar(100),
	"quote" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."alumni_story_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumni_story_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."application_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" text NOT NULL
);

CREATE TABLE "public"."application_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"cohort_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"questions_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."application_question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"value" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "public"."application_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "application_question_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "public"."application_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"applicant_name" varchar(100) NOT NULL,
	"applicant_email" varchar(255) NOT NULL,
	"applicant_phone" varchar(20),
	"status" "application_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_submissions_form_applicant_unique" UNIQUE("form_id","applicant_email")
);

CREATE TABLE "public"."application_submissions_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" varchar(45),
	"email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."class_log_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_log_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."class_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"content" text NOT NULL,
	"class_date" timestamp NOT NULL,
	"cohort_id" uuid,
	"author_id" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."class_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"file_url" text NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"week_number" integer,
	"lecture_title" varchar(200),
	"audience" varchar(20) DEFAULT 'STUDENT' NOT NULL,
	"uploaded_by_id" uuid,
	"order" integer DEFAULT 0 NOT NULL,
	"class_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."cohort_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'ENROLLED' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohort_enrollments_student_cohort_unique" UNIQUE("student_id","cohort_id"),
	CONSTRAINT "cohort_enrollments_ended_at_order" CHECK ("cohort_enrollments"."ended_at" IS NULL OR "cohort_enrollments"."ended_at" >= "cohort_enrollments"."enrolled_at")
);

CREATE TABLE "public"."cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"recruitment_status" "recruitment_status" DEFAULT 'UPCOMING' NOT NULL,
	"recruitment_start_date" timestamp,
	"recruitment_end_date" timestamp,
	"google_form_url" text,
	"google_sheet_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."faculty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "faculty_category" NOT NULL,
	"current_position" text,
	"former_position" text,
	"image_url" text,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."faq_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_name" varchar(50) NOT NULL,
	"contact_name" varchar(100) NOT NULL,
	"contact_phone" varchar(20) NOT NULL,
	"contact_role" varchar(100) DEFAULT '모집위원장' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."faq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."galleries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text,
	"cover_image_url" text,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."gallery_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gallery_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."guidebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"file_url" text NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"applicant_name" varchar(100) NOT NULL,
	"applicant_email" varchar(255) NOT NULL,
	"applicant_phone" varchar(20),
	"university" varchar(100),
	"major" varchar(100),
	"motivation" text NOT NULL,
	"additional_info" text,
	"status" "application_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" varchar(45),
	"email" varchar(255),
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean NOT NULL
);

CREATE TABLE "public"."markdown_image_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "markdown_image_assets_url_unique" UNIQUE("url")
);

CREATE TABLE "public"."mobile_session_refresh_history" (
	"refresh_hash" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"consumed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mobile_session_refresh_history_hash_check" CHECK ("mobile_session_refresh_history"."refresh_hash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public"."mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"access_hash" text NOT NULL,
	"refresh_hash" text NOT NULL,
	"prev_refresh_hash" text,
	"session_version" integer NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"platform" varchar(7),
	"app_version" varchar(64),
	"device_name" varchar(100),
	CONSTRAINT "mobile_sessions_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "mobile_sessions_refresh_hash_unique" UNIQUE("refresh_hash"),
	CONSTRAINT "mobile_sessions_access_hash_check" CHECK ("mobile_sessions"."access_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mobile_sessions_refresh_hash_check" CHECK ("mobile_sessions"."refresh_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mobile_sessions_prev_refresh_hash_check" CHECK ("mobile_sessions"."prev_refresh_hash" IS NULL OR "mobile_sessions"."prev_refresh_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mobile_sessions_version_check" CHECK ("mobile_sessions"."session_version" >= 0),
	CONSTRAINT "mobile_sessions_platform_check" CHECK ("mobile_sessions"."platform" IS NULL OR "mobile_sessions"."platform" IN ('ANDROID','IOS')),
	CONSTRAINT "mobile_sessions_revocation_check" CHECK (("mobile_sessions"."revoked_at" IS NULL AND "mobile_sessions"."revoke_reason" IS NULL) OR ("mobile_sessions"."revoked_at" IS NOT NULL AND "mobile_sessions"."revoke_reason" IS NOT NULL AND "mobile_sessions"."revoke_reason" IN ('LOGOUT','LOGOUT_ALL','REUSE_DETECTED','ADMIN','EXPIRED_CLEANUP'))),
	CONSTRAINT "mobile_sessions_time_order_check" CHECK ("mobile_sessions"."created_at" <= "mobile_sessions"."rotated_at" AND "mobile_sessions"."rotated_at" <= "mobile_sessions"."last_used_at" AND "mobile_sessions"."rotated_at" < "mobile_sessions"."access_expires_at" AND "mobile_sessions"."access_expires_at" <= "mobile_sessions"."refresh_expires_at" AND "mobile_sessions"."refresh_expires_at" <= "mobile_sessions"."absolute_expires_at" AND ("mobile_sessions"."revoked_at" IS NULL OR "mobile_sessions"."revoked_at" >= "mobile_sessions"."created_at"))
);

CREATE TABLE "public"."notice_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"url" text NOT NULL,
	"file_name" varchar(500) NOT NULL,
	"file_size" integer,
	"file_type" varchar(100),
	"is_image" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"content" text NOT NULL,
	"status" "notice_status" DEFAULT 'DRAFT' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author_id" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."press_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"source" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"published_at" timestamp NOT NULL,
	"description" text,
	"image_url" text,
	"order" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."rate_limit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"scope" varchar(32) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_id" uuid
);

CREATE TABLE "public"."recruitment_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" integer DEFAULT 1 NOT NULL,
	"active_cohort_id" uuid,
	"recruitment_status" "recruitment_status" DEFAULT 'UPCOMING',
	"google_form_url" text,
	"recruitment_start_date" timestamp,
	"poster_image_url" text,
	"deadline_date" timestamp,
	"next_recruitment_year" integer,
	"next_recruitment_month" integer,
	"qualification_text" text,
	"details_markdown" text,
	"poster_layout" text DEFAULT 'right',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recruitment_settings_singleton_key_unique" UNIQUE("singleton_key"),
	CONSTRAINT "recruitment_settings_singleton_key_check" CHECK ("recruitment_settings"."singleton_key" = 1)
);

CREATE TABLE "public"."report_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(300) NOT NULL,
	"category" "report_template_category" NOT NULL,
	"report_category" varchar(50),
	"description" text,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"body" text NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "report_templates_slug_unique" UNIQUE("slug")
);

CREATE TABLE "public"."schedule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_date" timestamp NOT NULL,
	"end_time" varchar(5),
	"event_type" "schedule_event_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"cohort_id" uuid,
	"week_number" integer,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."schedule_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_event_id" uuid NOT NULL,
	"category" "session_category" NOT NULL,
	"faculty_id" uuid,
	"content" text,
	"report_category" varchar(50),
	"sub_title" text,
	"sub_description" text,
	"order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "public"."upload_rate_limit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" varchar(45),
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'PENDING' NOT NULL,
	"cohort_id" uuid,
	"image" text,
	"oauth_provider" text,
	"oauth_provider_account_id" text,
	"session_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_oauth_binding_unique" UNIQUE("oauth_provider","oauth_provider_account_id"),
	CONSTRAINT "users_oauth_binding_both_or_neither" CHECK (("users"."oauth_provider" IS NULL AND "users"."oauth_provider_account_id" IS NULL) OR ("users"."oauth_provider" IS NOT NULL AND "users"."oauth_provider_account_id" IS NOT NULL))
);

CREATE TABLE "public"."weekly_text_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"weekly_text_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."weekly_texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"file_url" text DEFAULT '' NOT NULL,
	"file_name" varchar(500),
	"body" text,
	"cohort_id" uuid,
	"text_type" varchar(20),
	"class_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "public"."assignment_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	CONSTRAINT "assignment_targets_assignment_enrollment_unique" UNIQUE("assignment_id","enrollment_id")
);

CREATE TABLE "public"."assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"schedule_event_id" uuid,
	"schedule_session_id" uuid,
	"title" varchar(200) NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone,
	"status" "assignment_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"published_by_user_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_title_not_blank" CHECK (length(btrim("assignments"."title")) > 0),
	CONSTRAINT "assignments_instructions_length" CHECK (length("assignments"."instructions") <= 50000),
	CONSTRAINT "assignments_session_requires_event" CHECK ("assignments"."schedule_session_id" IS NULL OR "assignments"."schedule_event_id" IS NOT NULL),
	CONSTRAINT "assignments_publication_shape" CHECK (("assignments"."status" = 'DRAFT' AND "assignments"."published_at" IS NULL AND "assignments"."published_by_user_id" IS NULL) OR ("assignments"."status" <> 'DRAFT' AND "assignments"."published_at" IS NOT NULL AND "assignments"."published_by_user_id" IS NOT NULL AND "assignments"."due_at" IS NOT NULL AND "assignments"."due_at" > "assignments"."published_at"))
);

CREATE TABLE "public"."assignment_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"storage_key" varchar(1024) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" varchar(64) NOT NULL,
	CONSTRAINT "assignment_submission_files_submission_unique" UNIQUE("submission_id"),
	CONSTRAINT "assignment_submission_files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "assignment_submission_files_metadata_shape" CHECK (length(btrim("assignment_submission_files"."storage_key")) > 0 AND "assignment_submission_files"."storage_key" !~ '(^/|://|(^|/)\.\.(/|$)|[[:cntrl:]])' AND length(btrim("assignment_submission_files"."original_name")) > 0 AND "assignment_submission_files"."original_name" !~ '[/\\[:cntrl:]]' AND "assignment_submission_files"."mime_type" = 'application/pdf' AND "assignment_submission_files"."size_bytes" BETWEEN 1 AND 52428800 AND "assignment_submission_files"."checksum" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public"."assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_target_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"upload_intent_id" uuid NOT NULL,
	"submission_key" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_submissions_target_unique" UNIQUE("assignment_target_id"),
	CONSTRAINT "assignment_submissions_key_unique" UNIQUE("submission_key"),
	CONSTRAINT "assignment_submissions_intent_unique" UNIQUE("upload_intent_id"),
	CONSTRAINT "assignment_submissions_time_finite" CHECK (isfinite("assignment_submissions"."submitted_at"))
);

CREATE TABLE "public"."assignment_upload_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" varchar(1024) NOT NULL,
	"state" "assignment_upload_state" DEFAULT 'INTENDED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"original_name" varchar(255),
	"mime_type" varchar(100),
	"size_bytes" integer,
	"checksum" varchar(64),
	CONSTRAINT "assignment_upload_intents_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "assignment_upload_intents_identity_unique" UNIQUE("id","assignment_target_id","user_id"),
	CONSTRAINT "assignment_upload_intents_key_shape" CHECK (length(btrim("assignment_upload_intents"."storage_key")) > 0 AND "assignment_upload_intents"."storage_key" !~ '(^/|://|(^|/)\.\.(/|$)|[[:cntrl:]])'),
	CONSTRAINT "assignment_upload_intents_expiry_shape" CHECK (isfinite("assignment_upload_intents"."created_at") AND isfinite("assignment_upload_intents"."expires_at") AND "assignment_upload_intents"."expires_at" > "assignment_upload_intents"."created_at"),
	CONSTRAINT "assignment_upload_intents_verification_shape" CHECK (("assignment_upload_intents"."state" IN ('INTENDED', 'EXPIRED') AND "assignment_upload_intents"."verified_at" IS NULL AND "assignment_upload_intents"."original_name" IS NULL AND "assignment_upload_intents"."mime_type" IS NULL AND "assignment_upload_intents"."size_bytes" IS NULL AND "assignment_upload_intents"."checksum" IS NULL) OR ("assignment_upload_intents"."state" IN ('VERIFIED', 'CONSUMED') AND "assignment_upload_intents"."verified_at" IS NOT NULL AND isfinite("assignment_upload_intents"."verified_at") AND "assignment_upload_intents"."verified_at" >= "assignment_upload_intents"."created_at" AND "assignment_upload_intents"."verified_at" < "assignment_upload_intents"."expires_at" AND "assignment_upload_intents"."original_name" IS NOT NULL AND length(btrim("assignment_upload_intents"."original_name")) > 0 AND "assignment_upload_intents"."original_name" !~ '[/\\[:cntrl:]]' AND "assignment_upload_intents"."mime_type" IS NOT NULL AND "assignment_upload_intents"."mime_type" = 'application/pdf' AND "assignment_upload_intents"."size_bytes" IS NOT NULL AND "assignment_upload_intents"."size_bytes" BETWEEN 1 AND 52428800 AND "assignment_upload_intents"."checksum" IS NOT NULL AND "assignment_upload_intents"."checksum" ~ '^[0-9a-f]{64}$'))
);

ALTER TABLE "academic_assignment_events" ADD CONSTRAINT "academic_assignment_events_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_assignment_events" ADD CONSTRAINT "academic_assignment_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_enrollment_link_batches" ADD CONSTRAINT "academic_enrollment_link_batches_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_roster_registrations" ADD CONSTRAINT "academic_roster_registrations_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_roster_registrations" ADD CONSTRAINT "academic_roster_registrations_student_fk" FOREIGN KEY ("student_id") REFERENCES "public"."academic_students"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_roster_registrations" ADD CONSTRAINT "academic_roster_registrations_cohort_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_roster_registrations" ADD CONSTRAINT "academic_roster_registrations_enrollment_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."cohort_enrollments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_students" ADD CONSTRAINT "academic_students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_submission_file_reads" ADD CONSTRAINT "academic_submission_file_reads_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_submission_file_reads" ADD CONSTRAINT "academic_submission_file_reads_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_submission_file_reads" ADD CONSTRAINT "academic_submission_file_reads_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."assignment_submission_files"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_upload_authorizations" ADD CONSTRAINT "academic_upload_authorizations_intent_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."assignment_upload_intents"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_upload_authorizations" ADD CONSTRAINT "academic_upload_authorizations_target_fk" FOREIGN KEY ("target_id") REFERENCES "public"."assignment_targets"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "academic_upload_authorizations" ADD CONSTRAINT "academic_upload_authorizations_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "alumni_story_images" ADD CONSTRAINT "alumni_story_images_alumni_story_id_alumni_stories_id_fk" FOREIGN KEY ("alumni_story_id") REFERENCES "public"."alumni_stories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_submission_id_application_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."application_submissions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_question_id_application_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."application_questions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "application_forms" ADD CONSTRAINT "application_forms_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_question_options" ADD CONSTRAINT "application_question_options_question_id_application_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."application_questions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_form_id_application_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."application_forms"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "class_log_images" ADD CONSTRAINT "class_log_images_class_log_id_class_logs_id_fk" FOREIGN KEY ("class_log_id") REFERENCES "public"."class_logs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "class_logs" ADD CONSTRAINT "class_logs_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "class_logs" ADD CONSTRAINT "class_logs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "class_materials" ADD CONSTRAINT "class_materials_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cohort_enrollments" ADD CONSTRAINT "cohort_enrollments_student_id_academic_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."academic_students"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "cohort_enrollments" ADD CONSTRAINT "cohort_enrollments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "cohort_enrollments" ADD CONSTRAINT "cohort_enrollments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "gallery_images" ADD CONSTRAINT "gallery_images_gallery_id_galleries_id_fk" FOREIGN KEY ("gallery_id") REFERENCES "public"."galleries"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "applications" ADD CONSTRAINT "applications_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "markdown_image_assets" ADD CONSTRAINT "markdown_image_assets_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "mobile_session_refresh_history" ADD CONSTRAINT "mobile_session_refresh_history_session_id_mobile_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."mobile_sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notice_attachments" ADD CONSTRAINT "notice_attachments_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "rate_limit_events" ADD CONSTRAINT "rate_limit_events_submission_id_application_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."application_submissions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "recruitment_settings" ADD CONSTRAINT "recruitment_settings_active_cohort_id_cohorts_id_fk" FOREIGN KEY ("active_cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_schedule_event_id_schedule_events_id_fk" FOREIGN KEY ("schedule_event_id") REFERENCES "public"."schedule_events"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "schedule_sessions" ADD CONSTRAINT "schedule_sessions_faculty_id_faculty_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."faculty"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "weekly_text_images" ADD CONSTRAINT "weekly_text_images_weekly_text_id_weekly_texts_id_fk" FOREIGN KEY ("weekly_text_id") REFERENCES "public"."weekly_texts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "weekly_texts" ADD CONSTRAINT "weekly_texts_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_enrollment_id_cohort_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."cohort_enrollments"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_targets" ADD CONSTRAINT "assignment_targets_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_schedule_event_id_schedule_events_id_fk" FOREIGN KEY ("schedule_event_id") REFERENCES "public"."schedule_events"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_schedule_session_id_schedule_sessions_id_fk" FOREIGN KEY ("schedule_session_id") REFERENCES "public"."schedule_sessions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_submission_files" ADD CONSTRAINT "assignment_submission_files_submission_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."assignment_submissions"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_target_fk" FOREIGN KEY ("assignment_target_id") REFERENCES "public"."assignment_targets"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_intent_identity_fk" FOREIGN KEY ("upload_intent_id","assignment_target_id","submitted_by_user_id") REFERENCES "public"."assignment_upload_intents"("id","assignment_target_id","user_id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_upload_intents" ADD CONSTRAINT "assignment_upload_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "assignment_upload_intents" ADD CONSTRAINT "assignment_upload_intents_target_fk" FOREIGN KEY ("assignment_target_id") REFERENCES "public"."assignment_targets"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "academic_submission_file_reads_actor_time_idx" ON "academic_submission_file_reads" USING btree ("actor_user_id","authorized_at");
CREATE INDEX "academic_submission_file_reads_file_time_idx" ON "academic_submission_file_reads" USING btree ("file_id","authorized_at");
CREATE UNIQUE INDEX "academic_upload_authorizations_active_target_idx" ON "academic_upload_authorizations" USING btree ("target_id") WHERE "academic_upload_authorizations"."retired_at" IS NULL;
CREATE INDEX "academic_upload_authorizations_cleanup_idx" ON "academic_upload_authorizations" USING btree ("cleanup_claimed_at");
CREATE INDEX "idx_application_submissions_form_submitted_at" ON "application_submissions" USING btree ("form_id","submitted_at" DESC NULLS LAST);
CREATE INDEX "idx_submissions_ip_created" ON "application_submissions_log" USING btree ("ip","created_at");
CREATE INDEX "idx_submissions_email_created" ON "application_submissions_log" USING btree ("email","created_at");
CREATE INDEX "cohort_enrollments_cohort_status_idx" ON "cohort_enrollments" USING btree ("cohort_id","status");
CREATE INDEX "idx_login_attempts_ip_attempted" ON "login_attempts" USING btree ("ip","attempted_at");
CREATE INDEX "idx_login_attempts_email_attempted" ON "login_attempts" USING btree ("email","attempted_at");
CREATE INDEX "idx_markdown_image_assets_created_at" ON "markdown_image_assets" USING btree ("created_at");
CREATE INDEX "mobile_session_refresh_history_session_idx" ON "mobile_session_refresh_history" USING btree ("session_id");
CREATE INDEX "mobile_sessions_active_user_idx" ON "mobile_sessions" USING btree ("user_id") WHERE "mobile_sessions"."revoked_at" IS NULL;
CREATE INDEX "mobile_sessions_user_idx" ON "mobile_sessions" USING btree ("user_id");
CREATE INDEX "mobile_sessions_expiry_idx" ON "mobile_sessions" USING btree ("refresh_expires_at");
CREATE INDEX "mobile_sessions_prev_refresh_idx" ON "mobile_sessions" USING btree ("prev_refresh_hash") WHERE "mobile_sessions"."prev_refresh_hash" IS NOT NULL;
CREATE INDEX "idx_rate_limit_scope_key_time" ON "rate_limit_events" USING btree ("scope","key_hash","attempted_at");
CREATE INDEX "idx_rate_limit_attempted_at" ON "rate_limit_events" USING btree ("attempted_at");
CREATE INDEX "idx_rate_limit_submission_id" ON "rate_limit_events" USING btree ("submission_id");
CREATE INDEX "idx_rate_limit_reservation_id" ON "rate_limit_events" USING btree ("reservation_id");
CREATE INDEX "idx_schedule_events_event_date" ON "schedule_events" USING btree ("event_date");
CREATE INDEX "idx_upload_rate_limit_ip_attempted" ON "upload_rate_limit_log" USING btree ("ip","attempted_at");
CREATE INDEX "idx_weekly_texts_cohort_class_created_at" ON "weekly_texts" USING btree ("cohort_id","class_date" DESC NULLS LAST,"created_at" DESC NULLS LAST);
CREATE INDEX "assignment_targets_enrollment_idx" ON "assignment_targets" USING btree ("enrollment_id");
CREATE INDEX "assignments_cohort_status_due_idx" ON "assignments" USING btree ("cohort_id","status","due_at");
CREATE INDEX "assignment_submissions_user_time_idx" ON "assignment_submissions" USING btree ("submitted_by_user_id","submitted_at");
CREATE INDEX "assignment_upload_intents_target_user_idx" ON "assignment_upload_intents" USING btree ("assignment_target_id","user_id");
CREATE INDEX "assignment_upload_intents_state_expiry_idx" ON "assignment_upload_intents" USING btree ("state","expires_at");
