// @vitest-environment node
/**
 * 모바일 인증 경계의 유효 입력·길이·추가 키·비공개 사용자 필드 거부를 검증합니다.
 * 실제 계정이나 토큰 없이 합성 값으로 클라이언트·서버 공용 스키마만 실행합니다.
 */
import { describe, expect, it } from "vitest";
import {
  apiV1MobileDeviceSchema,
  apiV1MobileLoginInputSchema,
  apiV1MobileLoginResponseSchema,
  apiV1MobileLogoutInputSchema,
  apiV1MobileRateLimitedErrorSchema,
  apiV1MobileRefreshInputSchema,
  apiV1MobileRefreshResponseSchema,
  apiV1MobileSessionSchema,
} from "@hra/contracts/api-v1";

const session = {
  tokenType: "Bearer",
  accessToken: "synthetic-access",
  accessTokenExpiresAt: "2026-10-31T12:15:00.000Z",
  refreshToken: "synthetic-refresh",
  refreshTokenExpiresAt: "2026-11-30T12:00:00.000Z",
} as const;
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  name: null, email: null, role: "PENDING", cohortId: null, imageUrl: null,
} as const;

describe("모바일 인증 Zod 경계", () => {
  it("이메일 공백은 제거하지만 비밀번호 공백은 보존한다", () => {
    // Given: 앞뒤 공백이 있는 자격 증명입니다.
    const input = { email: "  member@example.test  ", password: " password " };
    // When: 로그인 경계에서 입력을 파싱합니다.
    const parsed = apiV1MobileLoginInputSchema.parse(input);
    // Then: 이메일만 정규화합니다.
    expect(parsed).toEqual({ email: "member@example.test", password: " password " });
  });

  it.each([
    {}, { email: "a@", password: "x" }, { email: "invalid", password: "x" },
    { email: `${"a".repeat(310)}@example.test`, password: "x" },
    { email: "member@example.test", password: "" },
    { email: "member@example.test", password: "x".repeat(257) },
    { email: "member@example.test", password: "x", role: "ADMIN" },
    { email: "member@example.test", password: "x", device: null },
  ])("유효하지 않거나 추가 키가 있는 로그인 입력을 거부한다: %j", (input) => {
    // Given: 허용 범위 밖 입력을 준비합니다.
    // When: 공개 로그인 스키마로 파싱합니다.
    const result = apiV1MobileLoginInputSchema.safeParse(input);
    // Then: 인증 계층에 전달하지 않습니다.
    expect(result.success).toBe(false);
  });

  it.each(["ANDROID", "IOS"])("선택 메타데이터 없는 %s 기기를 허용한다", (platform) => {
    // Given: 플랫폼만 지정한 기기입니다.
    const input = { platform };
    // When: 기기 경계를 파싱합니다.
    const result = apiV1MobileDeviceSchema.parse(input);
    // Then: 버전·이름을 강제하지 않습니다.
    expect(result).toEqual(input);
  });

  it("비밀번호·기기 메타데이터의 최대 길이를 허용한다", () => {
    // Given: 각 필드의 마지막 허용 길이입니다.
    const input = { email: "member@example.test", password: "x".repeat(256),
      device: { platform: "ANDROID", appVersion: "1".repeat(32), deviceName: "기".repeat(64) } };
    // When: 중첩 기기를 포함한 요청을 파싱합니다.
    const result = apiV1MobileLoginInputSchema.parse(input);
    // Then: 최대 길이의 원본 값을 보존합니다.
    expect(result).toEqual(input);
  });

  it.each([
    {}, { platform: "WEB" }, { platform: "ANDROID", appVersion: "" },
    { platform: "ANDROID", appVersion: "1".repeat(33) },
    { platform: "IOS", deviceName: "" }, { platform: "IOS", deviceName: "기".repeat(65) },
    { platform: "ANDROID", userId: user.id },
  ])("중첩 기기의 제약 위반을 거부한다: %j", (device) => {
    // Given: 잘못된 기기를 포함한 로그인입니다.
    const input = { email: "member@example.test", password: "x", device };
    // When: 로그인 경계에서 중첩 객체까지 파싱합니다.
    const result = apiV1MobileLoginInputSchema.safeParse(input);
    // Then: 버전·기기명·플랫폼·추가 키 위반을 차단합니다.
    expect(result.success).toBe(false);
  });

  it.each([apiV1MobileRefreshInputSchema, apiV1MobileLogoutInputSchema])("갱신·로그아웃은 불투명 토큰 하나만 허용한다", (schema) => {
    // Given: 형식을 해석하지 않는 토큰과 잘못된 요청들입니다.
    const input = { refreshToken: "opaque-synthetic-token" };
    const invalid = [{}, { refreshToken: "" }, { refreshToken: null }, { ...input, userId: user.id }];
    // When: 동일 계약으로 각 입력을 파싱합니다.
    const results = [schema.safeParse(input), ...invalid.map((value) => schema.safeParse(value))];
    // Then: 비어 있지 않은 단일 토큰만 통과합니다.
    expect(results.map((result) => result.success)).toEqual([true, false, false, false, false]);
  });

  it.each([
    { ...session, tokenType: "Basic" }, { ...session, accessToken: "" },
    { ...session, refreshToken: "" }, { ...session, sessionVersion: 1 },
    ...["2026-10-31", "2026-10-31T12:15:00Z", "2026-10-31T21:15:00.000+09:00",
      "2026-02-30T12:15:00.000Z"].flatMap((value) => [
      { ...session, accessTokenExpiresAt: value }, { ...session, refreshTokenExpiresAt: value },
    ]),
  ])("세션의 토큰·UTC 밀리초·추가 키 위반을 거부한다: %j", (input) => {
    // Given: 유효 세션의 필드 하나를 변형한 값입니다.
    // When: 세션 DTO를 파싱합니다.
    const result = apiV1MobileSessionSchema.safeParse(input);
    // Then: 변경된 잘못된 필드를 거부합니다.
    expect(result.success).toBe(false);
  });

  it.each(["ADMIN", "FACULTY", "MEMBER", "PENDING"])("로그인은 %s 프로필을 재사용하고 갱신은 세션만 반환한다", (role) => {
    // Given: 공개 사용자 DTO와 합성 세션입니다.
    const login = { session, user: { ...user, role } };
    // When: 성공 응답 두 종류를 파싱합니다.
    const parsed = [apiV1MobileLoginResponseSchema.parse(login), apiV1MobileRefreshResponseSchema.parse({ session })];
    // Then: 공개 프로필과 회전 세션만 유지합니다.
    expect(parsed).toEqual([login, { session }]);
  });

  it.each([
    { session, user: { ...user, passwordHash: "synthetic" } },
    { session, user: { ...user, sessionVersion: 1 } }, { session, user, internal: true },
    { session, user: { ...user, role: "ADVISOR" } }, { session },
  ])("로그인 응답의 내부 필드·잘못된 프로필을 거부한다: %j", (input) => {
    // Given: 공개 응답 경계를 벗어난 값입니다.
    // When: 로그인 응답을 파싱합니다.
    const result = apiV1MobileLoginResponseSchema.safeParse(input);
    // Then: 내부 인증 데이터를 노출하지 않습니다.
    expect(result.success).toBe(false);
  });

  it("갱신 응답에 프로필을 추가하면 거부한다", () => {
    // Given: 세션 이외의 필드를 넣었습니다.
    const input = { session, user };
    // When: 갱신 응답을 파싱합니다.
    const result = apiV1MobileRefreshResponseSchema.safeParse(input);
    // Then: 세션만 반환하는 계약을 유지합니다.
    expect(result.success).toBe(false);
  });

  it.each([0, 1, 60, 900, 901, 1.5])("인증 재시도 %s초를 15분 경계로 검사한다", (retryAfterSeconds) => {
    // Given: 기존 오류 코드와 합성 요청 ID입니다.
    const error = { code: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요.", requestId: user.id, retryAfterSeconds };
    // When: 인증 전용 오류를 파싱합니다.
    const result = apiV1MobileRateLimitedErrorSchema.safeParse({ error });
    // Then: 60초를 넘는 정상 잠금도 표현하지만 900초 초과는 거부합니다.
    expect(result.success).toBe(Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 1 && retryAfterSeconds <= 900);
  });

  it.each([
    { code: "RATE_LIMITED", message: "대기", requestId: user.id },
    { code: "UNAVAILABLE", message: "대기", requestId: user.id, retryAfterSeconds: 1 },
    { code: "RATE_LIMITED", message: "", requestId: user.id, retryAfterSeconds: 1 },
    { code: "RATE_LIMITED", message: "대기", requestId: "invalid", retryAfterSeconds: 1 },
    { code: "RATE_LIMITED", message: "대기", requestId: user.id, retryAfterSeconds: 1, token: "synthetic" },
  ])("요청 제한 오류의 필수 필드·고정 코드·추가 키 위반을 거부한다: %j", (error) => {
    // Given: 재시도 경계를 벗어나는 오류 객체입니다.
    // When: 모바일 429 응답 경계에서 파싱합니다.
    const result = apiV1MobileRateLimitedErrorSchema.safeParse({ error });
    // Then: 불완전하거나 다른 코드의 오류를 429 계약으로 사용하지 못합니다.
    expect(result.success).toBe(false);
  });
});
