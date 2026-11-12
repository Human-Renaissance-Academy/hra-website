/**
 * 공동 자료 API v1 Route(강의자료·주차별 텍스트·가이드북 파일)의 HTTP 공통 처리입니다.
 *
 * 역할:
 * - query·경로 UUID 입력을 인증·DB 접근 전에 검증합니다.
 * - Web 쿠키·모바일 Bearer 주체 해석은 Route 전용 `src/app/api/v1/resources/_lib/principal.ts`가 담당하고 여기에는 함수로 전달됩니다.
 * - 오류 원문 대신 공통 한국어 오류 봉투와 요청 ID, 비공개 무저장 캐시 헤더만 반환합니다.
 * - 사용자별 조회 빈도 제한(#444) 초과는 공통 봉투의 429 RATE_LIMITED 와 `Retry-After` 로 응답합니다.
 *
 * DB·Blob 접근과 역할 판단은 하지 않으며 Route는 이 모듈과 서비스만 호출합니다.
 */
import "server-only";

import {
  apiV1ResourceListQuerySchema,
  apiV1UuidSchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  type ApiV1ErrorCode,
  type ApiV1ResourceListQuery,
} from "@hra/contracts/api-v1";
import { RESOURCE_FILE_SECURITY_HEADERS, ResourceFileError } from "@/features/resources/file-download/service";
import { ResourceReadRateLimitError } from "@/features/resources/read-limit";
import type { MePrincipal } from "@/features/users/me/service";
import { logServerError } from "@/lib/errors";

/** JSON 응답 공통 헤더입니다. Web 쿠키와 모바일 Bearer를 모두 받으므로 두 헤더로 캐시를 구분합니다. */
export const RESOURCE_API_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } as const;

/** Route가 주입하는 현재 요청 주체 해석 함수입니다. 무인증이면 null입니다. */
export type ResourcePrincipalResolver = () => Promise<MePrincipal | null>;

const allowedListKeys = new Set(["page", "pageSize"]);

/** 중복·미지원 query와 SQL offset 범위를 저장소에 닿기 전에 거부합니다. */
export function parseResourceListQuery(request: Request): ApiV1ResourceListQuery | null {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowedListKeys.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const parsed = apiV1ResourceListQuerySchema.safeParse(values);
  if (!parsed.success) return null;
  const offset = (parsed.data.page - 1) * parsed.data.pageSize;
  return Number.isSafeInteger(offset) && offset <= 2_147_483_647 ? parsed.data : null;
}

/** 상세·파일 경로는 query를 받지 않고 표준 UUID 하나만 허용합니다. */
export async function parseResourceId(request: Request, params: Promise<{ id: string }>): Promise<string | null> {
  if (new URL(request.url).searchParams.size > 0) return null;
  const parsed = apiV1UuidSchema.safeParse((await params).id);
  return parsed.success ? parsed.data : null;
}

/** 오류 원문 대신 공통 한국어 문구와 추적 ID만 반환합니다. 파일 경로도 같은 sandbox 헤더를 붙입니다. */
export function resourceErrorResponse(code: ApiV1ErrorCode, requestId: string, file = false): Response {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: {
      ...RESOURCE_API_HEADERS,
      "X-Request-Id": requestId,
      ...(file ? RESOURCE_FILE_SECURITY_HEADERS : {}),
    },
  });
}

/**
 * 사용자별 조회 예산 초과를 공통 오류 봉투의 429 로 바꿉니다.
 * 본문 retryAfterSeconds 와 `Retry-After` 헤더에 같은 초 수를 넣고 기존 캐시·Vary·sandbox 헤더를 유지합니다.
 */
export function resourceRateLimitedResponse(error: ResourceReadRateLimitError, requestId: string, file = false): Response {
  return Response.json(
    toApiV1ErrorResponse({ code: "RATE_LIMITED", requestId, retryAfterSeconds: error.retryAfterSeconds }),
    {
      status: getApiV1ErrorHttpStatus("RATE_LIMITED"),
      headers: {
        ...RESOURCE_API_HEADERS,
        "X-Request-Id": requestId,
        "Retry-After": String(error.retryAfterSeconds),
        ...(file ? RESOURCE_FILE_SECURITY_HEADERS : {}),
      },
    },
  );
}

/** 성공 JSON 응답에 공통 캐시·추적 헤더를 붙입니다. */
export function resourceJsonResponse(body: unknown, requestId: string): Response {
  return Response.json(body, { headers: { ...RESOURCE_API_HEADERS, "X-Request-Id": requestId } });
}

/**
 * 세 파일 Route가 공유하는 처리 순서입니다: 입력 400 → 무세션 401 → 서비스(현재 역할 401/403 → 조회 빈도 429·대상 404) → 첨부 스트림.
 * 서비스의 고정 실패 외 공급자·설정·제한 저장소 오류는 원문·저장 위치 없이 503 UNAVAILABLE로 바꿉니다.
 */
export async function handleResourceFileRequest(
  request: Request,
  params: Promise<{ id: string }>,
  logScope: string,
  resolvePrincipal: ResourcePrincipalResolver,
  download: (principal: MePrincipal, id: string, signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const id = await parseResourceId(request, params);
    if (!id) return resourceErrorResponse("INVALID_INPUT", requestId, true);
    const principal = await resolvePrincipal();
    if (!principal) return resourceErrorResponse("UNAUTHENTICATED", requestId, true);
    const response = await download(principal, id, request.signal);
    response.headers.set("Vary", RESOURCE_API_HEADERS.Vary);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    if (error instanceof ResourceFileError) return resourceErrorResponse(error.code, requestId, true);
    if (error instanceof ResourceReadRateLimitError) return resourceRateLimitedResponse(error, requestId, true);
    // 공급자 오류에는 저장 위치·토큰이 담길 수 있으므로 원문 대신 고정 오류만 기록합니다.
    logServerError(logScope, new Error("RESOURCE_FILE_UNAVAILABLE"), { requestId });
    return resourceErrorResponse("UNAVAILABLE", requestId, true);
  }
}
