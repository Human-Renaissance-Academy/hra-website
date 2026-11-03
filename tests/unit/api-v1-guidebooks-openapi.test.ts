// @vitest-environment node
/**
 * 승인 회원 가이드북 목록의 OpenAPI와 공용 DTO·페이지·오류 계약을 검증합니다.
 * 파일 저장소 정보와 작성시각이 공개 API에 포함되지 않는지 확인합니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  API_V1_DEFAULT_PAGE_SIZE,
  API_V1_MAX_PAGE_SIZE,
  apiV1ErrorResponseSchema,
  apiV1GuidebookListQuerySchema,
  apiV1GuidebookListResponseSchema,
  apiV1GuidebookSummarySchema,
  apiV1PageMetaSchema,
  toApiV1ErrorResponse,
  toApiV1GuidebookSummary,
  toApiV1PageMeta,
} from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const operation = openapi.paths["/api/v1/resources/guidebooks"].get;
const schemas = openapi.components.schemas;
const id = "11111111-1111-4111-8111-111111111111";

describe("#272 승인 회원 가이드북 목록 OpenAPI 3.1 계약", () => {
  it("GET만 정의하고 page/pageSize 기본값·범위·미등록 및 중복 query 거부를 기록한다", () => {
    expect(openapi.openapi).toBe("3.1.1");
    expect(Object.keys(openapi.paths)).toEqual(expect.arrayContaining([
      "/api/v1/me", "/api/v1/notices", "/api/v1/notices/{id}",
      "/api/v1/resources/guidebooks", "/api/v1/schedule",
    ]));
    expect(Object.keys(openapi.paths["/api/v1/resources/guidebooks"])).toEqual(["get"]);
    expect(operation.operationId).toBe("listMemberGuidebooks");
    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: "page", in: "query", required: false,
        schema: { type: "integer", minimum: 1, default: 1 } }),
      expect.objectContaining({ name: "pageSize", in: "query", required: false,
        schema: { type: "integer", minimum: 1, maximum: API_V1_MAX_PAGE_SIZE, default: API_V1_DEFAULT_PAGE_SIZE } }),
    ]);
    expect(operation.description).toContain("중복된 query key");
    expect(operation.description).toContain("범위를 넘으면");
    expect(apiV1GuidebookListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(apiV1GuidebookListQuerySchema.parse({ page: "2", pageSize: "50" })).toEqual({ page: 2, pageSize: 50 });
    for (const input of [
      { page: "0" }, { page: "1.5" }, { pageSize: "0" },
      { pageSize: "51" }, { q: "비공개" }, { page: "1", pageSize: "10", fileUrl: "값" },
    ]) {
      expect(apiV1GuidebookListQuerySchema.safeParse(input).success).toBe(false);
    }
  });

  it("Web 쿠키 인증·승인 역할과 400/401/403/503 및 전 응답 비공개 무저장 헤더를 고정한다", () => {
    expect(operation.description).toContain("Auth.js Web 세션 쿠키");
    expect(operation.description).toContain("PENDING은 403");
    expect(operation.description).toContain("모바일 Bearer 인증은 아직 지원하지 않습니다");
    expect(operation.description).not.toContain("session-token");
    expect(Object.keys(openapi.components.securitySchemes)).toEqual(["bearerAuth"]);
    expect(operation).not.toHaveProperty("security");
    const responses = {
      "200": "GuidebookListResponse", "400": "InvalidInputError",
      "401": "UnauthenticatedError", "403": "ForbiddenError", "503": "UnavailableError",
    } as const;
    expect(Object.keys(operation.responses).sort()).toEqual(Object.keys(responses).sort());
    for (const [status, schema] of Object.entries(responses)) {
      const response = operation.responses[status];
      expect(response.content["application/json"].schema.$ref).toBe(`#/components/schemas/${schema}`);
      expect(response.headers["Cache-Control"].schema).toEqual({ type: "string", const: "private, no-store" });
      expect(response.headers.Vary.schema).toEqual({ type: "string", const: "Cookie" });
    }
    expect(schemas.ForbiddenError.additionalProperties).toBe(false);
    expect(schemas.ForbiddenError.properties.error.additionalProperties).toBe(false);
    for (const [status, code] of [
      ["400", "INVALID_INPUT"], ["401", "UNAUTHENTICATED"],
      ["403", "FORBIDDEN"], ["503", "UNAVAILABLE"],
    ] as const) {
      const error = toApiV1ErrorResponse({ code, requestId: id });
      expect(apiV1ErrorResponseSchema.parse(error)).toEqual(error);
      const name = operation.responses[status].content["application/json"].schema.$ref.split("/").at(-1);
      expect(schemas[name].properties.error.properties.code.const).toBe(code);
    }
  });

  it("id/title만 추출하고 작성시각·파일 URL·파일명·토큰을 DTO와 OpenAPI에서 제외한다", () => {
    const row = {
      id,
      title: "합성 가이드북",
      createdAt: new Date("2026-10-23T00:00:00.000Z"),
      fileUrl: "https://example.test/private/blob",
      fileName: "private.pdf",
      downloadToken: "synthetic-secret",
    };
    const guidebook = toApiV1GuidebookSummary(row);
    expect(guidebook).toEqual({ id, title: "합성 가이드북" });
    const response = { guidebooks: [guidebook], page: toApiV1PageMeta({ page: 2, pageSize: 10, totalCount: 25 }) };
    expect(apiV1GuidebookListResponseSchema.parse(response)).toEqual(response);
    expect([...schemas.GuidebookListResponse.required].sort()).toEqual(Object.keys(apiV1GuidebookListResponseSchema.shape).sort());
    expect([...schemas.GuidebookSummary.required].sort()).toEqual(Object.keys(apiV1GuidebookSummarySchema.shape).sort());
    expect([...schemas.PageMeta.required].sort()).toEqual(Object.keys(apiV1PageMetaSchema.shape).sort());
    for (const name of ["GuidebookListResponse", "GuidebookSummary", "PageMeta"]) {
      expect(schemas[name].additionalProperties).toBe(false);
    }
    expect(Object.keys(schemas.GuidebookSummary.properties).sort()).toEqual(["id", "title"]);
    expect(schemas.GuidebookListResponse.properties.guidebooks.maxItems).toBe(API_V1_MAX_PAGE_SIZE);
    for (const key of ["createdAt", "fileUrl", "fileName", "downloadToken"]) {
      expect(apiV1GuidebookListResponseSchema.safeParse({
        ...response, guidebooks: [{ ...guidebook, [key]: row[key as keyof typeof row] }],
      }).success).toBe(false);
      expect(Object.keys(schemas.GuidebookSummary.properties)).not.toContain(key);
    }
    expect(apiV1GuidebookListResponseSchema.safeParse({ ...response, internal: true }).success).toBe(false);
    expect(apiV1GuidebookListResponseSchema.safeParse({
      ...response, guidebooks: Array.from({ length: 51 }, () => guidebook),
    }).success).toBe(false);
    expect(apiV1GuidebookListResponseSchema.parse({
      guidebooks: [], page: toApiV1PageMeta({ page: 9, pageSize: 10, totalCount: 25 }),
    }).page.page).toBe(9);
  });
});
