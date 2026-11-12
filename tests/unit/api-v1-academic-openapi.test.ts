// @vitest-environment node
/**
 * 학사 MVP OpenAPI와 엄격한 공용 DTO·HTTP 경계의 대응을 검증합니다.
 * 전체 경로 대조는 실제 Route 파일을 읽는 기존 append-only 실행기로 확인합니다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiV1AssignmentDetailResponseSchema,
  apiV1AssignmentDetailSchema,
  apiV1AssignmentListResponseSchema,
  apiV1AssignmentSubmissionResponseSchema,
  apiV1AssignmentSummarySchema,
  apiV1FinalizeSubmissionInputSchema,
  apiV1FinalizedSubmissionResponseSchema,
  apiV1SubmissionFileMetadataSchema,
  apiV1SubmissionSummarySchema,
  apiV1UploadCancelledResponseSchema,
  apiV1UploadIntentInputSchema,
  apiV1UploadIntentResponseSchema,
  apiV1UploadSelectionInputSchema,
  apiV1UploadVerifiedResponseSchema,
} from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const schemas = openapi.components.schemas;
const routes = [
  ["/api/v1/assignments", "get", "listMyAssignments"],
  ["/api/v1/assignments/{id}", "get", "getMyAssignment"],
  ["/api/v1/assignments/{id}/submission", "get", "getMyAssignmentSubmission"],
  ["/api/v1/submissions", "post", "finalizeMyAssignmentSubmission"],
  ["/api/v1/uploads/intents", "post", "createMyAssignmentUploadIntent"],
  ["/api/v1/uploads/intents/{id}", "delete", "cancelMyAssignmentUploadIntent"],
  ["/api/v1/uploads/{id}/verify", "post", "verifyMyAssignmentUploadIntent"],
  ["/api/v1/uploads", "post", "exchangeAssignmentUploadProtocol"],
  ["/api/v1/submissions/{id}/files/{fileId}", "get", "downloadAuthorizedSubmissionFile"],
] as const;

describe("학사 API v1 OpenAPI 경계", () => {
  it("실제 구현된 Route 전체·로컬 참조·고유 operationId가 기존 검사와 일치한다", () => {
    expect(execFileSync(process.execPath, ["scripts/check-openapi-compat.mjs", "--self"], { encoding: "utf8" }).trim()).toBe("OPENAPI_APPEND_ONLY_OK self");
    for (const [path, method, operationId] of routes) {
      expect(Object.keys(openapi.paths[path])).toEqual([method]);
      expect(openapi.paths[path][method].operationId).toBe(operationId);
    }
  });

  it("모든 학사 응답의 비공개 무저장·쿠키 구분·추적 헤더와 Web 세션 한계를 명시한다", () => {
    for (const [path, method] of routes) {
      const operation = openapi.paths[path][method];
      expect(operation.description).toContain("Auth.js Web 세션 쿠키");
      expect(operation.description).toContain("모바일 Bearer access token");
      expect(operation.description).toContain("query key");
      for (const response of Object.values(operation.responses)) {
        expect(response).toMatchObject({ headers: {
          "Cache-Control": { schema: { type: "string", const: "private, no-store" } },
          Vary: { schema: { type: "string", const: "Cookie, Authorization" } },
          "X-Request-Id": { schema: { type: "string", format: "uuid" } },
        } });
      }
    }
    expect(Object.keys(openapi.components.securitySchemes)).toEqual(["bearerAuth"]);
    for (const [path, method] of routes) expect(openapi.paths[path][method].security).toEqual([{ bearerAuth: [] }]);
  });

  it("DB 행과 독립된 DTO·본문의 필수 허용 필드를 Zod와 동일하게 선언한다", () => {
    const contracts = [
      ["AcademicSubmissionSummary", apiV1SubmissionSummarySchema],
      ["AcademicFileMetadata", apiV1SubmissionFileMetadataSchema],
      ["AcademicAssignmentSummary", apiV1AssignmentSummarySchema],
      ["AcademicAssignmentDetail", apiV1AssignmentDetailSchema],
      ["AcademicAssignmentListResponse", apiV1AssignmentListResponseSchema],
      ["AcademicAssignmentDetailResponse", apiV1AssignmentDetailResponseSchema],
      ["AcademicAssignmentSubmissionResponse", apiV1AssignmentSubmissionResponseSchema],
      ["AcademicFinalizeSubmissionInput", apiV1FinalizeSubmissionInputSchema],
      ["AcademicFinalizedSubmissionResponse", apiV1FinalizedSubmissionResponseSchema],
      ["AcademicUploadIntentInput", apiV1UploadIntentInputSchema],
      ["AcademicUploadSelectionInput", apiV1UploadSelectionInputSchema],
      ["AcademicUploadIntentResponse", apiV1UploadIntentResponseSchema],
      ["AcademicUploadVerifiedResponse", apiV1UploadVerifiedResponseSchema],
      ["AcademicUploadCancelledResponse", apiV1UploadCancelledResponseSchema],
    ] as const;
    for (const [name, contract] of contracts) {
      expect(schemas[name].additionalProperties).toBe(false);
      expect([...schemas[name].required].sort()).toEqual(Object.keys(contract.shape).sort());
      expect(Object.keys(schemas[name].properties).sort()).toEqual(Object.keys(contract.shape).sort());
    }
    expect(Object.keys(schemas.AcademicAssignmentPage.properties).sort()).toEqual(["hasNextPage", "page", "pageSize"]);
    expect(schemas.AcademicAssignmentSummary.properties.dueAt).toEqual({ $ref: "#/components/schemas/UtcTimestamp" });
    expect(schemas.AcademicFileMetadata.properties.sizeBytes.maximum).toBe(52_428_800);
    expect(schemas.AcademicUploadIntentResponse.properties.pathname.description).toContain("uploadIntentId");
  });

  it("JSON으로 저장한 파일명·불투명 경로 정규식도 실제 허용·거부 경계와 일치한다", () => {
    const name = new RegExp(schemas.AcademicUploadIntentInput.properties.originalName.pattern);
    const pathname = new RegExp(schemas.AcademicUploadIntentResponse.properties.pathname.pattern);
    expect(name.test("합성 과제.PDF")).toBe(true);
    for (const invalid of ["../과제.pdf", "경로\\과제.pdf", "과\u0000제.pdf", "과제.docx"]) {
      expect(name.test(invalid)).toBe(false);
    }
    const path = "academic-uploads/v1/11111111-1111-4111-8111-111111111111/document.pdf";
    expect(pathname.test(path)).toBe(true);
    expect(pathname.test(path.replace("document.pdf", "documentXpdf"))).toBe(false);
    expect(pathname.test(`https://example.test/${path}`)).toBe(false);
  });

  it("멱등 제출·JSON 크기·Origin·서명 callback·한도 및 저장소 실패를 구분한다", () => {
    const submit = openapi.paths["/api/v1/submissions"].post;
    expect(submit.description).toContain("HTTP 200");
    expect(submit.description).toContain("submissionKey");
    expect(submit.description).toContain("16KiB");
    expect(submit.parameters).toContainEqual(expect.objectContaining({ name: "Origin", required: false }));
    expect(submit.responses["413"].content["application/json"].schema).toEqual({ $ref: "#/components/schemas/AcademicTooLargeError" });
    const protocol = openapi.paths["/api/v1/uploads"].post;
    expect(protocol.description).toContain("원본 파싱 객체");
    expect(protocol.description).toContain("SDK 서명");
    expect(protocol.description).toContain("Origin 거부");
    expect(protocol.parameters).toContainEqual(expect.objectContaining({ name: "Origin", required: false }));
    expect(schemas.AcademicUploadProtocolResponse.oneOf[0].properties.clientToken.type).toBe("string");
    expect(schemas.AcademicUploadProtocolResponse.oneOf[1].properties.response.const).toBe("ok");
    for (const [name, code] of [
      ["AcademicConflictError", "CONFLICT"], ["AcademicTooLargeError", "TOO_LARGE"],
      ["AcademicDisabledError", "DISABLED"], ["AcademicStorageUnavailableError", "STORAGE_UNAVAILABLE"],
      ["AcademicRateLimitedError", "RATE_LIMITED"],
    ]) expect(schemas[name].properties.error.properties.code.const).toBe(code);
    expect(protocol.responses["429"].headers["Retry-After"]).toBeDefined();
  });

  it("파일은 첨부 바이너리 스트림이고 실패는 고정 JSON이며 응답 후 중단 한계를 설명한다", () => {
    const download = openapi.paths["/api/v1/submissions/{id}/files/{fileId}"].get;
    expect(download.description).toContain("ADMIN·교수 FACULTY 역할만으로 허용하지 않습니다");
    expect(download.description).toContain("응답 시작 뒤");
    expect(download.responses["200"].content["application/octet-stream"].schema.format).toBe("binary");
    expect(download.responses["200"].headers["X-Content-Type-Options"].schema.const).toBe("nosniff");
    expect(download.responses["200"].headers["Content-Security-Policy"].schema.const).toBe("sandbox; default-src 'none'");
    expect(download.responses["404"].content["application/json"].schema.$ref).toBe("#/components/schemas/NotFoundError");
  });
});
