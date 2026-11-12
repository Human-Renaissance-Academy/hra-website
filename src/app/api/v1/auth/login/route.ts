/**
 * 모바일 비밀번호 로그인 HTTP 어댑터입니다.
 * 계약 파싱과 IP 추출만 담당하고 인증·예약 정책은 서비스에 위임합니다.
 */
import { apiV1MobileLoginInputSchema, apiV1MobileLoginResponseSchema } from "@hra/contracts/api-v1";
import { extractClientIp } from "@/lib/rate-limit-core";
import { loginWithPassword } from "@/features/auth/mobile-login/service";
import { mobileAuthHeaders, mobileAuthResponse, readMobileJson } from "@/features/auth/mobile-login/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return mobileAuthResponse(async () => {
    const input = await readMobileJson(request, apiV1MobileLoginInputSchema);
    const result = await loginWithPassword(input, extractClientIp(request.headers));
    return Response.json(apiV1MobileLoginResponseSchema.parse(result), { headers: mobileAuthHeaders });
  });
}
