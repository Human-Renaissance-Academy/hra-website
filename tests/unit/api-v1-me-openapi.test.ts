// @vitest-environment node
/**
 * Web 세션 기반 본인 프로필 GET의 OpenAPI와 공용 DTO·오류 계약을 대조합니다.
 * 비공개 필드, 고정 쿠키 이름, 아직 없는 Bearer 인증을 공개 계약으로 주장하지 않습니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiV1ErrorResponseSchema,
  apiV1MeResponseSchema,
  toApiV1ErrorResponse,
  toApiV1MeResponse,
} from "@hra/contracts/api-v1";
import { USER_ROLES } from "@hra/contracts/identity";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const operation = openapi.paths["/api/v1/me"].get;
const schemas = openapi.components.schemas;
const requestId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("#272 본인 프로필 OpenAPI 3.1 계약", () => {
  it("Bearer 또는 Web 세션 쿠키를 설명하고 query·고정 쿠키 이름을 주장하지 않는다", () => {
    expect(openapi.openapi).toBe("3.1.1");
    expect(openapi.info.description).toContain("각 경로의 설명");
    expect(Object.keys(openapi.paths)).toEqual(expect.arrayContaining(["/api/v1/me", "/api/v1/notices", "/api/v1/notices/{id}", "/api/v1/resources/guidebooks", "/api/v1/schedule"]));
    expect(Object.keys(openapi.paths["/api/v1/me"])).toEqual(["get"]);
    expect(operation.operationId).toBe("getCurrentUser");
    expect(operation.parameters).toEqual([]);
    expect(operation.description).toContain("Auth.js Web 세션 쿠키");
    expect(operation.description).toContain("쿠키 이름");
    expect(operation.description).toContain("모바일 Bearer access token");
    expect(operation.description).toContain("PENDING 사용자도 자신의 프로필만");
    expect(operation.description).toContain("query key는 허용하지 않습니다");
    expect(operation.description).not.toContain("session-token");
    expect(Object.keys(openapi.components.securitySchemes)).toEqual(["bearerAuth"]);
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
  });

  it("200·400·401·503의 DTO·오류 코드와 비공개 무저장 캐시 헤더를 고정한다", () => {
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "503"]);
    expect(operation.responses["503"].description).toContain("명시적으로 전파한 오류");
    const responseSchemas = {
      "200": "MeResponse",
      "400": "InvalidInputError",
      "401": "UnauthenticatedError",
      "503": "UnavailableError",
    } as const;
    for (const [status, schema] of Object.entries(responseSchemas)) {
      const response = operation.responses[status];
      expect(response.content["application/json"].schema.$ref).toBe(`#/components/schemas/${schema}`);
      expect(response.headers["Cache-Control"].schema).toEqual({ type: "string", const: "private, no-store" });
    }
    expect(schemas.UnauthenticatedError.properties.error.properties.code).toEqual({
      type: "string", const: "UNAUTHENTICATED",
    });
    expect(schemas.UnauthenticatedError.additionalProperties).toBe(false);
    expect(schemas.UnauthenticatedError.properties.error.additionalProperties).toBe(false);
  });

  it("user 6필드는 공용 Zod whitelist·역할 값과 같고 내부 인증 열을 거부한다", () => {
    expect(schemas.MeResponse.additionalProperties).toBe(false);
    expect(schemas.MeUser.additionalProperties).toBe(false);
    expect([...schemas.MeResponse.required].sort()).toEqual(Object.keys(apiV1MeResponseSchema.shape).sort());
    expect([...schemas.MeUser.required].sort()).toEqual(Object.keys(apiV1MeResponseSchema.shape.user.shape).sort());
    expect(schemas.MeUser.properties.role.enum).toEqual(USER_ROLES);

    const response = toApiV1MeResponse({
      id: userId,
      name: "합성 회원",
      email: "kakao_123@oauth.placeholder",
      role: "PENDING",
      cohortId: null,
      imageUrl: null,
    });
    expect(response).toEqual({
      user: { id: userId, name: "합성 회원", email: null, role: "PENDING", cohortId: null, imageUrl: null },
    });
    expect(apiV1MeResponseSchema.parse(response)).toEqual(response);
    for (const leaked of [
      { passwordHash: "합성 비밀번호 해시" },
      { sessionVersion: 9 },
      { providerAccountId: "합성 제공자 식별자" },
    ]) {
      expect(apiV1MeResponseSchema.safeParse({ user: { ...response.user, ...leaked } }).success).toBe(false);
    }
    expect(apiV1MeResponseSchema.safeParse({ ...response, internal: true }).success).toBe(false);
  });

  it("오류 형식은 400·401·503 고정 코드와 요청 식별자만 반환한다", () => {
    for (const [status, code] of [
      ["400", "INVALID_INPUT"],
      ["401", "UNAUTHENTICATED"],
      ["503", "UNAVAILABLE"],
    ] as const) {
      const error = toApiV1ErrorResponse({ code, requestId });
      expect(apiV1ErrorResponseSchema.parse(error)).toEqual(error);
      expect(schemas[operation.responses[status].content["application/json"].schema.$ref.split("/").at(-1)]
        .properties.error.properties.code.const).toBe(code);
      expect(Object.keys(error.error).sort()).toEqual(["code", "message", "requestId"].sort());
    }
  });
});
