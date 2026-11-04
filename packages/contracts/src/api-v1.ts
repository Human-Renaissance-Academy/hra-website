/**
 * #272 공용 API v1의 공통 오류·페이지네이션·시각(UTC wire vs KST 날짜)·핵심 MVP whitelist DTO 계약입니다.
 *
 * 역할:
 * - Web·Android·iOS 클라이언트가 공유할 기계 판독 가능한 오류 코드와 HTTP 상태 매핑을 고정합니다.
 * - DB row를 직접 반환하지 않고 허용된 공개 필드만 선택하는 whitelist DTO mapper를 제공합니다.
 * - 전송 시각(UTC 밀리초 ISO 문자열)과 한국 시각 기준 달력 날짜(YYYY-MM-DD)를 분리합니다.
 * - Web 앱의 물리 경로 이동(#271) 전에도 서버·클라이언트·계약 테스트가 이 패키지를 정본으로 참조합니다.
 */
import { z } from "zod/v4";
import { getDisplayEmail, USER_ROLES, type UserRole } from "./identity";

/**
 * #272 최소 MVP API의 8개 도메인 경계입니다.
 */
export const API_V1_MVP_DOMAINS = [
  "me",
  "notices",
  "schedule",
  "resources",
  "assignments",
  "submissions",
  "upload",
  "download",
] as const;
export type ApiV1MvpDomain = (typeof API_V1_MVP_DOMAINS)[number];

/**
 * #272 공통 오류 코드 목록입니다.
 * 인증·인가 실패, 입력 검증, 요청 한도 초과, 기능 비활성화, 상태/동시성 충돌, 스토리지 실패를 모두 포함합니다.
 */
export const API_V1_ERROR_CODES = [
  "DISABLED",
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_LARGE",
  "RATE_LIMITED",
  "STORAGE_UNAVAILABLE",
  "UNAVAILABLE",
] as const;
export type ApiV1ErrorCode = (typeof API_V1_ERROR_CODES)[number];

/**
 * 오류 코드별 고정 HTTP 상태 코드 매핑입니다.
 */
export const API_V1_ERROR_STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_LARGE: 413,
  RATE_LIMITED: 429,
  DISABLED: 503,
  STORAGE_UNAVAILABLE: 503,
  UNAVAILABLE: 503,
} as const satisfies Record<ApiV1ErrorCode, number>;

/**
 * 사용자에게 안전하게 노출할 수 있는 기본 한국어 오류 안내 문구입니다.
 */
export const API_V1_DEFAULT_ERROR_MESSAGES = {
  DISABLED: "현재 사용할 수 없는 기능입니다.",
  INVALID_INPUT: "요청 입력값이 올바르지 않습니다.",
  UNAUTHENTICATED: "로그인이 필요합니다.",
  FORBIDDEN: "요청한 작업에 대한 권한이 없습니다.",
  NOT_FOUND: "요청한 대상을 찾을 수 없습니다.",
  CONFLICT: "다른 변경과 충돌했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
  TOO_LARGE: "허용된 요청 크기를 초과했습니다.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  STORAGE_UNAVAILABLE: "파일 저장소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  UNAVAILABLE: "요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.",
} as const satisfies Record<ApiV1ErrorCode, string>;

/**
 * 표준 UUID 식별자 스키마입니다. 줄바꿈·공백 접미사를 허용하지 않습니다.
 */
export const apiV1UuidSchema = z
  .string()
  .length(36)
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/**
 * 전송 시각(wire timestamp)은 항상 UTC 밀리초 정밀도 ISO-8601(`YYYY-MM-DDTHH:mm:ss.sssZ`)로 고정합니다.
 * KST(+09:00) 표시 변환은 UI 계층에서만 수행합니다.
 */
export const apiV1TimestampSchema = z.iso.datetime({ precision: 3 }).refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});

/**
 * 한국 시각 기준 수업일·일정일 등 시차로 날짜가 밀리면 안 되는 달력 날짜(`YYYY-MM-DD`) 스키마입니다.
 */
export const apiV1CalendarDateSchema = z.iso.date();

/**
 * Date 객체 또는 정규 UTC ISO 문자열을 API v1 wire timestamp 문자열로 변환합니다.
 */
export function toApiV1Timestamp(value: Date | string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new TypeError("유효하지 않은 Date 객체입니다.");
    }
    return value.toISOString();
  }
  return apiV1TimestampSchema.parse(value);
}

/**
 * 공통 오류 응답 스키마입니다 (`{ error: { code, message, requestId, retryAfterSeconds? } }`).
 * retryAfterSeconds는 RATE_LIMITED 응답에서만 선택적으로 허용합니다.
 */
export const apiV1ErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.enum(API_V1_ERROR_CODES),
        message: z.string().min(1),
        requestId: apiV1UuidSchema,
        retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
      })
      .strict()
      .refine(
        (error) => error.retryAfterSeconds === undefined || error.code === "RATE_LIMITED",
        "retryAfterSeconds는 RATE_LIMITED 오류에서만 설정할 수 있습니다.",
      ),
  })
  .strict();
export type ApiV1ErrorResponse = z.infer<typeof apiV1ErrorResponseSchema>;

/**
 * 오류 코드에 대응하는 HTTP 상태 코드를 반환합니다.
 */
export function getApiV1ErrorHttpStatus(code: ApiV1ErrorCode): number {
  return API_V1_ERROR_STATUS_BY_CODE[code];
}

/**
 * 내부 예외 속성(stack, sql, cause, token 등)을 제거하고 공개 계약 필드만 선택해 오류 응답을 구성합니다.
 */
export function toApiV1ErrorResponse(input: {
  code: ApiV1ErrorCode;
  message?: string;
  requestId: string;
  retryAfterSeconds?: number;
}): ApiV1ErrorResponse {
  const code = input.code;
  const message =
    typeof input.message === "string" && input.message.trim().length > 0
      ? input.message
      : API_V1_DEFAULT_ERROR_MESSAGES[code];
  const error: ApiV1ErrorResponse["error"] =
    code === "RATE_LIMITED" && input.retryAfterSeconds !== undefined
      ? {
          code,
          message,
          requestId: input.requestId,
          retryAfterSeconds: input.retryAfterSeconds,
        }
      : {
          code,
          message,
          requestId: input.requestId,
        };
  return apiV1ErrorResponseSchema.parse({ error });
}

export const API_V1_DEFAULT_PAGE_SIZE = 10;
export const API_V1_MAX_PAGE_SIZE = 50;

/**
 * 목록 API의 공통 페이지네이션·검색 질의 스키마입니다.
 */
export const apiV1PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(API_V1_MAX_PAGE_SIZE).default(API_V1_DEFAULT_PAGE_SIZE),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
  })
  .strict();
export type ApiV1PaginationQuery = z.infer<typeof apiV1PaginationQuerySchema>;

/**
 * 목록 API 응답의 공통 페이지네이션 메타데이터 스키마입니다.
 */
export const apiV1PageMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(API_V1_MAX_PAGE_SIZE),
    totalCount: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();
export type ApiV1PageMeta = z.infer<typeof apiV1PageMetaSchema>;

/**
 * page, pageSize, totalCount로부터 일관된 페이지네이션 메타데이터를 계산합니다.
 */
export function toApiV1PageMeta(input: {
  page: number;
  pageSize: number;
  totalCount: number;
}): ApiV1PageMeta {
  const page = Math.trunc(input.page);
  const pageSize = Math.trunc(input.pageSize);
  const totalCount = Math.trunc(input.totalCount);
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  return apiV1PageMetaSchema.parse({
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
  });
}

/**
 * `/api/v1/me` 응답의 사용자 프로필 DTO 스키마입니다.
 * 비밀번호 해시·OAuth provider 식별자·내부 소셜 대체 이메일(@oauth.placeholder)·세션 버전은 제외합니다.
 */
export const apiV1MeResponseSchema = z
  .object({
    user: z
      .object({
        id: apiV1UuidSchema,
        name: z.string().min(1).nullable(),
        email: z.string().min(1).nullable(),
        role: z.enum(USER_ROLES),
        cohortId: apiV1UuidSchema.nullable(),
        imageUrl: z.string().min(1).nullable(),
      })
      .strict(),
  })
  .strict();
export type ApiV1MeResponse = z.infer<typeof apiV1MeResponseSchema>;

/**
 * DB 사용자 행이나 세션 객체에서 `/api/v1/me` 공개 DTO 필드만 안전하게 추출합니다.
 */
export function toApiV1MeResponse(input: {
  id: string;
  name?: string | null;
  email?: string | null;
  role: UserRole;
  cohortId?: string | null;
  image?: string | null;
  imageUrl?: string | null;
}): ApiV1MeResponse {
  const rawImage = input.imageUrl ?? input.image ?? null;
  return apiV1MeResponseSchema.parse({
    user: {
      id: input.id,
      name: typeof input.name === "string" && input.name.trim().length > 0 ? input.name : null,
      email: getDisplayEmail(input.email),
      role: input.role,
      cohortId: input.cohortId ?? null,
      imageUrl: typeof rawImage === "string" && rawImage.trim().length > 0 ? rawImage : null,
    },
  });
}

/**
 * 공개 공지사항 목록 항목의 API v1 whitelist DTO 스키마입니다.
 * 내부 작성자 ID(`authorId`)나 초안 상태 행은 공개 목록 DTO에 포함하지 않습니다.
 */
export const apiV1NoticeSummarySchema = z
  .object({
    id: apiV1UuidSchema,
    title: z.string().min(1),
    excerpt: z.string(),
    pinned: z.boolean(),
    viewCount: z.number().int().nonnegative(),
    createdAt: apiV1TimestampSchema,
    updatedAt: apiV1TimestampSchema,
  })
  .strict();
export type ApiV1NoticeSummary = z.infer<typeof apiV1NoticeSummarySchema>;

/**
 * 공개 공지 목록 GET 응답은 허용된 DTO 배열과 공통 페이지 정보만 전달합니다.
 * 요청한 페이지가 전체 범위를 넘으면 빈 배열과 요청 페이지 번호를 반환합니다.
 */
export const apiV1NoticeListResponseSchema = z
  .object({
    notices: z.array(apiV1NoticeSummarySchema).max(API_V1_MAX_PAGE_SIZE),
    page: apiV1PageMetaSchema,
  })
  .strict();
export type ApiV1NoticeListResponse = z.infer<typeof apiV1NoticeListResponseSchema>;

/**
 * 공지사항 행과 발췌 문자열에서 공개 목록 DTO 필드만 선택합니다.
 */
export function toApiV1NoticeSummary(input: {
  id: string;
  title: string;
  excerpt: string;
  pinned: boolean;
  viewCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ApiV1NoticeSummary {
  return apiV1NoticeSummarySchema.parse({
    id: input.id,
    title: input.title,
    excerpt: input.excerpt,
    pinned: input.pinned,
    viewCount: input.viewCount,
    createdAt: toApiV1Timestamp(input.createdAt),
    updatedAt: toApiV1Timestamp(input.updatedAt),
  });
}

/**
 * 공개 공지 상세 GET은 본문과 화면에 필요한 최소 필드만 전달합니다.
 * 작성자·발행 상태·고정 여부·이전/다음글은 공개 API 계약에 포함하지 않습니다.
 */
export const apiV1NoticeDetailResponseSchema = z
  .object({
    notice: z
      .object({
        id: apiV1UuidSchema,
        title: z.string().min(1),
        content: z.string(),
        viewCount: z.number().int().nonnegative(),
        createdAt: apiV1TimestampSchema,
      })
      .strict(),
  })
  .strict();
export type ApiV1NoticeDetailResponse = z.infer<typeof apiV1NoticeDetailResponseSchema>;

/** DB 조회 결과에서 공지 상세 API의 허용된 5개 필드만 선택합니다. */
export function toApiV1NoticeDetailResponse(input: {
  id: string;
  title: string;
  content: string;
  viewCount: number;
  createdAt: Date | string;
}): ApiV1NoticeDetailResponse {
  return apiV1NoticeDetailResponseSchema.parse({
    notice: {
      id: input.id,
      title: input.title,
      content: input.content,
      viewCount: input.viewCount,
      createdAt: toApiV1Timestamp(input.createdAt),
    },
  });
}

/**
 * 공개 일정의 시각은 실제 UTC 순간이 아닌 한국 달력의 벽시계 HH:MM 값입니다.
 * 24:00, 초 단위, 시간대 접미어는 허용하지 않습니다.
 */
const apiV1ScheduleWallTimeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);

/** 기수와 교수는 화면에 표시할 식별자·이름만 전달합니다. */
const apiV1ScheduleNamedReferenceSchema = z
  .object({ id: apiV1UuidSchema, name: z.string().min(1) })
  .strict();

/** 공개 일정 세션은 강의 내용과 교수 표시 필드만 포함합니다. */
const apiV1ScheduleSessionSchema = z
  .object({
    category: z.enum(["CLASSICS", "ENGLISH", "SPEECH", "SPECIAL_LECTURE", "CASE_STUDY"]),
    content: z.string().nullable(),
    reportCategory: z.string().nullable(),
    subTitle: z.string().nullable(),
    subDescription: z.string().nullable(),
    faculty: apiV1ScheduleNamedReferenceSchema.nullable(),
    order: z.number().int(),
  })
  .strict();

/** 날짜·시각은 한국 달력의 벽시계 값이며 UTC timestamp가 아닙니다. */
const apiV1ScheduleEventSchema = z
  .object({
    id: apiV1UuidSchema,
    calendarDate: apiV1CalendarDateSchema,
    startTime: apiV1ScheduleWallTimeSchema,
    endTime: apiV1ScheduleWallTimeSchema.nullable(),
    eventType: z.enum(["CLASS", "EVENT"]),
    title: z.string().min(1),
    weekNumber: z.number().int().nullable(),
    description: z.string().nullable(),
    cohort: apiV1ScheduleNamedReferenceSchema.nullable(),
    sessions: z.array(apiV1ScheduleSessionSchema),
  })
  .strict();

/** 공개 일정 월 조회는 year·month를 반드시 받고 다른 query key를 거부합니다. */
export const apiV1ScheduleQuerySchema = z
  .object({
    year: z.coerce.number().int().min(1900).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  })
  .strict();
export type ApiV1ScheduleQuery = z.infer<typeof apiV1ScheduleQuerySchema>;

/** 공개 월별 일정 API의 엄격한 응답 계약입니다. */
export const apiV1ScheduleResponseSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    timeZone: z.literal("Asia/Seoul"),
    events: z.array(apiV1ScheduleEventSchema),
  })
  .strict();
export type ApiV1ScheduleResponse = z.infer<typeof apiV1ScheduleResponseSchema>;

/**
 * 회원 가이드북 목록은 page와 pageSize만 허용합니다.
 * 기본값은 공통 목록 계약과 같고, 안전한 OFFSET 범위는 Route에서 추가 검증합니다.
 */
export const apiV1GuidebookListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(API_V1_MAX_PAGE_SIZE).default(API_V1_DEFAULT_PAGE_SIZE),
  })
  .strict();
export type ApiV1GuidebookListQuery = z.infer<typeof apiV1GuidebookListQuerySchema>;

/**
 * 승인 회원에게 노출하는 가이드북 최소 메타데이터입니다.
 * 작성시각과 비공개 Blob URL·파일명·토큰은 반환하지 않습니다.
 */
export const apiV1GuidebookSummarySchema = z
  .object({
    id: apiV1UuidSchema,
    title: z.string().min(1),
  })
  .strict();
export type ApiV1GuidebookSummary = z.infer<typeof apiV1GuidebookSummarySchema>;

/** DB 조회 결과에서 회원에게 허용된 ID·제목만 선택합니다. */
export function toApiV1GuidebookSummary(input: { id: string; title: string }): ApiV1GuidebookSummary {
  return apiV1GuidebookSummarySchema.parse({ id: input.id, title: input.title });
}

/** 승인 회원 가이드북 GET 응답은 최대 50건과 공통 페이지 정보만 포함합니다. */
export const apiV1GuidebookListResponseSchema = z
  .object({
    guidebooks: z.array(apiV1GuidebookSummarySchema).max(API_V1_MAX_PAGE_SIZE),
    page: apiV1PageMetaSchema,
  })
  .strict();
export type ApiV1GuidebookListResponse = z.infer<typeof apiV1GuidebookListResponseSchema>;

/** 본인 과제 목록은 기존 학생 조회의 페이지 상한과 기본 크기를 그대로 사용합니다. */
export const apiV1AssignmentListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(API_V1_MAX_PAGE_SIZE).default(20),
  })
  .strict();
export type ApiV1AssignmentListQuery = z.infer<typeof apiV1AssignmentListQuerySchema>;

/** 최종 제출의 식별자와 UTC 시각만 전달하며 작성 계정·업로드 원장은 숨깁니다. */
export const apiV1SubmissionSummarySchema = z
  .object({ submissionId: apiV1UuidSchema, submittedAt: apiV1TimestampSchema })
  .strict();
export type ApiV1SubmissionSummary = z.infer<typeof apiV1SubmissionSummarySchema>;

/** 개인 PDF의 최소 메타데이터입니다. 원본 파일 URL·저장 키·토큰은 포함하지 않습니다. */
export const apiV1SubmissionFileMetadataSchema = z
  .object({
    fileId: apiV1UuidSchema,
    originalName: z.string().min(1).max(255),
    mimeType: z.literal("application/pdf"),
    sizeBytes: z.number().int().min(1).max(52_428_800),
  })
  .strict();
export type ApiV1SubmissionFileMetadata = z.infer<typeof apiV1SubmissionFileMetadataSchema>;

/** 본인에게 공개된 과제의 최소 목록 DTO입니다. 다른 학생·학적 식별자는 제외합니다. */
export const apiV1AssignmentSummarySchema = z
  .object({
    assignmentId: apiV1UuidSchema,
    targetId: apiV1UuidSchema,
    title: z.string().min(1),
    status: z.enum(["PUBLISHED", "CLOSED"]),
    dueAt: apiV1TimestampSchema,
    publishedAt: apiV1TimestampSchema,
    submission: apiV1SubmissionSummarySchema.nullable(),
  })
  .strict();
export type ApiV1AssignmentSummary = z.infer<typeof apiV1AssignmentSummarySchema>;

/** 과제 상세는 지침과 본인 최종 PDF 메타데이터만 추가합니다. */
export const apiV1AssignmentDetailSchema = apiV1AssignmentSummarySchema
  .extend({ instructions: z.string(), file: apiV1SubmissionFileMetadataSchema.nullable() })
  .strict();
export type ApiV1AssignmentDetail = z.infer<typeof apiV1AssignmentDetailSchema>;

/** 총수 조회 없는 학생 서비스의 페이지 결과를 보존하고 추정 totalCount는 만들지 않습니다. */
export const apiV1AssignmentListResponseSchema = z
  .object({
    assignments: z.array(apiV1AssignmentSummarySchema).max(API_V1_MAX_PAGE_SIZE),
    page: z.object({
      page: z.number().int().min(1).max(10_000),
      pageSize: z.number().int().min(1).max(API_V1_MAX_PAGE_SIZE),
      hasNextPage: z.boolean(),
    }).strict(),
  })
  .strict();
export type ApiV1AssignmentListResponse = z.infer<typeof apiV1AssignmentListResponseSchema>;

/** 과제 상세 GET 응답은 허용된 과제 DTO 하나로 고정합니다. */
export const apiV1AssignmentDetailResponseSchema = z
  .object({ assignment: apiV1AssignmentDetailSchema })
  .strict();
export type ApiV1AssignmentDetailResponse = z.infer<typeof apiV1AssignmentDetailResponseSchema>;

/** 미제출 상태는 두 null로 표현하고 업로드 중 원장·임시 파일은 제공하지 않습니다. */
export const apiV1AssignmentSubmissionResponseSchema = z
  .object({
    submission: apiV1SubmissionSummarySchema.nullable(),
    file: apiV1SubmissionFileMetadataSchema.nullable(),
  })
  .strict();
export type ApiV1AssignmentSubmissionResponse = z.infer<typeof apiV1AssignmentSubmissionResponseSchema>;

/** 제출 최종화는 식별자 세 개만 받고 파일 저장 위치나 사용자 ID를 입력받지 않습니다. */
export const apiV1FinalizeSubmissionInputSchema = z
  .object({ assignmentId: apiV1UuidSchema, uploadIntentId: apiV1UuidSchema, submissionKey: apiV1UuidSchema })
  .strict();
export type ApiV1FinalizeSubmissionInput = z.infer<typeof apiV1FinalizeSubmissionInputSchema>;

/** 최초 확정과 같은 키의 성공 복구는 동일한 HTTP 200 결과와 replayed로 구분합니다. */
export const apiV1FinalizedSubmissionResponseSchema = z
  .object({
    submission: z.object({
      assignmentId: apiV1UuidSchema,
      submissionId: apiV1UuidSchema,
      submittedAt: apiV1TimestampSchema,
      replayed: z.boolean(),
      file: apiV1SubmissionFileMetadataSchema,
    }).strict(),
  })
  .strict();
export type ApiV1FinalizedSubmissionResponse = z.infer<typeof apiV1FinalizedSubmissionResponseSchema>;

/** 비어 있지 않은 안전한 PDF 원본명과 50MiB 이하 크기로 업로드 발급 입력을 제한합니다. */
export const apiV1UploadIntentInputSchema = z
  .object({
    assignmentId: apiV1UuidSchema,
    requestId: apiV1UuidSchema,
    originalName: z.string().trim().min(1).max(255)
      .refine((value) => !/[\x00-\x1f\x7f/\\]/.test(value) && /\.pdf$/i.test(value)),
    sizeBytes: z.number().int().min(1).max(52_428_800),
    mimeType: z.literal("application/pdf"),
  })
  .strict();
export type ApiV1UploadIntentInput = z.infer<typeof apiV1UploadIntentInputSchema>;

/** 검증·취소 요청의 업로드 ID는 경로에서 받고 과제 ID만 JSON 본문에서 받습니다. */
export const apiV1UploadSelectionInputSchema = z.object({ assignmentId: apiV1UuidSchema }).strict();
export type ApiV1UploadSelectionInput = z.infer<typeof apiV1UploadSelectionInputSchema>;

/** 서버가 발급한 불투명 경로는 SDK 전송에만 쓰며 해당 발급 ID와 반드시 일치해야 합니다. */
export const apiV1UploadIntentResponseSchema = z
  .object({
    uploadIntentId: apiV1UuidSchema,
    pathname: z.string().regex(/^academic-uploads\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/document\.pdf$/),
    expiresAt: apiV1TimestampSchema,
  })
  .strict()
  .refine((value) => value.pathname === `academic-uploads/v1/${value.uploadIntentId.toLowerCase()}/document.pdf`);
export type ApiV1UploadIntentResponse = z.infer<typeof apiV1UploadIntentResponseSchema>;

/** 객체 검증은 제출 최종화와 구분하며 저장소 상세는 응답에 포함하지 않습니다. */
export const apiV1UploadVerifiedResponseSchema = z.object({ state: z.literal("VERIFIED") }).strict();
export type ApiV1UploadVerifiedResponse = z.infer<typeof apiV1UploadVerifiedResponseSchema>;

/** 취소는 원장 종료를 나타내며 실제 객체의 즉시 삭제를 의미하지 않습니다. */
export const apiV1UploadCancelledResponseSchema = z.object({ state: z.literal("CANCELLED") }).strict();
export type ApiV1UploadCancelledResponse = z.infer<typeof apiV1UploadCancelledResponseSchema>;

/**
 * 모바일 로그인 시 선택적으로 보내는 기기 표시 정보입니다.
 * Android·iOS 공용 클라이언트가 사용하며 플랫폼만 필수이고 버전·기기명은 빈 값과 추가 키를 거부합니다.
 */
export const apiV1MobileDeviceSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]),
  appVersion: z.string().min(1).max(32).optional(),
  deviceName: z.string().min(1).max(64).optional(),
}).strict();
export type ApiV1MobileDevice = z.infer<typeof apiV1MobileDeviceSchema>;

/**
 * 이메일·비밀번호 모바일 로그인 요청의 유일한 입력 경계입니다.
 * 이메일은 앞뒤 공백 제거 후 3~320자 이메일 형식, 비밀번호는 변형 없이 1~256자이며 계정·역할 주입을 거부합니다.
 */
export const apiV1MobileLoginInputSchema = z.object({
  email: z.string().trim().min(3).max(320).email(),
  password: z.string().min(1).max(256),
  device: apiV1MobileDeviceSchema.optional(),
}).strict();
export type ApiV1MobileLoginInput = z.infer<typeof apiV1MobileLoginInputSchema>;

/**
 * 모바일 세션 갱신 요청은 비어 있지 않은 불투명 refresh token 하나만 받습니다.
 * 클라이언트는 토큰 내부 구조를 해석하지 않으며 HTTP 계층의 본문 크기 제한은 별도로 적용합니다.
 */
export const apiV1MobileRefreshInputSchema = z.object({ refreshToken: z.string().min(1) }).strict();
export type ApiV1MobileRefreshInput = z.infer<typeof apiV1MobileRefreshInputSchema>;

/**
 * 모바일 단일 세션 로그아웃은 갱신과 동일한 토큰 입력 제약을 사용합니다.
 * 서버는 알 수 없거나 이미 폐기된 토큰도 204로 처리하며 사용자 ID 등 추가 키는 허용하지 않습니다.
 */
export const apiV1MobileLogoutInputSchema = apiV1MobileRefreshInputSchema.clone();
export type ApiV1MobileLogoutInput = z.infer<typeof apiV1MobileLogoutInputSchema>;

/**
 * 로그인·갱신 성공 시 모바일 클라이언트가 교체 저장하는 엄격한 세션 DTO입니다.
 * 두 토큰은 불투명한 비어 있지 않은 문자열이고 만료 시각은 기존 UTC 밀리초 계약을 재사용합니다.
 */
export const apiV1MobileSessionSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string().min(1),
  accessTokenExpiresAt: apiV1TimestampSchema,
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: apiV1TimestampSchema,
}).strict();
export type ApiV1MobileSession = z.infer<typeof apiV1MobileSessionSchema>;

/**
 * 모바일 로그인 성공 응답은 세션과 기존 본인 프로필의 공개 사용자 DTO만 제공합니다.
 * PENDING도 표현하지만 비밀번호 해시·세션 버전 등 내부 인증 필드는 기존 사용자 스키마로 차단합니다.
 */
export const apiV1MobileLoginResponseSchema = z.object({
  session: apiV1MobileSessionSchema,
  user: apiV1MeResponseSchema.shape.user,
}).strict();
export type ApiV1MobileLoginResponse = z.infer<typeof apiV1MobileLoginResponseSchema>;

/**
 * 모바일 갱신 성공 응답은 회전된 세션만 반환합니다.
 * 프로필이나 이전 토큰을 덧붙이지 않아 클라이언트가 두 토큰을 함께 교체하도록 경계를 고정합니다.
 */
export const apiV1MobileRefreshResponseSchema = z.object({ session: apiV1MobileSessionSchema }).strict();
export type ApiV1MobileRefreshResponse = z.infer<typeof apiV1MobileRefreshResponseSchema>;

/**
 * 모바일 인증의 429 응답은 기존 RATE_LIMITED 코드와 1~900초 재시도 값을 사용합니다.
 * 로그인 IP·이메일·조합 제한의 15분 창을 표현하며 60초 상한인 학사 오류와 분리합니다.
 */
export const apiV1MobileRateLimitedErrorSchema = z.object({
  error: z.object({
    code: z.literal("RATE_LIMITED"),
    message: z.string().min(1),
    requestId: apiV1UuidSchema,
    retryAfterSeconds: z.number().int().min(1).max(900),
  }).strict(),
}).strict();
export type ApiV1MobileRateLimitedError = z.infer<typeof apiV1MobileRateLimitedErrorSchema>;
