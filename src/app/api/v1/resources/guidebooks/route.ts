/**
 * 승인 회원의 가이드북 목록 메타데이터를 제공하는 API v1 연결 계층입니다.
 * Web 세션과 URL 입력을 확인하고 현재 역할·목록 조회는 Application Service에 맡깁니다.
 */
import {
  apiV1GuidebookListQuerySchema,
  apiV1GuidebookListResponseSchema,
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  toApiV1GuidebookSummary,
  toApiV1PageMeta,
} from "@hra/contracts/api-v1";
import { GuidebookPaginationError, listGuidebooksForMember } from "@/features/guidebooks/member-list/service";
import { auth } from "@/lib/auth";
import { freshMobilePrincipalIdentity, withApiV1Principal } from "@/lib/api-v1-principal";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedQueryKeys = new Set(["page", "pageSize"]);
const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

/** 중복·미지원 query와 SQL offset 범위를 저장소에 닿기 전에 거부합니다. */
function parseQuery(request: Request) {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowedQueryKeys.has(key) || Object.hasOwn(values, key)) return null;
    values[key] = value;
  }
  const parsed = apiV1GuidebookListQuerySchema.safeParse(values);
  if (!parsed.success) return null;
  const offset = (parsed.data.page - 1) * parsed.data.pageSize;
  return Number.isSafeInteger(offset) && offset <= 2_147_483_647 ? parsed.data : null;
}

/** 오류 원문 대신 공통 한국어 문구와 추적 ID만 반환합니다. */
function errorResponse(code: "INVALID_INPUT" | "UNAUTHENTICATED" | "FORBIDDEN" | "UNAVAILABLE", requestId: string) {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: responseHeaders,
  });
}

/** 로그인과 현재 역할을 확인한 뒤 가이드북 ID·제목만 페이지 단위로 제공합니다. */
export async function GET(request: Request): Promise<Response> {
  return withApiV1Principal(request, () => handleGet(request), (code) => errorResponse(code, crypto.randomUUID()));
}

async function handleGet(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const input = parseQuery(request);
    if (!input) return errorResponse("INVALID_INPUT", requestId);

    const mobile = await freshMobilePrincipalIdentity();
    const user = mobile === undefined ? (await auth())?.user : mobile;
    if (!user) return errorResponse("UNAUTHENTICATED", requestId);

    const result = await listGuidebooksForMember({
      principal: { userId: user.id, role: user.role },
      page: input.page,
      pageSize: input.pageSize,
    });
    if (result.kind === "unauthenticated") return errorResponse("UNAUTHENTICATED", requestId);
    if (result.kind === "forbidden") return errorResponse("FORBIDDEN", requestId);

    // Repository의 내부 정렬 시각이나 Blob 정보를 DTO에 실수로 전달하지 않습니다.
    const body = apiV1GuidebookListResponseSchema.parse({
      guidebooks: result.items.map(toApiV1GuidebookSummary),
      page: toApiV1PageMeta({ page: input.page, pageSize: input.pageSize, totalCount: result.totalCount }),
    });
    return Response.json(body, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof GuidebookPaginationError) return errorResponse("INVALID_INPUT", requestId);
    // 사용자 식별자·SQL·파일 URL은 추가 로그 문맥이나 오류 응답에 넣지 않습니다.
    logServerError("api-v1/resources/guidebooks", error, { requestId });
    return errorResponse("UNAVAILABLE", requestId);
  }
}
