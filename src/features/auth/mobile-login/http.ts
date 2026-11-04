/**
 * 모바일 인증 전용 HTTP 입력·응답 경계입니다.
 * 쿠키·Origin을 읽지 않으며 실제 스트림을 16 KiB로 제한하고 고정 계약 오류만 내보냅니다.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod/v4";
import { getApiV1ErrorHttpStatus, toApiV1ErrorResponse } from "@hra/contracts/api-v1";
import { logServerError } from "@/lib/errors";
import { MobileSessionCreationError } from "@/features/auth/mobile-session/types";
import { MobileAuthError } from "./errors";
import { MOBILE_AUTH_BODY_LIMIT } from "./policy";

export const mobileAuthHeaders = { "Cache-Control": "private, no-store", Vary: "Authorization" } as const;

/** 본문·질의가 없는 명령을 엄격하게 구분합니다. */
export function assertNoQuery(request: Request): void {
  if (new URL(request.url).search.length > 0) throw new MobileAuthError("INVALID_INPUT");
}

/** 미지원 미디어 타입은 계약의 400으로 통일하며 Content-Length를 신뢰하지 않습니다. */
export async function readMobileJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  assertNoQuery(request);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" || !request.body) throw new MobileAuthError("INVALID_INPUT");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MOBILE_AUTH_BODY_LIMIT) throw new MobileAuthError("TOO_LARGE");
      chunks.push(chunk.value);
    }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = schema.safeParse(parsed);
    if (!result.success) throw new MobileAuthError("INVALID_INPUT");
    return result.data;
  } catch (error) {
    if (error instanceof MobileAuthError) throw error;
    // 네트워크 스트림·JSON 오류 모두 요청 입력 오류이며 원문은 보관하지 않습니다.
    throw new MobileAuthError("INVALID_INPUT");
  } finally {
    try { await reader.cancel(); }
    catch { logServerError("mobile-auth/body-cancel", null); }
    finally { reader.releaseLock(); }
  }
}

/** 모든 성공·실패에 동일한 캐시 정책을 적용하고 예외 입력을 logger에도 넘기지 않습니다. */
export async function mobileAuthResponse(handler: () => Promise<Response>): Promise<Response> {
  try { return await handler(); }
  catch (error) {
    const requestId = randomUUID();
    const publicError = error instanceof MobileAuthError ? error
      : new MobileAuthError(error instanceof MobileSessionCreationError ? "UNAUTHENTICATED" : "UNAVAILABLE");
    if (publicError.code === "UNAVAILABLE") logServerError("mobile-auth/unavailable", null, { requestId });
    return Response.json(toApiV1ErrorResponse({ code: publicError.code, requestId, retryAfterSeconds: publicError.retryAfterSeconds }), {
      status: getApiV1ErrorHttpStatus(publicError.code),
      headers: { ...mobileAuthHeaders, "X-Request-Id": requestId,
        ...(publicError.retryAfterSeconds ? { "Retry-After": String(publicError.retryAfterSeconds) } : {}) },
    });
  }
}
