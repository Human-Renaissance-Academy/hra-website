/**
 * 승인 회원의 주차별 텍스트 상세(Markdown 본문·첨부 표시명)를 제공하는 API v1 연결 계층입니다.
 * UUID/query 입력과 Web 쿠키 또는 모바일 Bearer 주체를 확인하고 현재 역할·조회는 Application Service에 맡깁니다.
 * 첨부 사진과 원본 파일 URL은 반환하지 않으며 첨부 원본은 `/file` 경로에서만 서버가 전달합니다.
 */
import { toApiV1WeeklyTextDetailResponse } from "@hra/contracts/api-v1";
import { resolveResourcePrincipal, withResourcePrincipal } from "@/app/api/v1/resources/_lib/principal";
import {
  parseResourceId,
  resourceErrorResponse,
  resourceJsonResponse,
  resourceRateLimitedResponse,
} from "@/features/resources/api-v1/http";
import { ResourceReadRateLimitError } from "@/features/resources/read-limit";
import { getWeeklyTextForMember } from "@/features/weekly-texts/member/service";
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

    const result = await getWeeklyTextForMember(principal, id);
    if (result.kind === "unauthenticated") return resourceErrorResponse("UNAUTHENTICATED", requestId);
    if (result.kind === "forbidden") return resourceErrorResponse("FORBIDDEN", requestId);
    if (result.kind === "not_found") return resourceErrorResponse("NOT_FOUND", requestId);
    return resourceJsonResponse(toApiV1WeeklyTextDetailResponse(result.item), requestId);
  } catch (error) {
    // 사용자별 조회 예산 초과(#444)는 429와 Retry-After, 제한 저장소 장애는 아래 공통 503입니다(fail-closed).
    if (error instanceof ResourceReadRateLimitError) return resourceRateLimitedResponse(error, requestId);
    logServerError("api-v1/resources/weekly-texts/detail", error, { requestId });
    return resourceErrorResponse("UNAVAILABLE", requestId);
  }
}
