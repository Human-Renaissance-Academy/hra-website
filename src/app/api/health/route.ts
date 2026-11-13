/**
 * 공개 가용성 점검과 인증된 운영자용 상세 상태 응답을 제공합니다.
 * 익명 응답에는 가용 상태만 담고, 런타임 정보는 비밀값 인증 후 반환합니다.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/**
 * 요청 헤더의 health check secret 이 서버 환경변수와 일치하는지 timing-safe 하게 비교 (#73)
 *
 * 왜 timingSafeEqual 인가:
 *   `===` 비교는 문자열 길이에 비례하는 시간 차이를 만들어 이론상 timing attack 이 가능하다.
 *   secret 은 사전에 등록된 랜덤 문자열이므로 실전 공격 난이도는 매우 높지만, defense-in-depth 로
 *   상수시간 비교를 사용한다. timingSafeEqual 은 두 버퍼 길이가 다르면 예외를 던지므로,
 *   호출 전 길이 사전 검사가 필수 (인증 실패로 처리).
 *
 * 반환값 규칙:
 *   - 환경변수가 미설정/빈문자열 이면 항상 false (secret 인증 비활성화 상태로 간주)
 *   - 헤더가 없거나 길이가 다르면 false
 *   - 그 외에는 상수시간 바이트 비교 결과 반환
 */
function isAuthorizedForDetails(providedSecret: string | null): boolean {
  const expectedSecret = process.env.HEALTH_CHECK_SECRET;
  if (!expectedSecret || !providedSecret) return false;

  const providedBuf = Buffer.from(providedSecret);
  const expectedBuf = Buffer.from(expectedSecret);
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Health check endpoint
 *
 * 응답 정책 (#73 정찰 대응):
 *   - 익명 요청: HTTP status (200/503) + `{ status: "ok" | "error" }` 만 반환.
 *     Vercel/UptimeRobot 등 일반 모니터는 status code 로 충분히 동작한다.
 *   - `x-health-check-secret` 헤더 값이 서버 HEALTH_CHECK_SECRET 환경변수와 일치하는 요청:
 *     database 상태, 실행 중인 Node.js major, timestamp 를 포함한 상세 응답. 운영자가 장애 원인을 빠르게 파악 가능.
 *
 * 목적: DB 장애 시점 등 인프라 상태가 외부 정찰에 사용되지 않도록 하되,
 *   secret 을 아는 운영자는 기존 상세 정보를 그대로 얻을 수 있게 한다.
 */
export async function GET(request: Request) {
  let dbStatus = "not_checked";
  let status = "ok";
  let httpStatus = 200;

  if (!process.env.DATABASE_URL) {
    dbStatus = "unavailable";
    status = "error";
    httpStatus = 503;
  } else {
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch (error) {
      logServerError("api/health/db", error);
      dbStatus = "unavailable";
      status = "error";
      httpStatus = 503;
    }
  }

  const providedSecret = request.headers.get("x-health-check-secret");
  if (isAuthorizedForDetails(providedSecret)) {
    return NextResponse.json(
      {
        status,
        database: dbStatus,
        // 운영자가 배포 런타임의 실제 Node LTS major를 확인하는 용도 (#294).
        // 상세 요청 인증에 성공한 경우에만 반환하고 공개 스모크 응답은 변경하지 않습니다.
        nodeMajor: Number(process.versions.node.split(".")[0]),
        timestamp: new Date().toISOString(),
      },
      { status: httpStatus },
    );
  }

  return NextResponse.json({ status }, { status: httpStatus });
}
