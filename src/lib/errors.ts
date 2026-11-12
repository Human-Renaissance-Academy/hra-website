/**
 * 서버 에러 로깅의 허용 필드 정책 (#70, #369)
 *
 * 배경:
 *   Drizzle·Markdown·Blob 오류의 message에는 SQL이나 사용자 입력이 섞일 수 있다.
 *   중앙 logger는 원문을 정제해 출력하는 대신 scope와 검증된 식별자·원인 코드만 기록한다.
 *
 * 사용 원칙:
 *   1. server-side 경로에서만 사용한다 (server actions, API routes, middleware,
 *      server components). 여기서 발생한 로그는 Vercel Logs 로 전송된다.
 *   2. client 컴포넌트("use client") 의 console.error 는 브라우저 콘솔에만 남으므로
 *      본 헬퍼로 감쌀 필요가 없다.
 *   3. 사용자에게 반환하는 메시지는 이 헬퍼 결과가 아닌, 별도의 사용자 친화 문자열을
 *      사용한다 (예: "저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.").
 *   4. context는 logger가 UUID·enum·count·boolean 허용 목록으로 새로 구성한다.
 *      URL·filename·slug·임의 입력은 기록하지 않는다.
 *
 * 참고 (기존 exemplar):
 *   - `src/features/applications/actions/submissions.ts:414-436, 527-546` 는 audit
 *     로그의 식별자 최소화 패턴 (#56) 을 확립했으나 `error` 필드 자체는 raw 였다.
 *     본 helper 로 통일한다.
 */

// ── logServerError ──────────────────────────────────────────────────────────

// 서버 로그는 키뿐 아니라 값도 고정 집합으로 검증한다. 입력 객체를 펼치거나 직렬화하지 않는다.
const LOG_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOG_SCOPE_PATTERN = /^[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,3}$/;
const LOG_ID_KEYS = ["id", "eventId", "galleryId", "cohortId", "formId", "submissionId", "adminUserId", "userId", "requestId", "resourceId", "actorUserId", "correlationId", "sessionId"] as const;
const LOG_COUNT_KEYS = ["count", "candidateCount", "expected", "actual", "orderedIdsCount", "issueCount", "oldImageCount", "newImageCount", "questionCount", "sessionCount", "retryCount"] as const;
const LOG_FLAG_KEYS = ["active", "published", "isPublished", "hasBody", "hasCohortId", "hasFile", "hasImages", "hasNewFile", "hasNewImages", "hasReportCategory", "hasUploadedBlob"] as const;
const LOG_SQL_STATES = new Set(["22023", "22P02", "23502", "23503", "23505", "23514", "40001", "40P01", "42501", "42P01", "42703", "P0001", "XX000", "HRA01", "HRA02", "HRA03", "HRA04", "HRA05", "HRA06", "HRA07", "HRA08", "HRA09"]);
const LOG_ENUMS: Record<string, ReadonlySet<string>> = {
  audience: new Set(["FACULTY", "STUDENT"]),
  textType: new Set(["고전명작", "경영서", "기업실무"]),
  category: new Set(["template", "guide", "CLASSICS", "BUSINESS", "LECTURE", "ENGLISH", "SPEECH", "SPECIAL_LECTURE", "CASE_STUDY"]),
  role: new Set(["ADMIN", "FACULTY", "MEMBER", "PENDING"]),
  kind: new Set(["report", "guide", "template"]),
  action: new Set(["ENROLLMENT_LINK", "STUDENT_REGISTER", "ASSIGNMENT_CREATE", "ASSIGNMENT_UPDATE", "ASSIGNMENT_PUBLISH", "ASSIGNMENT_CLOSE", "ASSIGNMENT_LIST", "UPLOAD_INTENT", "UPLOAD_TOKEN", "UPLOAD_VERIFY", "UPLOAD_CANCEL", "UPLOAD_RECEIPT", "SUBMISSION_FINALIZE", "FILE_READ", "UPLOAD_CLEANUP", "HEALTH_READ"]),
  resourceType: new Set(["ENROLLMENT_BATCH", "STUDENT", "ASSIGNMENT", "UPLOAD_INTENT", "SUBMISSION", "SUBMISSION_FILE", "HEALTH"]),
  outcome: new Set(["AUTHORIZED", "DENIED", "FAILED", "COMPLETED", "REPLAYED", "STREAM_INTERRUPTED", "RETRY", "EXPIRED", "CANCELLED", "SKIPPED"]),
  failureCode: new Set(["AUTHORIZATION", "INPUT", "GATE", "CONFLICT", "STORAGE", "STREAM", "NOT_READY", "UNKNOWN"]),
};

/** getter·Proxy·toJSON을 실행하지 않고 지정한 자체 데이터 필드만 읽는다. */
function ownLogValue(input: unknown, key: string): unknown {
  try {
    if (typeof input !== "object" || input === null) return undefined;
    return Object.getOwnPropertyDescriptor(input, key)?.value;
  } catch {
    return undefined;
  }
}

/** 원본 오류의 message/name/stack은 읽지 않는다. 검증된 SQLSTATE만 최대 세 단계의 cause에서 찾는다. */
function loggedSqlState(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 3; depth++) {
    const code = ownLogValue(current, "code");
    if (typeof code === "string" && LOG_SQL_STATES.has(code)) return code;
    current = ownLogValue(current, "cause");
  }
  return undefined;
}

/** 호출자가 전달한 객체를 복사하지 않고 허용된 키·값만 새 레코드에 기록한다. */
function safeLogContext(context: unknown): Record<string, string | number | boolean | null> | undefined {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const key of LOG_ID_KEYS) {
    const value = ownLogValue(context, key);
    if (typeof value === "string" && LOG_UUID_PATTERN.test(value)) safe[key] = value.toLowerCase();
    else if (value === null) safe[key] = null;
  }
  for (const key of LOG_COUNT_KEYS) {
    const value = ownLogValue(context, key);
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000) safe[key] = value;
    else if (key === "retryCount" && value === null) safe.retryCount = null;
  }
  for (const key of LOG_FLAG_KEYS) {
    const value = ownLogValue(context, key);
    if (typeof value === "boolean") safe[key] = value;
  }
  for (const [key, allowed] of Object.entries(LOG_ENUMS)) {
    const value = ownLogValue(context, key);
    if (typeof value === "string" && allowed.has(value)) safe[key] = value;
    else if (value === null && (key === "failureCode" || key === "textType")) safe[key] = null;
  }
  const state = ownLogValue(context, "sqlState");
  if (typeof state === "string" && LOG_SQL_STATES.has(state)) safe.sqlState = state;
  else if (state === null) safe.sqlState = null;
  if (ownLogValue(context, "schemaVersion") === 1) safe.schemaVersion = 1;
  return Object.keys(safe).length ? safe : undefined;
}

/**
 * 서버 로그 통일 포맷.
 *
 * @param scope - 로그 태그. `domain/action` 형태의 kebab-case 권장 (예: "class-materials/create").
 * @param error - 원본 객체. message/name/stack/cause를 출력하지 않고 SQLSTATE만 검증한다.
 * @param context - 허용 목록의 UUID·enum·count·boolean만 새 객체로 옮긴다.
 *
 * 출력 예시:
 *   [class-materials/create] {
 *     context: { requestId: "uuid...", candidateCount: 3 },
 *     error: { kind: "DATABASE", sqlState: "23505" }
 *   }
 */
export function logServerError(
  scope: string,
  error: unknown,
  context?: Record<string, string | number | boolean | null>,
): void {
  const safeScope = typeof scope === "string" && scope.length <= 80 && LOG_SCOPE_PATTERN.test(scope) ? scope : "invalid-scope";
  const safeContext = safeLogContext(context);
  const sqlState = loggedSqlState(error);
  let kind: "DATABASE" | "ERROR" | "NON_ERROR" = sqlState ? "DATABASE" : "NON_ERROR";
  if (!sqlState) {
    try { if (error instanceof Error) kind = "ERROR"; }
    catch { kind = "NON_ERROR"; }
  }
  try {
    console.error(`[${safeScope}]`, {
      ...(safeContext ? { context: safeContext } : {}),
      error: { kind, ...(sqlState ? { sqlState } : {}) },
    });
  } catch {
    // 로그 전송 실패가 서버의 원래 오류 처리 경로를 다시 실패시키지 않게 한다.
    return;
  }
}
