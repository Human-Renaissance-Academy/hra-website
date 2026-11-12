/**
 * 데이터베이스 스키마 정의 파일
 *
 * 이 파일은 PostgreSQL 데이터베이스의 테이블 구조를 정의합니다.
 * Drizzle ORM을 사용하여 타입-안전한 데이터베이스 접근을 제공합니다.
 *
 * 포함된 테이블:
 * - users: 사용자 정보 (관리자/멤버)
 * - cohorts: HRA의 기수 정보 (1기, 2기, ...)
 * - notices: 공지사항
 * - classLogs: 수업일지
 * - classLogImages: 수업일지의 이미지들
 * - galleries: 갤러리 (여러 이미지를 모아놓은 앨범)
 * - galleryImages: 갤러리에 포함된 이미지들
 * - legacyApplications: 동아리 지원서 (LEGACY — read-only, 신규 접수는 applicationForms/applicationSubmissions 사용)
 */

// Drizzle ORM의 PostgreSQL 데이터 타입들
// 테이블 생성, 컬럼 타입, UUID 등을 정의할 때 사용
import {
  pgTable, // PostgreSQL 테이블 정의 함수
  text, // 긴 텍스트 저장 (varchar 제한 없음)
  timestamp, // 시간/날짜 저장
  varchar, // 제한된 길이의 텍스트 저장
  boolean, // true/false 저장
  integer, // 정수 저장
  index,
  pgEnum, // PostgreSQL의 enum 타입 (정해진 선택지만 가능)
  uuid, // 고유 ID 저장 (128비트 무작위 값)
  unique, // 복합 컬럼에 대한 UNIQUE 제약(중복 차단)을 선언할 때 사용
  check, // 컬럼 값에 대한 CHECK 제약 (조건식) 을 선언할 때 사용
  jsonb, // 학적 연결 승인 계획·변경 전후의 최소 식별자 기록
} from "drizzle-orm/pg-core";

// Drizzle ORM의 관계 설정 함수
// 테이블 간의 1:1, 1:N 관계를 정의할 때 사용
import { relations, sql } from "drizzle-orm";

// ============================================================
// Enums (열거형 - 정해진 선택지만 가능한 데이터 타입)
// ============================================================

// 사용자의 역할 종류
// - ADMIN: 관리자 (공지사항, 수업일지 작성 권한 있음)
// - FACULTY: 교수 (강의를 담당하는 교수 그룹)
// - MEMBER: 일반 멤버 (특정 기수에 소속된 회원)
// - PENDING: 승인 대기 (가입 후 아직 승인되지 않은 상태)
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "FACULTY", "MEMBER", "PENDING"]);

// 동아리 모집 상태
// - UPCOMING: 곧 시작될 예정
// - OPEN: 현재 모집 중
// - CLOSED: 모집 완료/종료됨
export const recruitmentStatusEnum = pgEnum("recruitment_status", [
  "UPCOMING",
  "OPEN",
  "CLOSED",
]);

// 공지사항 상태
// - DRAFT: 작성 중 (아직 게시되지 않음)
// - PUBLISHED: 게시됨 (사용자에게 보임)
export const noticeStatusEnum = pgEnum("notice_status", [
  "DRAFT",
  "PUBLISHED",
]);

// 지원서 처리 상태
// - PENDING: 검토 대기 중 (기본값)
// - ACCEPTED: 합격
// - REJECTED: 불합격
export const applicationStatusEnum = pgEnum("application_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
]);

// ============================================================
// Users (사용자 테이블)
// ============================================================

// 회원 정보를 저장하는 테이블
// 사이트에 가입한 관리자, 멤버들의 계정 정보를 관리합니다.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // 사용자 고유 ID (자동 생성)
  name: varchar("name", { length: 100 }).notNull(), // 사용자 이름 (최대 100자)
  email: varchar("email", { length: 255 }).notNull().unique(), // 이메일 (중복 불가, 로그인할 때 사용)
  passwordHash: text("password_hash"), // 비밀번호를 암호화한 값 (소셜 로그인 사용자는 null)
  role: userRoleEnum("role").notNull().default("PENDING"), // 사용자 역할 (기본값: 승인 대기)
  cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }), // 소속 기수 ID (MEMBER일 때만 의미 있음, 기수 삭제 시 null로 초기화)
  image: text("image"), // 프로필 사진 URL (선택사항)
  // OAuth provider binding (#67)
  //
  // 배경: signIn 콜백이 email 일치만으로 기존 사용자를 재인증하면, 공격자가 같은 email 의
  //   다른 provider 계정 (예: Kakao) 이나 같은 provider 의 다른 계정 (예: 매각된 Google account) 으로
  //   로그인해 피해자의 role 세션을 인수할 수 있다 (cross-provider account takeover).
  //
  // 해결: provider + providerAccountId 튜플을 영속 저장해 "이 계정은 이 provider 의 이 accountId 로만
  //   재로그인 가능" 이라는 강한 바인딩을 만든다. signIn 콜백은 이 튜플로 기존 계정 인계 여부를
  //   판단하고, email 매칭은 기존 계정 인계 근거로는 쓰지 않고 신규 생성 여부 및 차단 사유
  //   판정에만 사용한다 (자동 backfill 없음).
  //
  // NULL 허용 이유: 마이그레이션 이전 기존 소셜 사용자와 로컬 계정은 binding 이 없다.
  //   로컬 계정은 passwordHash 로 식별해 여전히 차단하고, 기존 소셜 사용자는 로그인 경로에서
  //   fail-closed (block(legacy-unbound)) 로 처리되며 관리자가 DB 나 오프라인 스크립트로
  //   직접 수동 바인딩해야만 재활성화된다 (관리자 UI 상의 수동 바인딩 액션은 없다).
  //   자동 backfill 은 email 선점 공격 (공격자가 피해자 email 로 새 소셜 계정을 만들어
  //   legacy row 를 임의 provider 로 채우는 공격) 을 재현하므로 도입하지 않는다.
  //
  // 데이터 무결성:
  //   1) UNIQUE 복합 제약 (usersOauthBindingUnique): (provider, providerAccountId) 튜플 전역 유일.
  //      Postgres 는 UNIQUE 에서 NULL 을 위반으로 보지 않으므로 미백필 row 는 공존 가능하다.
  //   2) CHECK 제약 (usersOauthBindingBothOrNeither): 둘 다 NULL 이거나 둘 다 NOT NULL 만 허용.
  //      부분 채움 (한쪽만 NULL) row 는 스키마 레벨에서 원천 차단한다.
  oauthProvider: text("oauth_provider"),
  oauthProviderAccountId: text("oauth_provider_account_id"),
  // 세션 무효화 버전 카운터 (#68, #74)
  //
  // 배경: JWT 세션 전략에서는 서버가 발급한 토큰이 클라이언트에 저장되므로,
  //   role 강등·계정 삭제 후에도 브라우저에 남은 기존 토큰이 계속 인증 통과할 수 있다 (stale session).
  //
  // 해결: users 테이블에 sessionVersion 을 두고 다음을 강제한다.
  //   1) jwt 콜백에서 매 요청마다 DB 의 sessionVersion 을 조회한다.
  //   2) 발급 시점에 토큰에 심어둔 sessionVersion 이 DB 값과 다르면 세션을 무효화(null 반환) 한다.
  //   3) role/cohort 변경 등 "즉시 로그아웃되어야 하는" 이벤트 발생 시 sessionVersion + 1.
  //      단, 실제 값이 바뀐 경우에만 증가시켜 no-op update 로 인한 불필요한 강제 로그아웃을 막는다.
  //
  // 이 컬럼은 절대 감소하지 않으며, DEFAULT 0 이므로 기존 사용자 backfill 은 자동 처리된다.
  // 마이그레이션 이전에 발급된 JWT 는 sessionVersion 필드 자체가 없어 최초 lookup 을 통과하고
  // 그 자리에서 sessionVersion 이 심어져 자연스러운 backfill 이 이루어진다.
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(), // 계정 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간 (수정할 때마다 자동 업데이트)
}, table => ({
  // (provider, providerAccountId) 튜플 전역 유일 (#67)
  //
  // Postgres 는 NULL 을 unique 로 보지 않으므로 미백필 row 는 여러 개 공존 가능하다.
  // legacy null/null row 는 로그인 경로에서 block(legacy-unbound) 로 차단되므로
  // 이 UNIQUE 제약과 함께 관리자가 DB/오프라인 스크립트로 수동 바인딩할 때만 튜플이 채워진다.
  usersOauthBindingUnique: unique("users_oauth_binding_unique").on(
    table.oauthProvider,
    table.oauthProviderAccountId,
  ),
  // (provider, providerAccountId) 둘 다 NULL 또는 둘 다 NOT NULL 강제 (#67)
  //
  // 목적: 부분 채움 (한쪽만 NULL) row 는 로직상 의미가 없다.
  //   - 코드 경로에서는 signIn 이 항상 두 값을 함께 write 하므로 부분 채움이 생기지 않지만,
  //   - 수동 SQL, 시드 스크립트, 실패한 운영 스크립트, 미래의 API 확장 등에서 위반이 발생하면
  //     decideOAuthSignIn 이 이를 legacy 로 오인해 예상 못한 block/allow 판정을 낼 수 있다.
  // 스키마 레벨에서 원천 차단해 코드와 데이터 무결성을 이중으로 보장한다.
  usersOauthBindingBothOrNeither: check(
    "users_oauth_binding_both_or_neither",
    sql`(${table.oauthProvider} IS NULL AND ${table.oauthProviderAccountId} IS NULL) OR (${table.oauthProvider} IS NOT NULL AND ${table.oauthProviderAccountId} IS NOT NULL)`,
  ),
}));

// Users 테이블과 다른 테이블의 관계 정의
// 한 사용자가 여러 개의 공지사항과 수업일지를 작성할 수 있음
// MEMBER 역할일 경우 하나의 기수에 소속됨
export const usersRelations = relations(users, ({ one, many }) => ({
  notices: many(notices), // 이 사용자가 작성한 모든 공지사항
  classLogs: many(classLogs), // 이 사용자가 작성한 모든 수업일지
  cohort: one(cohorts, { // 이 사용자가 소속된 기수 (MEMBER일 때만 의미 있음)
    fields: [users.cohortId],
    references: [cohorts.id],
  }),
}));

// ============================================================
// Cohorts (기수 테이블)
// ============================================================

// HRA의 각 기수(기간) 정보를 저장하는 테이블
// 1기, 2기, 3기, ... 와 같은 기수별로 모집 일정, 상태 등을 관리합니다.
export const cohorts = pgTable("cohorts", {
  id: uuid("id").primaryKey().defaultRandom(), // 기수 고유 ID (자동 생성)
  name: varchar("name", { length: 100 }).notNull(), // 기수 이름 (예: "1기", "2기")
  description: text("description"), // 기수에 대한 설명 (선택사항)
  startDate: timestamp("start_date"), // 기수 시작 날짜 (선택사항)
  endDate: timestamp("end_date"), // 기수 종료 날짜 (선택사항)
  recruitmentStatus: recruitmentStatusEnum("recruitment_status")
    .notNull()
    .default("UPCOMING"), // 모집 상태 (기본값: 곧 시작될 예정)
  recruitmentStartDate: timestamp("recruitment_start_date"), // 모집 시작 날짜
  recruitmentEndDate: timestamp("recruitment_end_date"), // 모집 종료 날짜
  googleFormUrl: text("google_form_url"), // 이 기수의 구글폼 링크 (선택사항, 지원 버튼 연결에 사용)
  googleSheetId: text("google_sheet_id"), // 이 기수와 연결된 구글 시트 ID (선택사항, 응답 데이터 조회에 사용)
  isActive: boolean("is_active").notNull().default(true), // 현재 활성 기수인지 여부 (기본값: 활성)
  order: integer("order").notNull().default(0), // 기수 표시 순서 (숫자가 작을수록 먼저 표시됨)
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(), // 기수 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Cohorts 테이블과 다른 테이블의 관계 정의
// 한 기수에 여러 지원서가 제출될 수 있음 (legacy 테이블 기준 — 신규 접수는 별도 시스템)
export const cohortsRelations = relations(cohorts, ({ many }) => ({
  legacyApplications: many(legacyApplications), // 이 기수에 제출된 모든 지원서 (legacy)
}));

// ============================================================
// Academic Students / Cohort Enrollments (G1 학생 명부·기수 등록)
// ============================================================

// G1은 등록만 지원한다. 휴학·탈퇴·수료 상태는 정책 확정 후 별도 migration으로 추가한다.
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["ENROLLED"]);

// 로그인 계정과 독립적인 학생 식별자다. 이메일/회원 기수로 자동 생성하거나 연결하지 않는다.
// #142의 탈퇴·파기 정책 확정 전에는 연결 계정 삭제를 거부하고, 승인된 연결 해제를 요구한다.
export const academicStudents = pgTable("academic_students", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique().references(() => users.id, { onDelete: "restrict" }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, table => ({
  // 일반 공백(스페이스)뿐인 이름은 DB에서도 거부한다. 입력 경로는 별도로 trim 검증한다.
  displayNameNotBlank: check("academic_students_display_name_not_blank", sql`length(btrim(${table.displayName})) > 0`),
}));

// 한 학생의 여러 기수 이력을 저장한다. 기존 users.cohortId/role은 변경하지 않는다.
// 학생·기수·등록 승인 계정은 연쇄 삭제하지 않아 명부와 승인 주체를 보존한다.
export const cohortEnrollments = pgTable("cohort_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => academicStudents.id, { onDelete: "restrict" }),
  cohortId: uuid("cohort_id").notNull().references(() => cohorts.id, { onDelete: "restrict" }),
  status: enrollmentStatusEnum("status").notNull().default("ENROLLED"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, table => ({
  // 동일 학생의 같은 기수 동시 등록도 UNIQUE가 최종 차단한다.
  studentCohortUnique: unique("cohort_enrollments_student_cohort_unique").on(table.studentId, table.cohortId),
  cohortStatusIndex: index("cohort_enrollments_cohort_status_idx").on(table.cohortId, table.status),
  endedAtOrder: check("cohort_enrollments_ended_at_order", sql`${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.enrolledAt}`),
}));

// 연결·명시 등록을 같은 트랜잭션으로 확정한 승인 기록입니다.
// 계획과 변경 기록에는 UUID·역할·확인 방식만 저장하며 이름·증빙 원문은 저장하지 않습니다.
export const academicEnrollmentLinkBatches = pgTable("academic_enrollment_link_batches", {
  requestId: uuid("request_id").primaryKey(),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  approvalReferenceId: uuid("approval_reference_id").notNull(),
  verificationMethod: text("verification_method").notNull(),
  plan: jsonb("plan").notNull(),
  changes: jsonb("changes").notNull(),
  linkedCount: integer("linked_count").notNull(),
  enrolledCount: integer("enrolled_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  verificationMethodAllowed: check("academic_enrollment_link_batches_verification_method_check",
    sql`${table.verificationMethod} IN ('IN_PERSON', 'VERIFIED_CONTACT')`),
  linkedCountNonnegative: check("academic_enrollment_link_batches_linked_count_check", sql`${table.linkedCount} >= 0`),
  enrolledCountNonnegative: check("academic_enrollment_link_batches_enrolled_count_check", sql`${table.enrolledCount} >= 0`),
}));

// ============================================================
// Notices (공지사항 테이블)
// ============================================================

// 동아리 공지사항을 저장하는 테이블
// 운영진이 작성하는 공지사항, 소식 등을 관리합니다.
export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(), // 공지사항 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 공지사항 제목 (최대 300자)
  content: text("content").notNull(), // 공지사항 본문 (길이 제한 없음)
  status: noticeStatusEnum("status").notNull().default("DRAFT"), // 공지사항 상태 (기본값: 작성 중)
  pinned: boolean("pinned").notNull().default(false), // 고정 공지사항인지 여부 (기본값: 고정 아님)
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }), // 작성자 ID (사용자가 삭제되면 null 로 설정 — 공지사항은 조직 자산이므로 보존)
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 공지사항 작성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Notices 테이블과 다른 테이블의 관계 정의
// 공지사항은 작성자와 optional 관계를 가짐 (authorId 가 nullable 이므로 작성자 없는 공지사항 가능)
export const noticesRelations = relations(notices, ({ one }) => ({
  author: one(users, { // 작성자 사용자 정보 (nullable)
    fields: [notices.authorId],
    references: [users.id],
  }),
}));

// ============================================================
// Class Logs (수업일지 테이블)
// ============================================================

// 각 수업의 내용, 진행 상황 등을 기록하는 테이블
// 운영진이 진행한 수업에 대한 요약, 사진 등을 저장합니다.
export const classLogs = pgTable("class_logs", {
  id: uuid("id").primaryKey().defaultRandom(), // 수업일지 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 수업 제목 (최대 300자)
  content: text("content").notNull(), // 수업 내용 (길이 제한 없음)
  classDate: timestamp("class_date").notNull(), // 수업이 진행된 날짜/시간
  cohortId: uuid("cohort_id").references(() => cohorts.id, { // 어느 기수의 수업인지 (선택사항, 기수 삭제되면 null로 설정됨)
    onDelete: "set null",
  }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }), // 작성자 ID (사용자가 삭제되면 null 로 설정 — 수업일지는 조직 자산이므로 보존)
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 수업일지 작성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Class Logs 테이블과 다른 테이블의 관계 정의
// 수업일지는 작성자 (nullable) 와 기수 (nullable) 에 optional 로 속하며, 여러 사진을 가질 수 있음
export const classLogsRelations = relations(classLogs, ({ one, many }) => ({
  author: one(users, { // 작성자 사용자 정보 (nullable)
    fields: [classLogs.authorId],
    references: [users.id],
  }),
  cohort: one(cohorts, { // 소속 기수 (nullable — 기수가 삭제되면 null)
    fields: [classLogs.cohortId],
    references: [cohorts.id],
  }),
  images: many(classLogImages), // 이 수업일지에 포함된 모든 사진
}));

// 수업일지 이미지 테이블
// 수업일지에 첨부되는 사진들을 저장합니다.
export const classLogImages = pgTable("class_log_images", {
  id: uuid("id").primaryKey().defaultRandom(), // 이미지 고유 ID (자동 생성)
  classLogId: uuid("class_log_id")
    .notNull()
    .references(() => classLogs.id, { onDelete: "cascade" }), // 어느 수업일지에 속하는지 (수업일지 삭제되면 이미지도 삭제됨)
  url: text("url").notNull(), // 이미지의 웹 주소 (URL)
  alt: varchar("alt", { length: 255 }), // 이미지 설명 (접근성을 위함, 선택사항)
  order: integer("order").notNull().default(0), // 사진 표시 순서 (숫자가 작을수록 먼저 표시됨)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 이미지 업로드 시간
});

// Class Log Images 테이블과 다른 테이블의 관계 정의
// 각 이미지는 정확히 하나의 수업일지에 속함
export const classLogImagesRelations = relations(
  classLogImages,
  ({ one }) => ({
    classLog: one(classLogs, { // 이 이미지가 속한 수업일지
      fields: [classLogImages.classLogId],
      references: [classLogs.id],
    }),
  })
);

// ============================================================
// Gallery (갤러리 테이블)
// ============================================================

// 여러 사진을 모아놓은 앨범 정보를 저장하는 테이블
// 특정 주제나 행사별로 사진들을 관리합니다.
export const galleries = pgTable("galleries", {
  id: uuid("id").primaryKey().defaultRandom(), // 갤러리 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 갤러리 제목 (최대 300자)
  description: text("description"), // 갤러리 설명 (선택사항)
  coverImageUrl: text("cover_image_url"), // 갤러리 커버 사진 URL (앨범 썸네일, 선택사항)
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 갤러리 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Gallery 테이블과 다른 테이블의 관계 정의
// 한 갤러리는 여러 사진을 가질 수 있음
export const galleriesRelations = relations(galleries, ({ many }) => ({
  images: many(galleryImages), // 이 갤러리에 포함된 모든 사진
}));

// 갤러리 이미지 테이블
// 갤러리에 포함되는 개별 사진들을 저장합니다.
export const galleryImages = pgTable("gallery_images", {
  id: uuid("id").primaryKey().defaultRandom(), // 이미지 고유 ID (자동 생성)
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }), // 어느 갤러리에 속하는지 (갤러리 삭제되면 이미지도 삭제됨)
  url: text("url").notNull(), // 이미지의 웹 주소 (URL)
  alt: varchar("alt", { length: 255 }), // 이미지 설명 (접근성을 위함, 선택사항)
  order: integer("order").notNull().default(0), // 사진 표시 순서 (숫자가 작을수록 먼저 표시됨)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 이미지 업로드 시간
});

// Gallery Images 테이블과 다른 테이블의 관계 정의
// 각 이미지는 정확히 하나의 갤러리에 속함
export const galleryImagesRelations = relations(galleryImages, ({ one }) => ({
  gallery: one(galleries, { // 이 이미지가 속한 갤러리
    fields: [galleryImages.galleryId],
    references: [galleries.id],
  }),
}));

// ============================================================
// Applications (지원서 테이블) — [LEGACY / READ-ONLY]
// ============================================================
//
// ⚠️ LEGACY TABLE — 신규 쓰기 경로는 없음 (2026-07 정리).
//
// - 신규 지원 접수는 `applicationForms` + `applicationSubmissions` 로 대체됨.
// - 이 테이블은 과거 데이터 보존 목적으로 유지되며, 관리자 대시보드
//   (`src/app/(admin)/admin/page.tsx`) 에서 "지원서 수 집계 (count)" 용도로만 read 된다.
// - 신규 서버 액션에서 이 테이블에 write / update 하지 말 것.
//   대신 `src/features/applications/actions/submissions.ts` 사용.
// - 데이터 마이그레이션 후 최종 drop 예정 (별도 이슈).
//
// 동아리에 지원한 사람들의 지원서를 저장하는 테이블 (레거시).
export const legacyApplications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(), // 지원서 고유 ID (자동 생성)
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "restrict" }), // 과거 지원서가 있으면 기수 삭제를 DB에서 차단합니다 (#193).
  applicantName: varchar("applicant_name", { length: 100 }).notNull(), // 지원자 이름 (최대 100자)
  applicantEmail: varchar("applicant_email", { length: 255 }).notNull(), // 지원자 이메일 (최대 255자)
  applicantPhone: varchar("applicant_phone", { length: 20 }), // 지원자 전화번호 (선택사항)
  university: varchar("university", { length: 100 }), // 지원자 대학교 (선택사항)
  major: varchar("major", { length: 100 }), // 지원자 전공 (선택사항)
  motivation: text("motivation").notNull(), // 지원 동기/자기소개 (길이 제한 없음)
  additionalInfo: text("additional_info"), // 추가 정보/특이사항 (선택사항)
  status: applicationStatusEnum("status").notNull().default("PENDING"), // 지원서 처리 상태 (기본값: 검토 대기)
  submittedAt: timestamp("submitted_at").notNull().defaultNow(), // 지원서 제출 시간
});

// Applications 테이블과 다른 테이블의 관계 정의
// 각 지원서는 정확히 하나의 기수에 속함
export const legacyApplicationsRelations = relations(legacyApplications, ({ one }) => ({
  cohort: one(cohorts, { // 이 지원서가 속한 기수
    fields: [legacyApplications.cohortId],
    references: [cohorts.id],
  }),
}));

// ============================================================
// Faculty (교수진 테이블)
// ============================================================

// 교수진 카테고리
// - CLASSICS: 고전읽기
// - BUSINESS: 기업실무
// - LECTURE: 특강
export const facultyCategoryEnum = pgEnum("faculty_category", [
  "CLASSICS",
  "BUSINESS",
  "LECTURE",
]);

// 교수진 정보를 저장하는 테이블
export const faculty = pgTable("faculty", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  category: facultyCategoryEnum("category").notNull(),
  currentPosition: text("current_position"), // 현직 (現)
  formerPosition: text("former_position"), // 전직 (前)
  imageUrl: text("image_url"), // 프로필 이미지 URL (선택사항)
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Alumni Stories (수료생 이야기 테이블)
// ============================================================

// 수료생 이야기를 저장하는 테이블
export const alumniStories = pgTable("alumni_stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(), // 수료생 이름
  title: varchar("title", { length: 100 }), // 소속/직함
  quote: varchar("quote", { length: 500 }).notNull(), // 인용 문구 (제목)
  content: text("content").notNull(), // 본문 내용
  imageUrl: text("image_url"), // 수료생 사진 URL (대표 이미지)
  isFeatured: boolean("is_featured").notNull().default(false), // 메인 페이지 배너 노출 여부
  pinned: boolean("pinned").notNull().default(false), // 목록 상단 고정 여부
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const alumniStoryImages = pgTable("alumni_story_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  alumniStoryId: uuid("alumni_story_id")
    .notNull()
    .references(() => alumniStories.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 255 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Alumni Stories 관계 정의
export const alumniStoriesRelations = relations(alumniStories, ({ many }) => ({
  images: many(alumniStoryImages),
}));

export const alumniStoryImagesRelations = relations(alumniStoryImages, ({ one }) => ({
  alumniStory: one(alumniStories, {
    fields: [alumniStoryImages.alumniStoryId],
    references: [alumniStories.id],
  }),
}));

// ============================================================
// FAQ Items (FAQ 질문·답변 테이블)
// ============================================================

// FAQ 페이지에 표시할 질문과 답변 목록
export const faqItems = pgTable("faq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),          // 질문
  answer: text("answer").notNull(),               // 답변 (줄바꿈 포함 자유 텍스트)
  order: integer("order").notNull().default(0),   // 표시 순서 (오름차순)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// FAQ Contact (FAQ 담당자 연락처 테이블)
// ============================================================

// FAQ 페이지에 표시할 담당자 연락처 정보
export const faqContact = pgTable("faq_contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  cohortName: varchar("cohort_name", { length: 50 }).notNull(), // 기수명 (예: "20기")
  contactName: varchar("contact_name", { length: 100 }).notNull(), // 담당자명
  contactPhone: varchar("contact_phone", { length: 20 }).notNull(), // 전화번호
  contactRole: varchar("contact_role", { length: 100 }).notNull().default("모집위원장"), // 역할
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Recruitment Settings (모집 설정 테이블)
// ============================================================

// 모집 안내 페이지의 설정 정보 (포스터, D-day, 현재 모집 기수 등)
export const recruitmentSettings = pgTable("recruitment_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  singletonKey: integer("singleton_key").notNull().default(1), // 설정은 고정 키 1인 한 행만 허용
  // 현재 모집 기수 정보 (모집 설정 관리자 페이지 상단 섹션)
  activeCohortId: uuid("active_cohort_id").references(() => cohorts.id, { onDelete: "set null" }), // 현재 모집 중인 기수 (null이면 모집 없음)
  recruitmentStatus: recruitmentStatusEnum("recruitment_status").default("UPCOMING"), // 모집 상태: 예정/모집중/마감
  googleFormUrl: text("google_form_url"), // 지원 구글폼 URL (지원하기 버튼에 사용)
  recruitmentStartDate: timestamp("recruitment_start_date"), // 모집 시작일
  // 기존 모집 안내 콘텐츠
  posterImageUrl: text("poster_image_url"), // 모집 포스터 이미지 URL
  deadlineDate: timestamp("deadline_date"), // 모집 종료일 / D-day 기준
  nextRecruitmentYear: integer("next_recruitment_year"), // 다음 모집 예정 연도
  nextRecruitmentMonth: integer("next_recruitment_month"), // 다음 모집 예정 월
  qualificationText: text("qualification_text"), // 지원 자격 안내 문구
  detailsMarkdown: text("details_markdown"), // 모집 세부 안내 (마크다운 자유 편집)
  posterLayout: text("poster_layout").default("right"), // 포스터 위치: right | left | none
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, table => ({
  singletonUnique: unique("recruitment_settings_singleton_key_unique").on(table.singletonKey),
  singletonCheck: check("recruitment_settings_singleton_key_check", sql`${table.singletonKey} = 1`),
}));

// ============================================================
// Notice Attachments (공지사항 첨부파일 테이블)
// ============================================================

// 공지사항에 첨부되는 파일/이미지를 저장합니다.
export const noticeAttachments = pgTable("notice_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  noticeId: uuid("notice_id")
    .notNull()
    .references(() => notices.id, { onDelete: "cascade" }),
  url: text("url").notNull(), // 파일 URL
  fileName: varchar("file_name", { length: 500 }).notNull(), // 원본 파일명
  fileSize: integer("file_size"), // 파일 크기 (bytes)
  fileType: varchar("file_type", { length: 100 }), // MIME type
  isImage: boolean("is_image").notNull().default(false), // 이미지 여부
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Notice Attachments 관계 정의
export const noticeAttachmentsRelations = relations(noticeAttachments, ({ one }) => ({
  notice: one(notices, {
    fields: [noticeAttachments.noticeId],
    references: [notices.id],
  }),
}));

// ============================================================
// Weekly Texts (주차별 텍스트 테이블)
// ============================================================

// 자료실의 주차별 텍스트를 저장합니다.
export const weeklyTexts = pgTable(
  "weekly_texts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 300 }).notNull(),
    fileUrl: text("file_url").notNull().default(""),
    fileName: varchar("file_name", { length: 500 }),
    body: text("body"),
    cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
    textType: varchar("text_type", { length: 20 }), // 텍스트 분류: "고전명작" | "경영서" | "기업실무" | null(미분류)
    classDate: timestamp("class_date"), // 수업 날짜 (정렬 기준, 선택사항)
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    // MEMBER 의 기수별 주간 텍스트 목록 조회를 위한 복합 인덱스.
    // - 쿼리 사이트: src/app/(member)/resources/weekly-texts/page.tsx
    //   WHERE cohortId = X ORDER BY classDate DESC NULLS LAST, createdAt DESC
    // - 실제 정렬식과 컬럼 순서/방향/NULL 처리를 정확히 일치시켜야 인덱스가 정렬용으로 활용됩니다.
    // - classDate 는 nullable 이므로 NULLS LAST 를 명시해야 Postgres 기본(DESC=NULLS FIRST) 과의 mismatch 를 피할 수 있습니다.
    // - ADMIN/FACULTY 경로는 cohortId 필터 없이 전체 조회하므로 이 인덱스의 혜택을 받지 않습니다.
    index("idx_weekly_texts_cohort_class_created_at").on(
      table.cohortId,
      table.classDate.desc().nullsLast(),
      table.createdAt.desc()
    ),
  ]
);

export const weeklyTextImages = pgTable("weekly_text_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  weeklyTextId: uuid("weekly_text_id")
    .notNull()
    .references(() => weeklyTexts.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 255 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Weekly Texts 관계 정의
export const weeklyTextsRelations = relations(weeklyTexts, ({ one, many }) => ({
  cohort: one(cohorts, {
    fields: [weeklyTexts.cohortId],
    references: [cohorts.id],
  }),
  images: many(weeklyTextImages),
}));

export const weeklyTextImagesRelations = relations(weeklyTextImages, ({ one }) => ({
  weeklyText: one(weeklyTexts, {
    fields: [weeklyTextImages.weeklyTextId],
    references: [weeklyTexts.id],
  }),
}));

export const classMaterials = pgTable("class_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  weekNumber: integer("week_number"),
  lectureTitle: varchar("lecture_title", { length: 200 }),
  audience: varchar("audience", { length: 20 }).notNull().default("STUDENT"),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  order: integer("order").notNull().default(0),
  classDate: timestamp("class_date"), // 수업 날짜 (정렬 기준, 선택사항)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classMaterialsRelations = relations(classMaterials, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [classMaterials.uploadedById],
    references: [users.id],
  }),
}));

// ============================================================
// Guidebooks (가이드북 테이블)
// ============================================================

// 자료실의 가이드북을 저장합니다.
export const guidebooks = pgTable("guidebooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pressArticles = pgTable("press_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  source: varchar("source", { length: 200 }).notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  order: integer("order").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Report Templates (보고서 양식 / 작성 가이드 테이블)
// ============================================================

// 보고서 양식과 작성 가이드의 본문(Markdown)을 DB에 저장합니다.
// 회원 자료실(/member/templates, /member/guides)과 관리자 페이지에서 공유합니다.
// - category: "template" | "guide"
//   * template: 보고서 작성용 양식(경영서/고전명작/기업실무 등)
//   * guide: 작성 가이드(보고서 작성 가이드, Markdown 가이드, 제출 안내 등)
// - reportCategory: 양식의 분야 코드 (template일 때만 의미 있음)
//   * "management-book" | "classic-book" | "business-practice"
// - slug: URL 식별자 (실제 라우팅 경로와 동일하게 사용)
//   * template 예시: "management-book", "classic-book", "business-practice"
//   * guide 예시: "report-writing-guide", "markdown-guide", "submission-guide"
// - body: Markdown 본문 (frontmatter 제외, 순수 본문만 저장)
export const reportTemplateCategoryEnum = pgEnum("report_template_category", [
  "template",
  "guide",
]);

export const reportTemplates = pgTable("report_templates", {
  id: uuid("id").primaryKey().defaultRandom(), // 양식/가이드 고유 ID
  slug: varchar("slug", { length: 200 }).notNull().unique(), // URL 식별자 (유일)
  title: varchar("title", { length: 300 }).notNull(), // 표시 제목
  category: reportTemplateCategoryEnum("category").notNull(), // template | guide
  reportCategory: varchar("report_category", { length: 50 }), // 분야 코드 (template일 때만)
  description: text("description"), // 짧은 설명 (목록 페이지 노출용)
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"), // 양식 버전
  body: text("body").notNull(), // Markdown 본문 (frontmatter 제외)
  published: boolean("published").notNull().default(true), // 공개 여부 (false면 회원에게 비노출)
  order: integer("order").notNull().default(0), // 목록 정렬 순서
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Application Form Management (지원서 양식 관리 테이블)
// ============================================================

// 질문 타입 정의
export const applicationQuestionTypeEnum = pgEnum("application_question_type", [
  "SHORT_ANSWER",    // 단답형
  "LONG_ANSWER",     // 장문형
  "MULTIPLE_CHOICE",  // 객관식 (택 1)
  "CHECKBOX",        // 체크박스 (다중 선택)
  "DROPDOWN",        // 드롭다운
]);

// 지원서 양식 마스터 정보
export const applicationForms = pgTable("application_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 255 }).notNull(), // 양식 제목
  description: text("description"), // 양식 설명
  cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "cascade" }), // 대상 기수
  isPublished: boolean("is_published").notNull().default(false), // 공개 여부
  questionsRevision: integer("questions_revision").notNull().default(0), // 질문 일괄 저장 충돌 감지용 버전
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// 지원서 양식 관계 정의
export const applicationFormsRelations = relations(applicationForms, ({ one, many }) => ({
  cohort: one(cohorts, {
    fields: [applicationForms.cohortId],
    references: [cohorts.id],
  }),
  questions: many(applicationQuestions),
  submissions: many(applicationSubmissions),
}));

// 양식별 질문 항목
export const applicationQuestions = pgTable("application_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => applicationForms.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // 질문 제목
  description: text("description"), // 질문 설명 (힌트 등)
  type: applicationQuestionTypeEnum("type").notNull(), // 질문 유형
  isRequired: boolean("is_required").notNull().default(false), // 필수 여부
  order: integer("order").notNull().default(0), // 표시 순서
});

// 질문 관계 정의
export const applicationQuestionsRelations = relations(applicationQuestions, ({ one, many }) => ({
  form: one(applicationForms, {
    fields: [applicationQuestions.formId],
    references: [applicationForms.id],
  }),
  options: many(applicationQuestionOptions),
  answers: many(applicationAnswers),
}));

// 객관식/체크박스/드롭다운용 선택지
export const applicationQuestionOptions = pgTable("application_question_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => applicationQuestions.id, { onDelete: "cascade" }),
  value: text("value").notNull(), // 선택지 텍스트
  order: integer("order").notNull().default(0), // 표시 순서
});

// 선택지 관계 정의
export const applicationQuestionOptionsRelations = relations(applicationQuestionOptions, ({ one }) => ({
  question: one(applicationQuestions, {
    fields: [applicationQuestionOptions.questionId],
    references: [applicationQuestions.id],
  }),
}));

// 지원서 제출 기본 정보
export const applicationSubmissions = pgTable(
  "application_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => applicationForms.id, { onDelete: "restrict" }), // 제출이 있는 양식 삭제를 DB에서 차단합니다 (#193).
    applicantName: varchar("applicant_name", { length: 100 }).notNull(), // 지원자 이름
    applicantEmail: varchar("applicant_email", { length: 255 }).notNull(), // 지원자 이메일
    applicantPhone: varchar("applicant_phone", { length: 20 }), // 지원자 연락처
    status: applicationStatusEnum("status").notNull().default("PENDING"), // 처리 상태
    submittedAt: timestamp("submitted_at").notNull().defaultNow(), // 제출 시간
  },
  table => ({
    // 동일 이메일이 같은 양식에 두 번 제출하지 못하도록 보장하는 UNIQUE 제약.
    // Postgres 레벨에서 원자적으로 dedup이 보장되므로, 애플리케이션 코드의
    // count-check + insert 패턴이 가지는 TOCTOU race를 방지합니다.
    formApplicantUnique: unique("application_submissions_form_applicant_unique").on(
      table.formId,
      table.applicantEmail
    ),
    // 관리자 지원서 목록 조회를 위한 복합 인덱스.
    // - 쿼리 사이트: src/app/(admin)/admin/application-forms/[id]/submissions/page.tsx
    //   WHERE formId = X ORDER BY submittedAt DESC
    // - 위 UNIQUE 는 (formId, applicantEmail) 이라 정렬 커버 불가 → 별도 인덱스 필요.
    // - 리드 헤비(관리자 열람 위주)라 인덱스 유지비용 대비 조회 이득이 큽니다.
    formSubmittedAtIdx: index("idx_application_submissions_form_submitted_at").on(
      table.formId,
      table.submittedAt.desc()
    ),
  })
);

// 제출 내역 관계 정의
export const applicationSubmissionsRelations = relations(applicationSubmissions, ({ one, many }) => ({
  form: one(applicationForms, {
    fields: [applicationSubmissions.formId],
    references: [applicationForms.id],
  }),
  answers: many(applicationAnswers),
}));

// 질문별 답변 상세
export const applicationAnswers = pgTable("application_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => applicationSubmissions.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    // 질문 단독 삭제는 차단합니다. 양식·기수 cascade 완료 후 검사는 별도 SQL의
    // DEFERRABLE INITIALLY DEFERRED로 보장합니다 (Drizzle 선언 API 미지원).
    .references(() => applicationQuestions.id, { onDelete: "no action" }),
  value: text("value").notNull(), // 답변 내용 (다중 선택은 구분자나 JSON 등으로 저장 가능)
});

// 답변 관계 정의
export const applicationAnswersRelations = relations(applicationAnswers, ({ one }) => ({
  submission: one(applicationSubmissions, {
    fields: [applicationAnswers.submissionId],
    references: [applicationSubmissions.id],
  }),
  question: one(applicationQuestions, {
    fields: [applicationAnswers.questionId],
    references: [applicationQuestions.id],
  }),
}));

export const applicationSubmissionsLog = pgTable(
  "application_submissions_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: varchar("ip", { length: 45 }),
    email: varchar("email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_submissions_ip_created").on(table.ip, table.createdAt),
    index("idx_submissions_email_created").on(table.email, table.createdAt),
  ]
);

// ============================================================
// Login Attempts (로그인 시도 로그 - Rate Limiting 용, #69)
// ============================================================

/**
 * 과거 로그인 시도 로그 테이블. #121부터 새 기록은 rateLimitEvents에 저장합니다.
 *
 * 목적:
 *   - Credentials brute-force / credential stuffing 방어.
 *   - Rate limit 판정 시 sliding window 안에서 실패 시도 수를 세는 원천 데이터.
 *
 * 스키마 근거:
 *   - id: uuid PK — 로우 식별용 (다른 값 없음).
 *   - ip: varchar(45) — IPv4(15) / IPv6(45) 최대 길이 수용. nullable —
 *     UNKNOWN_IP fallback 을 사용하지만 마이그레이션 안전상 nullable 유지
 *     (applicationSubmissionsLog 와 동일 패턴).
 *   - email: varchar(255) — RFC 5321 기준 이메일 로컬+도메인 최대 길이.
 *     nullable — 프론트가 email 없이 authorize 를 호출하는 병리 케이스 대비.
 *   - attemptedAt: with-timezone timestamp — Neon 은 UTC 로 저장하지만 timezone
 *     정보 보존이 rate window 계산의 정확도를 보장.
 *   - success: boolean NOT NULL — 실패 카운트만 잠금 판단에 쓰므로 성공/실패
 *     구분 필수. 감사 로그 목적으로 성공도 함께 기록해 이상 로그인 사후 분석 가능.
 *
 * 인덱스:
 *   - (ip, attempted_at): IP 기준 sliding window 스캔 (동일 IP 로 여러 이메일
 *     시도하는 credential stuffing 방어). 시간 컬럼을 뒤에 두어 범위 스캔 최적화.
 *   - (email, attempted_at): 이메일 기준 sliding window 스캔 (동일 이메일에
 *     여러 IP 로 시도하는 password spray 방어).
 *   - 별도 (ip, email, attempted_at) composite 는 만들지 않음 — 대부분의 쿼리는
 *     OR (ip=? OR email=?) 형태이므로 위 두 인덱스가 union 스캔에 유리.
 *
 * 유지보수: 과거 행은 일일 요청 제한 정리 작업이 48시간 후 삭제합니다.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: varchar("ip", { length: 45 }),
    email: varchar("email", { length: 255 }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
    success: boolean("success").notNull(),
  },
  (table) => [
    index("idx_login_attempts_ip_attempted").on(table.ip, table.attemptedAt),
    index("idx_login_attempts_email_attempted").on(table.email, table.attemptedAt),
  ]
);

/**
 * 과거 이미지 업로드 rate limit 로그 테이블 (#69).
 *
 * `/api/upload-image` 남용 방어 (Vercel Blob 실비 폭증 방지) 를 위한 IP 기준
 * sliding window 판정의 원천 데이터. 정책 상수 `UPLOAD_RATE_LIMIT` 참조.
 *
 * loginAttempts 와 스키마를 공유하지 않는 이유:
 *   업로드 이벤트에는 success/email 이 무의미하며, 감사·인덱스 크기·쿼리 계획
 *   명확성 확보를 위해 단일 목적 테이블로 분리한다.
 *
 * 유지보수: #121부터 새 기록은 rateLimitEvents에 저장하고 과거 행은 일일 정리합니다.
 */
export const uploadRateLimitLog = pgTable(
  "upload_rate_limit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: varchar("ip", { length: 45 }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_upload_rate_limit_ip_attempted").on(table.ip, table.attemptedAt),
  ]
);

/**
 * 요청 제한의 원자적 예약 이벤트 (#121).
 * scope 별 키는 해시로 저장하며 원본 IP·이메일을 남기지 않습니다.
 * 같은 예약의 여러 제한 축은 reservationId 로 묶이고, 성공한 지원서와 연결된
 * 이벤트는 해당 지원서 삭제 시 함께 삭제됩니다. 오래된 이벤트는 일일 정리 작업이 지웁니다.
 */
export const rateLimitEvents = pgTable(
  "rate_limit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationId: uuid("reservation_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
    submissionId: uuid("submission_id").references(() => applicationSubmissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_rate_limit_scope_key_time").on(table.scope, table.keyHash, table.attemptedAt),
    index("idx_rate_limit_attempted_at").on(table.attemptedAt),
    index("idx_rate_limit_submission_id").on(table.submissionId),
    // 같은 예약의 여러 축을 성공 로그인 정리·지원서 연결에서 함께 찾습니다 (#287).
    index("idx_rate_limit_reservation_id").on(table.reservationId),
  ],
);

/**
 * 서버가 새로 업로드한 이미지·문서 파일의 소유권 원장 (#88, #93).
 * 본문에 적힌 URL이나 Blob 도메인만으로 이 테이블에 소유권을 소급 부여하지 않습니다.
 * 콘텐츠 참조는 현재 저장된 본문을 기준으로 확인하며, 기존 미등록 파일은 자동 정리하지 않습니다.
 */
export const markdownImageAssets = pgTable(
  "markdown_image_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull().unique(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("idx_markdown_image_assets_created_at").on(table.createdAt)],
);

// ============================================================
// Schedule Events (일정 관리 테이블)
// ============================================================

/**
 * 일정 이벤트 유형
 * - CLASS: 토요일 정기수업 (세션 슬롯 여러 개)
 * - EVENT: 행사 (수료식, 송년회 등, 세션 없음)
 */
export const scheduleEventTypeEnum = pgEnum("schedule_event_type", [
  "CLASS",
  "EVENT",
]);

/**
 * 수업 세션 카테고리
 * - CLASSICS: 고전명작
 * - ENGLISH: 영어
 * - SPEECH: 스피치 특강 (한 달에 한 번, 3~4시간)
 * - SPECIAL_LECTURE: 특강 (진로 특강 등)
 * - CASE_STUDY: 케이스스터디
 */
export const sessionCategoryEnum = pgEnum("session_category", [
  "CLASSICS",
  "ENGLISH",
  "SPEECH",
  "SPECIAL_LECTURE",
  "CASE_STUDY",
]);

/**
 * 하루 단위 일정 이벤트 (부모 테이블)
 * - CLASS 유형: scheduleSessions 자식 레코드들을 가짐
 * - EVENT 유형: 단독으로 사용 (세션 없음)
 */
export const scheduleEvents = pgTable(
  "schedule_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventDate: timestamp("event_date").notNull(), // 수업/행사 시작 날짜+시간 (UTC 저장)
    endTime: varchar("end_time", { length: 5 }), // 종료 시간 "HH:MM" 형식 (선택)
    eventType: scheduleEventTypeEnum("event_type").notNull(), // CLASS | EVENT
    title: varchar("title", { length: 200 }).notNull(), // 예: "5기 3주차 수업", "수료식"
    cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }), // 관련 기수 (CLASS 필수, EVENT 선택)
    weekNumber: integer("week_number"), // 몇 주차인지 (CLASS일 때만 사용)
    description: text("description"), // 비고/설명 (선택)
    isPublic: boolean("is_public").notNull().default(true), // 메인 페이지 공개 여부
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // 공개 캘린더 범위 조회 + 관리자 전체 정렬 조회를 함께 지원하는 인덱스.
    // - 공개 쿼리 사이트: src/features/schedule/actions/index.ts (getPublicScheduleEvents)
    //   WHERE isPublic = true AND eventDate BETWEEN X, Y ORDER BY eventDate ASC
    // - 관리자 쿼리 사이트: 같은 파일의 관리자 목록 (WHERE 없이 ORDER BY eventDate DESC)
    // - Postgres B-tree 는 양방향 스캔이 가능하므로 ASC 인덱스가 DESC 정렬도 커버합니다.
    // - boolean 컬럼(isPublic)은 선택도가 낮아 선두 컬럼 이점이 작아 단일 컬럼 인덱스로 충분.
    //   추후 공개 쿼리에만 최적화가 필요해지면 partial index (WHERE is_public = true) 로 재검토.
    index("idx_schedule_events_event_date").on(table.eventDate),
  ]
);

// scheduleEvents 관계 정의
export const scheduleEventsRelations = relations(scheduleEvents, ({ one, many }) => ({
  cohort: one(cohorts, {
    fields: [scheduleEvents.cohortId],
    references: [cohorts.id],
  }),
  sessions: many(scheduleSessions), // 이 이벤트에 속한 세션 슬롯들
}));

/**
 * 수업 세션 슬롯 (자식 테이블, CLASS 이벤트 전용)
 * - 한 CLASS 이벤트에 여러 세션이 속함 (고전명작, 영어, 케이스스터디 등)
 * - EVENT 유형 이벤트에는 세션 없음
 */
export const scheduleSessions = pgTable("schedule_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleEventId: uuid("schedule_event_id")
    .notNull()
    .references(() => scheduleEvents.id, { onDelete: "cascade" }), // 이벤트 삭제 시 세션도 함께 삭제
  category: sessionCategoryEnum("category").notNull(), // 세션 카테고리
  facultyId: uuid("faculty_id").references(() => faculty.id, { onDelete: "set null" }), // 담당 교수/강사 (선택)
  content: text("content"), // 주요 내용 (책 제목, 수업 주제, 케이스스터디의 책 제목)
  reportCategory: varchar("report_category", { length: 50 }), // 케이스스터디 분야 (management-book/classic-book/business-practice)
  subTitle: text("sub_title"), // 케이스스터디 전용: 케이스스터디 제목
  subDescription: text("sub_description"), // 케이스스터디 전용: 케이스스터디 설명
  order: integer("order").notNull().default(0), // 세션 표시 순서
});

// scheduleSessions 관계 정의
export const scheduleSessionsRelations = relations(scheduleSessions, ({ one }) => ({
  scheduleEvent: one(scheduleEvents, {
    fields: [scheduleSessions.scheduleEventId],
    references: [scheduleEvents.id],
  }),
  faculty: one(faculty, {
    fields: [scheduleSessions.facultyId],
    references: [faculty.id],
  }),
}));

// ============================================================
// Type exports (타입 내보내기)
// ============================================================

// Drizzle ORM은 데이터베이스 테이블을 정의한 후 자동으로 TypeScript 타입을 생성할 수 있습니다.
// 아래 타입들은 데이터베이스 데이터를 코드에서 사용할 때 타입 검사를 제공합니다.

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Cohort = typeof cohorts.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type ClassLog = typeof classLogs.$inferSelect;
export type Gallery = typeof galleries.$inferSelect;
export type GalleryImage = typeof galleryImages.$inferSelect;
export type LegacyApplication = typeof legacyApplications.$inferSelect;
export type Faculty = typeof faculty.$inferSelect;
export type AlumniStory = typeof alumniStories.$inferSelect;
export type FaqContactInfo = typeof faqContact.$inferSelect;
export type FaqItem = typeof faqItems.$inferSelect;
export type RecruitmentSetting = typeof recruitmentSettings.$inferSelect;
export type NoticeAttachment = typeof noticeAttachments.$inferSelect;
export type WeeklyText = typeof weeklyTexts.$inferSelect;
export type WeeklyTextImage = typeof weeklyTextImages.$inferSelect;
export type ClassMaterial = typeof classMaterials.$inferSelect;
export type Guidebook = typeof guidebooks.$inferSelect;
export type PressArticle = typeof pressArticles.$inferSelect;
export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type NewReportTemplate = typeof reportTemplates.$inferInsert;
export type ScheduleEvent = typeof scheduleEvents.$inferSelect;
export type NewScheduleEvent = typeof scheduleEvents.$inferInsert;
export type ScheduleSession = typeof scheduleSessions.$inferSelect;
export type NewScheduleSession = typeof scheduleSessions.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
export type UploadRateLimitEntry = typeof uploadRateLimitLog.$inferSelect;
export type NewUploadRateLimitEntry = typeof uploadRateLimitLog.$inferInsert;

// 학사 명부 등록의 최소 감사 기록도 Drizzle 스키마 적용 대상에 포함한다.
export { academicRosterRegistrations } from "./academic-roster";

// 과제 정의와 최초 공개 대상도 Drizzle 적용 대상에 포함한다.
export * from "./academic-assignments";

// 과제 업로드 의도·단일 최종 제출·파일 메타를 같은 스키마로 관리한다.
export * from "./academic-submissions";

// 과제 변경과 공개 확인의 최소 감사 기록을 Drizzle 적용 대상에 포함한다.
export { academicAssignmentEvents } from "./academic-assignment-events";

// 과제 업로드 승인·취소·정리 원장을 Drizzle 관리 범위에 포함한다.
export { academicUploadAuthorizations } from "./academic-upload-authorizations";

// 개별 제출 파일의 전달 허가 기록을 Drizzle 관리 범위에 포함한다.
export { academicSubmissionFileReads } from "./academic-file-accesses";

// 모바일 로그인 토큰의 해시·회수·만료 상태를 같은 스키마 진입점에 포함한다.
export { mobileSessions, mobileSessionRefreshHistory } from "./mobile-sessions";
