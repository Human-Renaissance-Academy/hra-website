/**
 * 승인 회원의 강의자료 상세 메타데이터를 제공하는 API v1 연결 계층입니다.
 * UUID/query 입력과 Web 쿠키 또는 모바일 Bearer 주체를 확인하고 현재 역할·대상 인가·조회는 Application Service에 맡깁니다.
 * 허용 대상이 아닌 자료(MEMBER의 교수용 자료)는 없는 자료와 같은 404입니다.
 */
import { toApiV1ClassMaterialDetailResponse } from "@hra/contracts/api-v1";
import { getClassMaterialForMember } from "@/features/class-materials/member/service";
import { resolveResourcePrincipal, withResourcePrincipal } from "@/app/api/v1/resources/_lib/principal";
import {
  parseResourceId,
  resourceErrorResponse,
  resourceJsonResponse,
} from "@/features/resources/api-v1/http";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withResourcePrincipal(request, false, () => handleGet(request, context.params));
}

async function handleGet(request: Request, params: Promise<{ id: string }>): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const id = await parseResourceId(request, params);
    if (!id) return resourceErrorResponse("INVALID_INPUT", requestId);
    const principal = await resolveResourcePrincipal();
    if (!principal) return resourceErrorResponse("UNAUTHENTICATED", requestId);

    const result = await getClassMaterialForMember(principal, id);
    if (result.kind === "unauthenticated") return resourceErrorResponse("UNAUTHENTICATED", requestId);
    if (result.kind === "forbidden") return resourceErrorResponse("FORBIDDEN", requestId);
    if (result.kind === "not_found") return resourceErrorResponse("NOT_FOUND", requestId);
    return resourceJsonResponse(toApiV1ClassMaterialDetailResponse(result.item), requestId);
  } catch (error) {
    logServerError("api-v1/resources/class-materials/detail", error, { requestId });
    return resourceErrorResponse("UNAVAILABLE", requestId);
  }
}
