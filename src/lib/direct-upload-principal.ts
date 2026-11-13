/**
 * 직접 업로드의 토큰 콜백에서만 사용하는 HTTP 출처·웹 세션 어댑터입니다.
 * 서명 검증 후 완료 콜백에는 호출하지 않으며 종류별 추가 인가는 호출자가 유지합니다.
 */
import "server-only";
import { auth } from "@/lib/auth";
import { isSameRequestOrigin } from "@/lib/request-origin";

export type DirectUploadPrincipal = { userId: string; role: string };

/** 출처를 먼저 거부하고 세션을 읽은 뒤 허용 역할의 주체만 반환합니다. */
export async function requireDirectUploadPrincipal(
  request: Request,
  allowedRoles: readonly string[],
): Promise<DirectUploadPrincipal> {
  const origin = request.headers.get("origin");
  if (origin && !isSameRequestOrigin(request)) throw new Error("허용되지 않은 요청입니다.");
  const session = await auth();
  if (!session?.user?.id || !allowedRoles.includes(session.user.role))
    throw new Error("업로드 권한이 없습니다.");
  return { userId: session.user.id, role: session.user.role };
}
