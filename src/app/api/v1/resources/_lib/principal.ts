/**
 * 공동 자료 API v1 Route 전용 이중 인증(Web 쿠키·모바일 Bearer) 연결입니다.
 *
 * - `withApiV1Principal`로 Authorization 헤더를 먼저 해석합니다. 헤더가 있으면 쿠키로 대체하지 않으며
 *   형식 오류·만료·회수는 401, 세션 저장소 장애는 503입니다. 모든 응답의 Vary에 Cookie·Authorization을 병합합니다.
 * - 서비스 주체는 매 요청 모바일 세션을 다시 검증한 신원(`freshMobilePrincipalIdentity`) 또는 Auth.js 세션입니다.
 * - 모바일 브리지는 `src/app/api/v1/**`에서만 import하도록 제한되므로 기능 모듈이 아닌 이 Route 전용 폴더에 둡니다.
 *   (`_lib`는 Next private folder라 경로로 노출되지 않습니다.)
 */
import "server-only";

import { resourceErrorResponse } from "@/features/resources/api-v1/http";
import type { MePrincipal } from "@/features/users/me/service";
import { freshMobilePrincipalIdentity, withApiV1Principal } from "@/lib/api-v1-principal";
import { auth } from "@/lib/auth";

/** 회수된 모바일 세션(null)은 쿠키로 되돌아가지 않고 무인증으로 끝냅니다. */
export async function resolveResourcePrincipal(): Promise<MePrincipal | null> {
  const mobile = await freshMobilePrincipalIdentity();
  const user = mobile === undefined ? (await auth())?.user : mobile;
  return user ? { userId: user.id, role: user.role } : null;
}

/** Bearer 해석 실패는 각 경로와 같은 공통 오류 봉투(파일 경로는 sandbox 헤더 포함)로 변환합니다. */
export function withResourcePrincipal(request: Request, file: boolean, handler: () => Promise<Response>): Promise<Response> {
  return withApiV1Principal(request, handler, (code) => resourceErrorResponse(code, crypto.randomUUID(), file));
}
