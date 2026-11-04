/**
 * 공동 자료 API v1 Route(강의자료·주차별 텍스트·가이드북 파일)의 HTTP 공통 처리입니다.
 *
 * 역할:
 * - query·경로 UUID 입력을 인증·DB 접근 전에 검증합니다.
 * - Web 세션을 Application Service 주체로 변환합니다. 모바일 Bearer(#273)가 병합되면 이 한 곳에서 연결합니다.
 * - 오류 원문 대신 공통 한국어 오류 봉투와 요청 ID, 비공개 무저장 캐시 헤더만 반환합니다.
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
import type { MePrincipal } from "@/features/users/me/service";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";

/** JSON 응답 공통 헤더입니다. 현재는 Web 쿠키 세션만 인증 수단이므로 Cookie로 캐시를 구분합니다. */
export const RESOURCE_API_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" } as const;

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

/** 현재 Web 세션의 사용자 ID·역할만 서비스 주체로 넘깁니다. 현재 계정 대조는 서비스가 수행합니다. */
export async function currentResourcePrincipal(): Promise<MePrincipal | null> {
  const session = await auth();
  if (!session?.user) return null;
  return { userId: session.user.id, role: session.user.role };
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

/** 성공 JSON 응답에 공통 캐시·추적 헤더를 붙입니다. */
export function resourceJsonResponse(body: unknown, requestId: string): Response {
  return Response.json(body, { headers: { ...RESOURCE_API_HEADERS, "X-Request-Id": requestId } });
}

/**
 * 세 파일 Route가 공유하는 처리 순서입니다: 입력 400 → 무세션 401 → 서비스(현재 역할 401/403·대상 404) → 첨부 스트림.
 * 서비스의 고정 실패 외 공급자·설정 오류는 원문·저장 위치 없이 503 UNAVAILABLE로 바꿉니다.
 */
export async function handleResourceFileRequest(
  request: Request,
  params: Promise<{ id: string }>,
  logScope: string,
  download: (principal: MePrincipal, id: string, signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const id = await parseResourceId(request, params);
    if (!id) return resourceErrorResponse("INVALID_INPUT", requestId, true);
    const principal = await currentResourcePrincipal();
    if (!principal) return resourceErrorResponse("UNAUTHENTICATED", requestId, true);
    const response = await download(principal, id, request.signal);
    response.headers.set("Vary", RESOURCE_API_HEADERS.Vary);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (error) {
    if (error instanceof ResourceFileError) return resourceErrorResponse(error.code, requestId, true);
    // 공급자 오류에는 저장 위치·토큰이 담길 수 있으므로 원문 대신 고정 오류만 기록합니다.
    logServerError(logScope, new Error("RESOURCE_FILE_UNAVAILABLE"), { requestId });
    return resourceErrorResponse("UNAVAILABLE", requestId, true);
  }
}
