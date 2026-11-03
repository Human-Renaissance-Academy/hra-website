/**
 * 모바일 토큰 갱신 HTTP 어댑터입니다.
 * 실패 사유를 응답으로 노출하지 않으며 쿠키나 Origin에 의존하지 않습니다.
 */
import { apiV1MobileRefreshInputSchema, apiV1MobileRefreshResponseSchema } from "@hra/contracts/api-v1";
import { extractClientIp } from "@/lib/rate-limit-core";
import { refreshMobileSession } from "@/features/auth/mobile-login/service";
import { mobileAuthHeaders, mobileAuthResponse, readMobileJson } from "@/features/auth/mobile-login/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return mobileAuthResponse(async () => {
    const input = await readMobileJson(request, apiV1MobileRefreshInputSchema);
    const result = await refreshMobileSession(input, extractClientIp(request.headers));
    return Response.json(apiV1MobileRefreshResponseSchema.parse(result), { headers: mobileAuthHeaders });
  });
}
