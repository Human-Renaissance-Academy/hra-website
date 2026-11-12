// @vitest-environment node
/**
 * 모바일 인증의 OpenAPI 입력·응답·상태·캐시·요청 제한 계약을 Zod와 대조합니다.
 * 서버 구현과 독립된 계약 검증이며 기존 경로의 추가 전용 설명은 수정하지 않습니다.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import openapi from "../../packages/contracts/openapi.json";
import {
  apiV1MobileDeviceSchema,
  apiV1MobileLoginInputSchema,
  apiV1MobileLoginResponseSchema,
  apiV1MobileLogoutInputSchema,
  apiV1MobileRateLimitedErrorSchema,
  apiV1MobileRefreshInputSchema,
  apiV1MobileRefreshResponseSchema,
  apiV1MobileSessionSchema,
  apiV1MeResponseSchema,
} from "@hra/contracts/api-v1";
import { LOGIN_EMAIL_RATE_LIMIT, LOGIN_IP_RATE_LIMIT, LOGIN_RATE_LIMIT } from "@/lib/rate-limit-core";

const schemas = openapi.components.schemas;
const operations = [
  [openapi.paths["/api/v1/auth/login"].post, "loginMobile", "MobileLoginInput", ["200", "400", "401", "413", "429", "503"]],
  [openapi.paths["/api/v1/auth/refresh"].post, "refreshMobileSession", "MobileRefreshInput", ["200", "400", "401", "413", "429", "503"]],
  [openapi.paths["/api/v1/auth/logout"].post, "logoutMobile", "MobileLogoutInput", ["204", "400", "413", "429", "503"]],
] as const;

describe("모바일 인증 OpenAPI 계약", () => {
  it.each(operations)("%s의 요청·상태·공개 인증·캐시 계약을 제공한다", (operation, operationId, input, statuses) => {
    // Given: 문서에 추가된 인증 operation입니다.
    // When: 요청과 응답 구조를 읽습니다.
    const responses = operation.responses;
    // Then: 입력 DTO와 상태 집합·무저장 헤더가 일치합니다.
    expect(operation.operationId).toBe(operationId);
    expect(operation.security).toEqual([]);
    expect(operation.requestBody).toEqual({ required: true, content: {
      "application/json": { schema: { $ref: `#/components/schemas/${input}` } },
    } });
    expect(Object.keys(responses).sort()).toEqual([...statuses].sort());
    for (const response of Object.values(responses)) {
      expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
    }
  });

  it("전체 로그아웃은 Bearer만 요구하고 204·400·401·503 모두 인증별 캐시를 구분한다", () => {
    // Given: 모바일 전체 로그아웃 operation입니다.
    const operation = openapi.paths["/api/v1/auth/logout-all"].post;
    // When: 보안 요구와 응답을 읽습니다.
    const responses = operation.responses;
    // Then: 쿠키 단독 인증·성공 JSON 본문을 정의하지 않습니다.
    expect(openapi.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(operation.operationId).toBe("logoutAllMobile");
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation).not.toHaveProperty("requestBody");
    expect(Object.keys(responses).sort()).toEqual(["204", "400", "401", "503"]);
    expect(responses["204"]).not.toHaveProperty("content");
    expect(openapi.paths["/api/v1/auth/logout"].post.responses["204"]).not.toHaveProperty("content");
    for (const response of Object.values(responses)) {
      expect(response.headers["Cache-Control"].schema.const).toBe("private, no-store");
      expect(response.headers).toMatchObject({ Vary: { schema: { const: "Cookie, Authorization" } } });
    }
  });

  it("각 인증 상태는 전용 성공·공통 오류 스키마로 연결한다", () => {
    // Given: 각 operation의 전체 상태와 응답 스키마 대응입니다.
    const contracts = [
      [openapi.paths["/api/v1/auth/login"].post, { "200": "MobileLoginResponse", "400": "InvalidInputError", "401": "UnauthenticatedError", "413": "AcademicTooLargeError", "429": "MobileRateLimitedError", "503": "UnavailableError" }],
      [openapi.paths["/api/v1/auth/refresh"].post, { "200": "MobileRefreshResponse", "400": "InvalidInputError", "401": "UnauthenticatedError", "413": "AcademicTooLargeError", "429": "MobileRateLimitedError", "503": "UnavailableError" }],
      [openapi.paths["/api/v1/auth/logout"].post, { "400": "InvalidInputError", "413": "AcademicTooLargeError", "429": "MobileRateLimitedError", "503": "UnavailableError" }],
      [openapi.paths["/api/v1/auth/logout-all"].post, { "400": "InvalidInputError", "401": "UnauthenticatedError", "503": "UnavailableError" }],
    ] as const;
    // When: 각 응답의 JSON 참조를 읽습니다.
    // Then: 상태만 추가하고 잘못된 본문을 정의하는 회귀를 거부합니다.
    for (const [operation, statuses] of contracts) {
      for (const [status, schema] of Object.entries(statuses)) {
        expect(Reflect.get(operation.responses, status)).toMatchObject({ content: {
          "application/json": { schema: { $ref: `#/components/schemas/${schema}` } },
        } });
      }
    }
  });

  it("전체 operation의 security에 익명 접근의 빈 객체를 포함하지 않는다", () => {
    // Given: 기존 operation을 포함한 추가 전용 문서입니다.
    // When: 명시된 security 선언만 모읍니다.
    const security = Object.values(openapi.paths).flatMap((item) => Object.values(item))
      .filter((operation) => "security" in operation).map((operation) => operation.security);
    // Then: 인증 API의 빈 배열은 허용하고 익명 대안인 빈 객체는 거부합니다.
    for (const requirements of security) expect(requirements).not.toContainEqual({});
    expect(Object.keys(openapi.components.securitySchemes)).toEqual(["bearerAuth"]);
  });

  it("입력의 선택성·스칼라 제약을 Zod JSON Schema와 동일하게 정의한다", () => {
    // Given: 서버·클라이언트 공용 입력 스키마입니다.
    const contracts = [
      [schemas.MobileDevice, apiV1MobileDeviceSchema],
      [schemas.MobileLoginInput, apiV1MobileLoginInputSchema],
      [schemas.MobileRefreshInput, apiV1MobileRefreshInputSchema],
      [schemas.MobileLogoutInput, apiV1MobileLogoutInputSchema],
    ] as const;
    // When: 런타임 스키마를 표준 JSON Schema로 투영합니다.
    const converted = contracts.map(([document, contract]) => ({ document, json: z.toJSONSchema(contract) }));
    // Then: 엄격성·필수 목록과 스칼라 길이가 일치합니다.
    for (const { document, json } of converted) {
      expect(document.additionalProperties).toBe(json.additionalProperties);
      expect(document.required).toEqual(json.required);
      expect(Object.keys(document.properties).sort()).toEqual(Object.keys(json.properties ?? {}).sort());
    }
    expect(schemas.MobileDevice.properties).toEqual(z.toJSONSchema(apiV1MobileDeviceSchema).properties);
    expect(schemas.MobileRefreshInput.properties).toEqual(z.toJSONSchema(apiV1MobileRefreshInputSchema).properties);
    expect(schemas.MobileLogoutInput.properties).toEqual(z.toJSONSchema(apiV1MobileLogoutInputSchema).properties);
    const login = z.toJSONSchema(apiV1MobileLoginInputSchema);
    expect(schemas.MobileLoginInput.properties.email).toMatchObject({ type: "string", format: "email", minLength: 3, maxLength: 320 });
    expect(login.properties?.email).toMatchObject({ type: "string", format: "email", minLength: 3, maxLength: 320 });
    const { description: passwordDescription, ...passwordConstraint } = schemas.MobileLoginInput.properties.password;
    expect(passwordDescription).toBeDefined();
    expect(passwordConstraint).toEqual(login.properties?.password);
    expect(schemas.MobileLoginInput.properties.device).toEqual({ $ref: "#/components/schemas/MobileDevice" });
  });

  it("응답은 기존 MeUser와 UTC timestamp 참조를 재사용한다", () => {
    // Given: 로그인·갱신·세션 응답 스키마입니다.
    const contracts = [
      [schemas.MobileSession, apiV1MobileSessionSchema],
      [schemas.MobileLoginResponse, apiV1MobileLoginResponseSchema],
      [schemas.MobileRefreshResponse, apiV1MobileRefreshResponseSchema],
    ] as const;
    // When: 각 응답의 허용 필드를 수집합니다.
    const fields = contracts.map(([document, contract]) => [document, Object.keys(contract.shape)] as const);
    // Then: 모든 필드가 필수이며 내부 사용자 필드와 다른 시각 형식을 만들지 않습니다.
    for (const [document, keys] of fields) {
      expect(document.additionalProperties).toBe(false);
      expect([...document.required].sort()).toEqual([...keys].sort());
      expect(Object.keys(document.properties).sort()).toEqual([...keys].sort());
    }
    expect(apiV1MobileLoginResponseSchema.shape.user).toBe(apiV1MeResponseSchema.shape.user);
    expect(schemas.MobileLoginResponse.properties.user).toEqual({ $ref: "#/components/schemas/MeUser" });
    expect(schemas.MobileLoginResponse.properties.session).toEqual({ $ref: "#/components/schemas/MobileSession" });
    expect(schemas.MobileRefreshResponse.properties.session).toEqual({ $ref: "#/components/schemas/MobileSession" });
    expect(schemas.MobileSession.properties.accessTokenExpiresAt).toEqual({ $ref: "#/components/schemas/UtcTimestamp" });
    expect(schemas.MobileSession.properties.refreshTokenExpiresAt).toEqual({ $ref: "#/components/schemas/UtcTimestamp" });
    expect(schemas.MobileSession.properties.tokenType.const).toBe("Bearer");
    expect(schemas.MobileSession.properties.accessToken).toEqual({ type: "string", minLength: 1 });
    expect(schemas.MobileSession.properties.refreshToken).toEqual({ type: "string", minLength: 1 });
  });

  it("인증 제한의 Retry-After와 15분 잠금은 기존 학사 60초 스키마와 분리한다", () => {
    // Given: 실제 로그인 세 제한 축과 인증 전용 오류입니다.
    const maximum = Math.max(LOGIN_RATE_LIMIT.windowMs, LOGIN_IP_RATE_LIMIT.windowMs, LOGIN_EMAIL_RATE_LIMIT.windowMs) / 1000;
    // When: Zod의 오류 JSON Schema를 구합니다.
    const json = z.toJSONSchema(apiV1MobileRateLimitedErrorSchema.shape.error.shape.retryAfterSeconds);
    // Then: 긴 잠금이 잘리지 않고 두 인증 operation이 같은 오류·헤더를 사용합니다.
    const { $schema: dialect, ...constraint } = json;
    expect(dialect).toBeDefined();
    expect(schemas.MobileRateLimitedError.properties.error.properties.retryAfterSeconds).toEqual(constraint);
    expect(schemas.MobileRateLimitedError.required).toEqual(["error"]);
    expect(schemas.MobileRateLimitedError.additionalProperties).toBe(false);
    expect(schemas.MobileRateLimitedError.properties.error.additionalProperties).toBe(false);
    expect(Object.keys(schemas.MobileRateLimitedError.properties.error.properties).sort())
      .toEqual(Object.keys(apiV1MobileRateLimitedErrorSchema.shape.error.shape).sort());
    expect(schemas.MobileRateLimitedError.properties.error.properties.code)
      .toEqual({ type: "string", const: "RATE_LIMITED" });
    expect(schemas.MobileRateLimitedError.properties.error.properties.message)
      .toEqual({ type: "string", minLength: 1 });
    expect(schemas.MobileRateLimitedError.properties.error.properties.requestId)
      .toEqual({ type: "string", format: "uuid" });
    expect(schemas.MobileRateLimitedError.properties.error.required).toEqual(Object.keys(apiV1MobileRateLimitedErrorSchema.shape.error.shape));
    expect(schemas.MobileRateLimitedError.properties.error.properties.retryAfterSeconds.maximum).toBe(maximum);
    expect(schemas.AcademicRateLimitedError.properties.error.properties.retryAfterSeconds.maximum).toBe(60);
    for (const operation of [openapi.paths["/api/v1/auth/login"].post, openapi.paths["/api/v1/auth/refresh"].post]) {
      expect(operation.responses["429"].headers["Retry-After"].schema.pattern).toBe("^[1-9][0-9]*$");
      expect(operation.responses["429"].content["application/json"].schema.$ref).toBe("#/components/schemas/MobileRateLimitedError");
    }
  });
});
