/**
 * Auth.js Web 세션으로 본인 프로필만 제공하는 API v1 연결 계층입니다.
 * Proxy의 화면 접근 검사에 의존하지 않고 세션을 재확인하며, 현재 사용자 조회는 서비스에 맡깁니다.
 */
import { toApiV1ErrorResponse, toApiV1MeResponse, getApiV1ErrorHttpStatus } from "@hra/contracts/api-v1";
import { getCurrentProfile } from "@/features/users/me/service";
import { auth } from "@/lib/auth";
import { freshMobilePrincipalIdentity, withApiV1Principal } from "@/lib/api-v1-principal";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

/** 세션·입력·저장소 실패를 SQL·쿠키·개인정보 없는 고정 응답으로 구분합니다. */
function errorResponse(code: "INVALID_INPUT" | "UNAUTHENTICATED" | "UNAVAILABLE", requestId: string) {
  return Response.json(toApiV1ErrorResponse({ code, requestId }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: responseHeaders,
  });
}

/** PENDING도 본인 프로필만 읽을 수 있으며 자료실 권한은 여기서 부여하지 않습니다. */
export async function GET(request: Request): Promise<Response> {
  return withApiV1Principal(request, () => handleGet(request), (code) => errorResponse(code, crypto.randomUUID()));
}

async function handleGet(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    if (new URL(request.url).searchParams.size > 0) return errorResponse("INVALID_INPUT", requestId);

    const mobile = await freshMobilePrincipalIdentity();
    const user = mobile === undefined ? (await auth())?.user : mobile;
    // JWT 콜백은 계정 삭제·버전 불일치·일부 DB 오류를 무세션으로 끝낼 수 있어 모두 실패 차단합니다.
    if (!user) return errorResponse("UNAUTHENTICATED", requestId);

    const profile = await getCurrentProfile({ userId: user.id, role: user.role });
    if (!profile) return errorResponse("UNAUTHENTICATED", requestId);

    return Response.json(toApiV1MeResponse(profile), { headers: responseHeaders });
  } catch (error) {
    // 세션·프로필 오류 원문과 사용자 식별자는 공개 응답이나 추가 로그 문맥에 남기지 않습니다.
    logServerError("api-v1/me", error, { requestId });
    return errorResponse("UNAVAILABLE", requestId);
  }
}
