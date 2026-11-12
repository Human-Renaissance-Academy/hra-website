// @vitest-environment node
/**
 * 강의자료·주차별 텍스트 목록/상세/파일과 가이드북 파일 API v1의 OpenAPI·공용 DTO 계약을 검증합니다.
 * 파일 저장 위치·업로더·시간대 없는 작성 시각이 공개 계약에 포함되지 않는지, 오류·캐시 헤더가 고정되는지 확인합니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiV1ClassMaterialDetailResponseSchema,
  apiV1ClassMaterialListResponseSchema,
  apiV1ResourceListQuerySchema,
  apiV1ResourceRateLimitedErrorSchema,
  apiV1WeeklyTextDetailResponseSchema,
  apiV1WeeklyTextListResponseSchema,
  toApiV1ClassMaterialDetailResponse,
  toApiV1ClassMaterialSummary,
  toApiV1PageMeta,
  toApiV1WeeklyTextDetailResponse,
  toApiV1WeeklyTextSummary,
} from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const schemas = openapi.components.schemas;
const id = "11111111-1111-4111-8111-111111111111";
const cohortId = "22222222-2222-4222-8222-222222222222";

const lists = {
  "/api/v1/resources/class-materials": { operationId: "listMemberClassMaterials", response: "ClassMaterialListResponse" },
  "/api/v1/resources/weekly-texts": { operationId: "listMemberWeeklyTexts", response: "WeeklyTextListResponse" },
} as const;
const details = {
  "/api/v1/resources/class-materials/{id}": { operationId: "getMemberClassMaterial", response: "ClassMaterialDetailResponse" },
  "/api/v1/resources/weekly-texts/{id}": { operationId: "getMemberWeeklyText", response: "WeeklyTextDetailResponse" },
} as const;
const files = {
  "/api/v1/resources/guidebooks/{id}/file": "downloadMemberGuidebookFile",
  "/api/v1/resources/class-materials/{id}/file": "downloadMemberClassMaterialFile",
  "/api/v1/resources/weekly-texts/{id}/file": "downloadMemberWeeklyTextFile",
} as const;
const failures = { "400": "InvalidInputError", "401": "UnauthenticatedError", "403": "ForbiddenError", "503": "UnavailableError" };

/** 모든 응답이 비공개 무저장·쿠키/Bearer 구분·요청 ID 헤더를 선언하는지 확인합니다. */
function expectPrivateHeaders(responses: Record<string, { headers: Record<string, { schema: Record<string, string> }> }>) {
  for (const response of Object.values(responses)) {
    expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(response.headers.Vary.schema.const).toBe("Cookie, Authorization");
    expect(response.headers["X-Request-Id"].schema.format).toBe("uuid");
  }
}

describe("#272 공동 자료 OpenAPI 3.1 계약", () => {
  it("새 경로는 GET 하나씩이며 Bearer 우선·쿠키 대안·PENDING 403을 기록하고 bearerAuth만 선언한다", () => {
    for (const path of [...Object.keys(lists), ...Object.keys(details), ...Object.keys(files)]) {
      expect(Object.keys(openapi.paths[path])).toEqual(["get"]);
      const operation = openapi.paths[path].get;
      expect(operation.description).toContain("모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키");
      expect(operation.description).toContain("Authorization 헤더가 있으면 쿠키보다 우선");
      expect(operation.description).toContain("유효한 쿠키가 함께 있어도 401");
      expect(operation.description).toContain("PENDING은 403");
      expect(operation.description).not.toContain("아직 지원하지 않습니다");
      expect(operation.description).not.toContain("session-token");
      // OpenAPI의 `{}` 대안은 익명 허용이므로 쿠키 대안은 설명으로만 기록합니다.
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation).not.toHaveProperty("requestBody");
    }
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("목록은 page/pageSize만 받고 400/401/403/503 공통 오류를 고정한다", () => {
    for (const [path, expected] of Object.entries(lists)) {
      const operation = openapi.paths[path].get;
      expect(operation.operationId).toBe(expected.operationId);
      expect(operation.parameters.map((parameter: { name: string; in: string }) => `${parameter.in}:${parameter.name}`))
        .toEqual(["query:page", "query:pageSize"]);
      expect(Object.keys(operation.responses).sort()).toEqual(["200", ...Object.keys(failures)].sort());
      expect(operation.responses["200"].content["application/json"].schema.$ref).toBe(`#/components/schemas/${expected.response}`);
      for (const [status, name] of Object.entries(failures)) {
        expect(operation.responses[status].content["application/json"].schema.$ref).toBe(`#/components/schemas/${name}`);
      }
      expectPrivateHeaders(operation.responses);
    }
  });

  it("상세는 UUID 경로 하나와 404를 추가한다", () => {
    for (const [path, expected] of Object.entries(details)) {
      const operation = openapi.paths[path].get;
      expect(operation.operationId).toBe(expected.operationId);
      expect(operation.parameters).toEqual([expect.objectContaining({ name: "id", in: "path", required: true,
        schema: { type: "string", format: "uuid" } })]);
      expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "403", "404", "503"]);
      expect(operation.responses["404"].content["application/json"].schema.$ref).toBe("#/components/schemas/NotFoundError");
      expectPrivateHeaders(operation.responses);
    }
  });

  it("파일은 서버 첨부 바이너리이며 모든 응답에 sandbox·nosniff를 선언하고 URL·리다이렉트를 계약하지 않는다", () => {
    for (const [path, operationId] of Object.entries(files)) {
      const operation = openapi.paths[path].get;
      expect(operation.operationId).toBe(operationId);
      expect(operation.description).toContain("리다이렉트하지 않습니다");
      expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "403", "404", "503"]);
      expect(operation.responses["200"].content).toEqual({
        "application/octet-stream": { schema: { type: "string", format: "binary" } },
      });
      expect(operation.responses["200"].headers["Content-Disposition"].schema.type).toBe("string");
      expect(operation.responses).not.toHaveProperty("302");
      for (const response of Object.values(operation.responses) as { headers: Record<string, { schema: { const?: string } }> }[]) {
        expect(response.headers["X-Content-Type-Options"].schema.const).toBe("nosniff");
        expect(response.headers["Content-Security-Policy"].schema.const).toBe("sandbox; default-src 'none'");
      }
      expectPrivateHeaders(operation.responses);
    }
  });

  it("DTO 스키마는 엄격하며 파일 위치·업로더·작성 시각 필드가 없다", () => {
    for (const name of ["ClassMaterialSummary", "ClassMaterialDetail", "WeeklyTextSummary", "WeeklyTextDetail"]) {
      expect(schemas[name].additionalProperties).toBe(false);
      expect(schemas[name].required).toEqual(Object.keys(schemas[name].properties));
      for (const forbidden of ["fileUrl", "uploadedById", "uploaderName", "createdAt", "cohortId"]) {
        expect(schemas[name].properties).not.toHaveProperty(forbidden);
      }
    }
    expect(Object.keys(schemas.ClassMaterialSummary.properties)).not.toContain("fileName");
    expect(Object.keys(schemas.WeeklyTextSummary.properties)).not.toContain("body");
    expect(schemas.ClassMaterialListResponse.properties.classMaterials.maxItems).toBe(50);
    expect(schemas.WeeklyTextListResponse.properties.weeklyTexts.maxItems).toBe(50);
  });
});

describe("#272 공동 자료 공용 DTO", () => {
  it("목록 query는 기본값·상한과 미등록 key 거부를 공유한다", () => {
    expect(apiV1ResourceListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    for (const input of [{ page: "0" }, { pageSize: "51" }, { q: "검색" }, { cohortId }]) {
      expect(apiV1ResourceListQuerySchema.safeParse(input).success).toBe(false);
    }
  });

  it("mapper는 허용 필드만 선택하고 응답 스키마를 통과한다", () => {
    const material = { id, title: "자료", audience: "STUDENT", weekNumber: null, lectureTitle: null,
      classDate: "2026-10-05", fileUrl: "https://private.invalid/x.pdf", uploaderName: "업로더" };
    const list = { classMaterials: [toApiV1ClassMaterialSummary(material)],
      page: toApiV1PageMeta({ page: 1, pageSize: 10, totalCount: 1 }) };
    expect(apiV1ClassMaterialListResponseSchema.parse(list)).toEqual(list);
    expect(JSON.stringify(list)).not.toMatch(/fileUrl|uploader|private\.invalid/);
    const detail = toApiV1ClassMaterialDetailResponse({ ...material, fileName: "x.pdf" });
    expect(apiV1ClassMaterialDetailResponseSchema.parse(detail).classMaterial.fileName).toBe("x.pdf");

    const text = { id, title: "텍스트", textType: " ", cohort: { id: cohortId, name: "A기" }, classDate: null,
      hasBody: false, hasFile: true, body: "", fileName: "", fileUrl: "https://private.invalid/y.pdf" };
    expect(toApiV1WeeklyTextSummary(text)).toEqual({ id, title: "텍스트", textType: null, cohort: { id: cohortId, name: "A기" },
      classDate: null, hasBody: false, hasFile: true });
    const textDetail = toApiV1WeeklyTextDetailResponse(text);
    expect(apiV1WeeklyTextDetailResponseSchema.parse(textDetail).weeklyText).toMatchObject({ body: null, fileName: null });
    expect(apiV1WeeklyTextListResponseSchema.safeParse({ weeklyTexts: [{ ...toApiV1WeeklyTextSummary(text), body: "x" }],
      page: toApiV1PageMeta({ page: 1, pageSize: 10, totalCount: 1 }) }).success).toBe(false);
  });

  it("강의자료 대상과 수업일은 정해진 값만 허용한다", () => {
    const base = { id, title: "자료", weekNumber: null, lectureTitle: null, classDate: null };
    expect(() => toApiV1ClassMaterialSummary({ ...base, audience: "PUBLIC" })).toThrow();
    expect(() => toApiV1ClassMaterialSummary({ ...base, audience: "STUDENT", classDate: "2026-10-05T00:00:00Z" })).toThrow();
  });
});

describe("#444 자료 조회 빈도 제한 OpenAPI 추가 계약", () => {
  it("기존 path item 대신 신규 공용 응답 정의로 429·Retry-After·Vary를 기록한다", () => {
    const responses = openapi.components.responses;
    for (const name of ["ResourceRateLimited", "ResourceFileRateLimited"]) {
      const response = responses[name];
      expect(response.content["application/json"].schema.$ref).toBe("#/components/schemas/ResourceRateLimitedError");
      expect(response.headers["Retry-After"].schema.pattern).toBe("^[1-9][0-9]*$");
      expect(response.description).toContain("#444");
    }
    expectPrivateHeaders(responses);
    expect(responses.ResourceFileRateLimited.headers["Content-Security-Policy"].schema.const).toBe("sandbox; default-src 'none'");
    expect(responses.ResourceRateLimited.description).toContain("503 UNAVAILABLE");
  });

  it("OpenAPI 스키마와 공용 zod 스키마가 같은 1~3600초 범위와 필수 재시도 값을 사용한다", () => {
    const error = schemas.ResourceRateLimitedError.properties.error;
    expect(error.required).toEqual(["code", "message", "requestId", "retryAfterSeconds"]);
    expect(error.properties.retryAfterSeconds).toMatchObject({ type: "integer", minimum: 1, maximum: 3600 });
    const body = { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다.", requestId: id, retryAfterSeconds: 3600 } };
    expect(apiV1ResourceRateLimitedErrorSchema.safeParse(body).success).toBe(true);
    expect(apiV1ResourceRateLimitedErrorSchema.safeParse({ error: { ...body.error, retryAfterSeconds: 3601 } }).success).toBe(false);
    expect(apiV1ResourceRateLimitedErrorSchema.safeParse({ error: { ...body.error, retryAfterSeconds: undefined } }).success).toBe(false);
  });
});
