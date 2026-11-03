// @vitest-environment node
/**
 * 학사 API의 실제 HTTP 입력 한도와 기존 서비스 오류→공통 계약 변환을 검증합니다.
 * 쿠키 명령의 출처 검사와 SDK 서명 callback용 입력 경계를 분리해 확인합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  assertNoAcademicApiQuery,
  readAcademicApiJson,
  readAcademicApiProtocolJson,
} from "@/features/academics/api-v1/http";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import { SubmissionFileAccessError } from "@/features/academics/submission-files/access";
import { SubmissionFinalizationError } from "@/features/academics/submissions/validation";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { logServerError } from "@/lib/errors";
import { apiV1ErrorResponseSchema } from "@hra/contracts/api-v1";

const requestId = "11111111-1111-4111-8111-111111111111";

/** 실제 Request의 헤더·본문을 사용하되 외부 서비스에는 접속하지 않습니다. */
function jsonRequest(body = "{}", extraHeaders: Record<string, string> = {}) {
  return new Request("https://app.invalid/api/v1/submissions", {
    method: "POST",
    headers: { Origin: "https://app.invalid", "Content-Type": "application/json", ...extraHeaders },
    body,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("학사 v1 입력 경계", () => {
  it("같은 출처의 JSON을 그대로 읽고 원래 문자열의 객체 키 순서를 보존한다", async () => {
    const value = await readAcademicApiJson(jsonRequest('{"z":1,"a":2}'));
    expect(JSON.stringify(value)).toBe('{"z":1,"a":2}');
    expect(await readAcademicApiJson(jsonRequest("{}", { "Content-Type": "application/json; charset=utf-8" }))).toEqual({});
  });

  it.each(["", "https://other.invalid", "http://app.invalid", "https://app.invalid:444"])(
    "누락·교차 출처 %s는 본문을 읽기 전에 거부한다", async (origin) => {
      const request = jsonRequest("{}", { Origin: origin });
      await expect(readAcademicApiJson(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(request.bodyUsed).toBe(false);
    },
  );

  it("SDK 전용 reader는 Origin 없는 callback을 읽되 입력 검증은 유지한다", async () => {
    expect(await readAcademicApiProtocolJson(jsonRequest('{"type":"callback"}', { Origin: "" })))
      .toEqual({ type: "callback" });
    await expect(readAcademicApiProtocolJson(jsonRequest("{}", { "Content-Type": "text/plain" })))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])("JSON 이외 Content-Type %s를 거부한다", async (contentType) => {
    await expect(readAcademicApiJson(jsonRequest("{}", { "Content-Type": contentType })))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("빈 본문·깨진 JSON과 단건 경로의 query를 거부한다", async () => {
    for (const body of ["", "{"]) {
      await expect(readAcademicApiJson(jsonRequest(body))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    const request = new Request("https://app.invalid/api/v1/assignments/id?page=1&page=2");
    expect(() => assertNoAcademicApiQuery(request)).toThrow(AcademicApiHttpError);
  });

  it("Content-Length가 없거나 거짓으로 작아도 실제 16KiB 한도를 강제한다", async () => {
    const maximum = JSON.stringify("가".repeat(5460));
    expect(Buffer.byteLength(maximum)).toBeLessThanOrEqual(16 * 1024);
    expect(await readAcademicApiJson(jsonRequest(maximum))).toBe("가".repeat(5460));
    const headerVariants: Record<string, string>[] = [{}, { "Content-Length": "2" }];
    for (const headers of headerVariants) {
      await expect(readAcademicApiJson(jsonRequest(JSON.stringify("가".repeat(5461)), headers)))
        .rejects.toMatchObject({ code: "TOO_LARGE" });
    }
  });
});

describe("학사 오류의 공통 HTTP 계약", () => {
  it.each([
    [new AcademicAccessError("UNAUTHENTICATED"), "UNAUTHENTICATED", 401],
    [new AcademicAccessError("FORBIDDEN"), "FORBIDDEN", 403],
    [new AcademicAccessError("INVALID_INPUT"), "INVALID_INPUT", 400],
    [new AcademicAccessError("DISABLED"), "DISABLED", 503],
    [new AcademicAccessError("NOT_FOUND"), "NOT_FOUND", 404],
    [new AcademicUploadError("INVALID_FILE"), "INVALID_INPUT", 400],
    [new AcademicUploadError("EXPIRED"), "CONFLICT", 409],
    [new AcademicUploadError("NOT_READY"), "CONFLICT", 409],
    [new AcademicUploadError("UNAVAILABLE"), "STORAGE_UNAVAILABLE", 503],
    [new SubmissionFinalizationError("FORBIDDEN"), "NOT_FOUND", 404],
    [new SubmissionFinalizationError("DEADLINE"), "CONFLICT", 409],
    [new SubmissionFinalizationError("EXPIRED"), "CONFLICT", 409],
    [new SubmissionFinalizationError("NOT_READY"), "CONFLICT", 409],
    [new SubmissionFileAccessError("NOT_FOUND"), "NOT_FOUND", 404],
    [new AcademicApiHttpError("TOO_LARGE"), "TOO_LARGE", 413],
    [new Error("private://token SQL 개인정보"), "UNAVAILABLE", 503],
  ])("내부 오류 %s를 %s/%s로 변환한다", async (error, code, status) => {
    const response = academicApiErrorResponse(error, requestId);
    expect(response.status).toBe(status);
    const body = apiV1ErrorResponseSchema.parse(await response.json());
    expect(body.error).toMatchObject({ code, requestId });
    expect(JSON.stringify(body)).not.toMatch(/private:|SQL|개인정보/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
  });

  it("rate limit의 실제 재시도 초를 본문과 헤더에 동일하게 보존한다", async () => {
    const response = academicApiErrorResponse(new AcademicUploadError("RATE_LIMITED", 17), requestId);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect((await response.json()).error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 17 });
  });

  it("알 수 없는 오류 원문을 응답이나 로그에 전달하지 않는다", async () => {
    const response = academicApiErrorResponse(new Error("private://token SQL 개인정보"), requestId);
    expect(await response.text()).not.toMatch(/private:|SQL|개인정보/);
    expect(logServerError).toHaveBeenCalledWith("api-v1/academic", expect.objectContaining({ message: "ACADEMIC_API_UNAVAILABLE" }), { requestId });
  });
});
