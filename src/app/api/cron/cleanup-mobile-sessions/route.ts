/**
 * 만료·회수된 모바일 세션과 종속 이력을 최대 1,000행씩 정리합니다.
 * CRON_SECRET으로 보호하며 자동 일정 등록은 운영 승인 전까지 하지 않습니다.
 */
import { timingSafeEqual } from "node:crypto";
import { purgeExpiredSessions } from "@/features/auth/mobile-session/service";
import { mobileAuthHeaders, mobileAuthResponse } from "@/features/auth/mobile-login/http";
import { MobileAuthError } from "@/features/auth/mobile-login/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return mobileAuthResponse(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new MobileAuthError("UNAVAILABLE");
    const supplied = request.headers.get("authorization");
    if (!supplied?.startsWith("Bearer ")) throw new MobileAuthError("UNAUTHENTICATED");
    const actual = Buffer.from(supplied.slice(7));
    const expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new MobileAuthError("UNAUTHENTICATED");
    // 첫 인자(시험 전용 시각)를 생략해 DB 시계로 만료를 판정한다. 앱 서버 시계 편차가 정리 대상에 영향을 주지 않는다.
    const deletedCount = await purgeExpiredSessions(undefined, 1000);
    return Response.json({ deletedCount }, { headers: mobileAuthHeaders });
  });
}
