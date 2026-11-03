/**
 * 학사 API v1의 HTTP 입력과 공개 오류 변환을 담당합니다.
 * 기존 학사 서비스의 권한·상태 판단은 보존하고, 전송 계층에서만 공통 계약으로 변환합니다.
 */
import "server-only";

import {
  getApiV1ErrorHttpStatus,
  toApiV1ErrorResponse,
  type ApiV1ErrorCode,
} from "@hra/contracts/api-v1";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import { SubmissionFileAccessError } from "@/features/academics/submission-files/access";
import { SubmissionFinalizationError } from "@/features/academics/submissions/validation";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { logServerError } from "@/lib/errors";
import { isSameRequestOrigin } from "@/lib/request-origin";
import { revalidateMobilePrincipalOverride } from "@/lib/api-v1-principal";

/** 개인 결과와 오류가 공유 캐시나 다른 쿠키의 응답으로 재사용되지 않도록 합니다. */
export const academicApiHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

/** HTTP 입력 단계에서만 발생하는 공통 오류이며 내부 오류 원문은 보관하지 않습니다. */
export class AcademicApiHttpError extends Error {
  constructor(readonly code: ApiV1ErrorCode) {
    super(code);
    this.name = "AcademicApiHttpError";
  }
}

/** query를 지원하지 않는 단건 조회·명령에서 중복 키를 포함한 모든 query를 거부합니다. */
export function assertNoAcademicApiQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) throw new AcademicApiHttpError("INVALID_INPUT");
}

/** 실제 스트림 크기를 제한하여 누락·위조된 Content-Length로도 한도를 넘길 수 없게 합니다. */
async function readBoundedJson(request: Request): Promise<unknown> {
  assertNoAcademicApiQuery(request);
  const mediaType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json" || !request.body) throw new AcademicApiHttpError("INVALID_INPUT");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16 * 1024) throw new AcademicApiHttpError("TOO_LARGE");
      chunks.push(chunk.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AcademicApiHttpError("INVALID_INPUT");
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 취소 실패 원문을 노출하거나 이미 결정한 입력 오류를 다른 결과로 덮어쓰지 않습니다.
      logServerError("api-v1/academic/body-cancel", new Error("REQUEST_BODY_CANCEL_FAILED"));
    } finally {
      reader.releaseLock();
    }
  }
}

/** 쿠키로 인증하는 사용자 명령은 본문을 읽기 전부터 동일 Origin을 필수로 확인합니다. */
export async function readAcademicApiJson(request: Request): Promise<unknown> {
  const principal = await revalidateMobilePrincipalOverride();
  switch (principal.kind) {
    case "REVOKED": throw new AcademicApiHttpError("UNAUTHENTICATED");
    case "NO_OVERRIDE":
      if (!isSameRequestOrigin(request)) throw new AcademicApiHttpError("FORBIDDEN");
      break;
    case "VALID": break;
    default: { const exhaustive: never = principal; throw exhaustive; }
  }
  return readBoundedJson(request);
}

/**
 * SDK 토큰·서명 callback 전용 읽기입니다. 토큰 발급의 Origin은 기존 SDK 승인 함수가 검사합니다.
 * callback은 사용자 쿠키 대신 SDK 서명을 검증해야 하므로 이 함수 자체는 Origin을 요구하지 않습니다.
 */
export async function readAcademicApiProtocolJson(request: Request): Promise<unknown> {
  return readBoundedJson(request);
}

/** 기존 오류의 HTTP 상태나 문구를 복사하지 않고, 검증된 코드만 v1 계약으로 대응합니다. */
function publicErrorCode(error: unknown): ApiV1ErrorCode {
  if (error instanceof AcademicApiHttpError || error instanceof AcademicAccessError ||
      error instanceof SubmissionFileAccessError) return error.code;
  if (error instanceof AcademicUploadError) {
    switch (error.code) {
      case "INVALID_FILE": return "INVALID_INPUT";
      case "EXPIRED":
      case "NOT_READY": return "CONFLICT";
      case "UNAVAILABLE": return "STORAGE_UNAVAILABLE";
      default: return error.code;
    }
  }
  if (error instanceof SubmissionFinalizationError) {
    switch (error.code) {
      // 기존 서비스가 감추는 소유권 거부는 v1에서도 없는 제출과 구분하지 않습니다.
      case "FORBIDDEN": return "NOT_FOUND";
      case "EXPIRED":
      case "NOT_READY":
      case "DEADLINE": return "CONFLICT";
      default: return error.code;
    }
  }
  return "UNAVAILABLE";
}

/** 모든 실패는 고정 한국어 문구·추적 ID만 반환하고 요청 예산의 재시도 시간을 보존합니다. */
export function academicApiErrorResponse(error: unknown, requestId: string): Response {
  const code = publicErrorCode(error);
  const retryAfterSeconds = error instanceof AcademicUploadError && error.code === "RATE_LIMITED"
    ? error.retryAfterSeconds : undefined;
  if (code === "UNAVAILABLE" || code === "STORAGE_UNAVAILABLE") {
    // 원래 오류에는 SQL·파일명·Blob URL이 있을 수 있어 고정 오류와 요청 ID만 기록합니다.
    logServerError("api-v1/academic", new Error("ACADEMIC_API_UNAVAILABLE"), { requestId });
  }
  return Response.json(toApiV1ErrorResponse({ code, requestId, retryAfterSeconds }), {
    status: getApiV1ErrorHttpStatus(code),
    headers: {
      ...academicApiHeaders,
      "X-Request-Id": requestId,
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
  });
}
