/**
 * 모바일 단일 세션 회수 HTTP 어댑터입니다.
 * 잘 구성된 요청이면 토큰의 존재·회수 여부를 공개하지 않고 204를 반환합니다. IP 예산 소진은 429입니다.
 */
import { apiV1MobileLogoutInputSchema } from "@hra/contracts/api-v1";
import { extractClientIp } from "@/lib/rate-limit-core";
import { logoutMobileSession } from "@/features/auth/mobile-login/service";
import { mobileAuthHeaders, mobileAuthResponse, readMobileJson } from "@/features/auth/mobile-login/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return mobileAuthResponse(async () => {
    const input = await readMobileJson(request, apiV1MobileLogoutInputSchema);
    await logoutMobileSession(input, extractClientIp(request.headers));
    return new Response(null, { status: 204, headers: mobileAuthHeaders });
  });
}
