/**
 * 승인 회원의 강의자료 목록 메타데이터를 제공하는 API v1 연결 계층입니다.
 * query 입력과 Web 쿠키 또는 모바일 Bearer 주체를 확인하고 현재 역할·대상 인가·목록 조회는 Application Service에 맡깁니다.
 */
import {
  apiV1ClassMaterialListResponseSchema,
  toApiV1ClassMaterialSummary,
  toApiV1PageMeta,
} from "@hra/contracts/api-v1";
import { listClassMaterialsForMember } from "@/features/class-materials/member/service";
import { resolveResourcePrincipal, withResourcePrincipal } from "@/app/api/v1/resources/_lib/principal";
import {
  parseResourceListQuery,
  resourceErrorResponse,
  resourceJsonResponse,
  resourceRateLimitedResponse,
} from "@/features/resources/api-v1/http";
import { ResourceReadRateLimitError } from "@/features/resources/read-limit";
import { ResourcePaginationError } from "@/features/resources/reader";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 로그인과 현재 역할을 확인한 뒤 역할에 허용된 대상의 강의자료만 페이지 단위로 제공합니다. */
export async function GET(request: Request): Promise<Response> {
  return withResourcePrincipal(request, false, () => handleGet(request));
}

async function handleGet(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const input = parseResourceListQuery(request);
    if (!input) return resourceErrorResponse("INVALID_INPUT", requestId);
    const principal = await resolveResourcePrincipal();
    if (!principal) return resourceErrorResponse("UNAUTHENTICATED", requestId);

    const result = await listClassMaterialsForMember({ principal, page: input.page, pageSize: input.pageSize });
    if (result.kind === "unauthenticated") return resourceErrorResponse("UNAUTHENTICATED", requestId);
    if (result.kind === "forbidden") return resourceErrorResponse("FORBIDDEN", requestId);

    // 서비스 결과에 추가 열이 생겨도 계약 mapper가 허용 필드만 선택합니다.
    const body = apiV1ClassMaterialListResponseSchema.parse({
      classMaterials: result.items.map(toApiV1ClassMaterialSummary),
      page: toApiV1PageMeta({ page: input.page, pageSize: input.pageSize, totalCount: result.totalCount }),
    });
    return resourceJsonResponse(body, requestId);
  } catch (error) {
    // 사용자별 조회 예산 초과(#444)는 429와 Retry-After, 제한 저장소 장애는 아래 공통 503입니다(fail-closed).
    if (error instanceof ResourceReadRateLimitError) return resourceRateLimitedResponse(error, requestId);
    if (error instanceof ResourcePaginationError) return resourceErrorResponse("INVALID_INPUT", requestId);
    // 사용자 식별자·SQL·파일 URL은 추가 로그 문맥이나 오류 응답에 넣지 않습니다.
    logServerError("api-v1/resources/class-materials", error, { requestId });
    return resourceErrorResponse("UNAVAILABLE", requestId);
  }
}
