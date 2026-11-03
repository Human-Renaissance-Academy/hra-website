/**
 * 유효한 모바일 Bearer 주체의 모든 모바일 세션만 회수합니다.
 * 쿠키 대체 인증·사용자 ID 입력을 허용하지 않아 Web 세션과 권한 경계를 분리합니다.
 */
import { mergePrincipalVary, resolveBearer } from "@/lib/api-v1-principal";
import { revokeAllSessionsForUser } from "@/features/auth/mobile-session/service";
import { MobileAuthError } from "@/features/auth/mobile-login/errors";
import { assertNoQuery, mobileAuthHeaders, mobileAuthResponse } from "@/features/auth/mobile-login/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const response = await mobileAuthResponse(async () => {
    assertNoQuery(request);
    // Node HTTP는 빈 POST에도 스트림을 제공한다. 스트림 존재가 아니라 실제 바이트를 거부한다.
    const reader = request.body?.getReader();
    if (reader) {
      // 전체 검사에 하나의 기한을 적용해 빈 청크 반복도 기한을 연장하지 못하게 합니다.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MobileAuthError("INVALID_INPUT")), 3_000);
      });
      try {
        for (;;) {
          const chunk = await Promise.race([reader.read(), deadline]);
          if (chunk.done) break;
          if (chunk.value.byteLength > 0) throw new MobileAuthError("INVALID_INPUT");
        }
      } finally {
        clearTimeout(timer);
        // 취소는 정리 요청일 뿐 응답의 선행 조건이 아닙니다. 공급자의 취소 실패는
        // 이미 선택한 400/인증 결과를 바꾸지 않으며 입력 원문도 기록하지 않습니다.
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    const result = await resolveBearer(request);
    switch (result.kind) {
      case "NO_BEARER": case "INVALID_BEARER": throw new MobileAuthError("UNAUTHENTICATED");
      case "VALID":
        await revokeAllSessionsForUser(result.principal.userId);
        return new Response(null, { status: 204, headers: mobileAuthHeaders });
      default: return assertNever(result);
    }
  });
  return mergePrincipalVary(response);
}

function assertNever(value: never): never { throw value; }
