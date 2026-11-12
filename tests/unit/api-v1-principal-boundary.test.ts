// @vitest-environment node
/**
 * v1 인증 우선순위·요청 범위 격리·기존 학사 인가의 결합 회귀입니다.
 * 토큰 저장소만 대체하고 실제 ALS·HTTP 어댑터·역할 gate를 실행합니다.
 */
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), validate: vi.fn(), auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/mobile-session/service", () => ({ authenticateAccessToken: mocks.authenticate, validateMobileSession: mocks.validate }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
import { getMobilePrincipalOverride, resolveBearer, runWithMobilePrincipal, withApiV1Principal, type MobileApiPrincipal } from "@/lib/api-v1-principal";
import { requireAcademicStudent } from "@/lib/academic-permissions";
import { requireSubmissionFileReader } from "@/features/academics/submission-files/access";
import { academicApiErrorResponse, AcademicApiHttpError, readAcademicApiJson } from "@/features/academics/api-v1/http";
import { MobileSessionStorageError } from "@/features/auth/mobile-session/types";

const mobileId = "10000000-0000-4000-8000-000000000001";
const cookieId = "20000000-0000-4000-8000-000000000001";
const principal: MobileApiPrincipal = { userId: mobileId, role: "MEMBER", sessionVersion: 1, sessionId: mobileId, transport: "mobile" };
const failure = (code: "UNAUTHENTICATED" | "UNAVAILABLE") => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID());
const request = (authorization?: string) => new Request("https://qa.invalid/api/v1/assignments", {
  headers: { Cookie: "valid-cookie", ...(authorization === undefined ? {} : { Authorization: authorization }) },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", "");
  mocks.auth.mockResolvedValue({ user: { id: cookieId, role: "MEMBER" } });
  mocks.authenticate.mockResolvedValue(principal);
  mocks.validate.mockResolvedValue(principal);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each([undefined, "", "Basic abc", "Bearer", "Bearer bad token", "Bearer a,b"])("헤더 %s는 tri-state를 구분한다", async (header) => {
  // Given: Authorization 부재 또는 유효하지 않은 스킴/형식
  const input = request(header);
  // When: 실제 resolver 실행
  const result = await resolveBearer(input);
  // Then: 무헤더만 쿠키 경로이며 나머지는 실패 차단
  expect(result.kind).toBe(header === undefined ? "NO_BEARER" : "INVALID_BEARER");
  expect(mocks.authenticate).not.toHaveBeenCalled();
});

it.each(["unknown", "expired", "revoked"])("%s 토큰은 유효한 쿠키로 되돌아가지 않는다", async (token) => {
  // Given
  mocks.authenticate.mockResolvedValue(null);
  const handler = vi.fn(async () => Response.json(await requireAcademicStudent()));
  // When
  const response = await withApiV1Principal(request(`Bearer ${token}`), handler, failure);
  // Then
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  expect(handler).not.toHaveBeenCalled();
  expect(mocks.auth).not.toHaveBeenCalled();
});

it("모바일 저장소 장애는 쿠키 없이 503으로 끝난다", async () => {
  // Given
  mocks.authenticate.mockRejectedValue(new MobileSessionStorageError());
  // When
  const response = await withApiV1Principal(request("Bearer valid"), async () => Response.json({}), failure);
  // Then
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("UNAVAILABLE");
  expect(mocks.auth).not.toHaveBeenCalled();
});

it.each([undefined, "Bearer valid"])("인증 전송 %s가 같은 학생 인가에서 다른 신원을 선택한다", async (header) => {
  // Given
  const input = request(header);
  // When
  const response = await withApiV1Principal(input, async () => Response.json(await requireAcademicStudent(), { headers: { Vary: "Accept-Encoding" } }), failure);
  // Then
  expect(await response.json()).toEqual({ userId: header ? mobileId : cookieId });
  expect(response.headers.get("vary")?.split(", ")).toEqual(expect.arrayContaining(["Accept-Encoding", "Cookie", "Authorization"]));
  expect(mocks.auth).toHaveBeenCalledTimes(header ? 0 : 1);
});

it.each(["ADMIN", "FACULTY", "PENDING"] as const)("모바일 %s도 기존 학생 역할 경계를 우회하지 못한다", async (role) => {
  // Given
  const actor = { ...principal, role };
  mocks.validate.mockResolvedValue(actor);
  // When
  const action = runWithMobilePrincipal(actor, requireAcademicStudent);
  // Then
  await expect(action).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("학생·파일 인가는 호출마다 재검증하며 회수 뒤 쿠키로 fallback하지 않는다", async () => {
  // Given
  mocks.validate.mockResolvedValueOnce(principal).mockResolvedValueOnce(principal).mockResolvedValue(null);
  // When / Then
  await runWithMobilePrincipal(principal, async () => {
    await requireAcademicStudent();
    await requireSubmissionFileReader();
    await expect(requireAcademicStudent()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireSubmissionFileReader()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  expect(mocks.validate).toHaveBeenCalledTimes(4);
  expect(mocks.auth).not.toHaveBeenCalled();
});

it("모바일 학생도 비활성 학사 gate를 유지한다", async () => {
  // Given
  vi.stubEnv("ACADEMIC_ENABLED", "false");
  // When
  const action = runWithMobilePrincipal(principal, requireAcademicStudent);
  // Then
  await expect(action).rejects.toMatchObject({ code: "DISABLED" });
});

it("지정 승인자만 모바일 파일 MANAGEMENT 범위를 얻는다", async () => {
  // Given
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", mobileId);
  // When
  const reader = await runWithMobilePrincipal({ ...principal, role: "FACULTY" }, requireSubmissionFileReader);
  // Then
  expect(reader).toEqual({ userId: mobileId, scope: "MANAGEMENT", approverId: mobileId });
  expect(mocks.auth).not.toHaveBeenCalled();
});

it.each([undefined, "Bearer valid"])("변경 요청 %s는 검증된 모바일만 Origin 없이 허용한다", async (header) => {
  // Given
  const input = new Request("https://qa.invalid/api/v1/submissions", { method: "POST", headers: {
    "Content-Type": "application/json", ...(header ? { Authorization: header } : {}),
  }, body: "{}" });
  // When
  const response = await withApiV1Principal(input, async () => {
    try { return Response.json(await readAcademicApiJson(input)); }
    catch (error) { return academicApiErrorResponse(error, crypto.randomUUID()); }
  }, failure);
  // Then
  expect(response.status).toBe(header ? 200 : 403);
});

it("64개 교차 비동기 요청은 신원을 공유하지 않고 호출 범위 밖에는 override가 없다", async () => {
  // Given: 모든 요청을 같은 barrier에서 기다리게 하여 확실히 교차 실행
  const gate = Promise.withResolvers<void>();
  const actors = Array.from({ length: 64 }, (_, index) => ({ ...principal, userId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));
  const operations = actors.map((actor) => runWithMobilePrincipal(actor, async () => {
    const before = getMobilePrincipalOverride();
    await gate.promise;
    await Promise.resolve();
    return { before, after: getMobilePrincipalOverride(), frozen: Object.isFrozen(getMobilePrincipalOverride()) };
  }));
  // When
  gate.resolve();
  const results = await Promise.all(operations);
  // Then
  results.forEach((result, index) => {
    expect(result.before).toEqual(actors[index]);
    expect(result.after).toEqual(actors[index]);
    expect(result.frozen).toBe(true);
  });
  expect(getMobilePrincipalOverride()).toBeUndefined();
});
