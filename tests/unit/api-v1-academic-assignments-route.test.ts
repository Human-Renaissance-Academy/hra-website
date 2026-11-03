// @vitest-environment node
/**
 * 학생 과제·제출 API 어댑터의 입력, 현재 인가 서비스 연결, 개인정보 최소 응답을 검증합니다.
 * 실제 DB 원자성은 기존 격리 PostgreSQL 회귀가 맡고 여기서는 HTTP·관측·캐시 경계를 확인합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiV1AssignmentDetailResponseSchema,
  apiV1AssignmentListResponseSchema,
  apiV1AssignmentSubmissionResponseSchema,
  apiV1ErrorResponseSchema,
  apiV1FinalizedSubmissionResponseSchema,
} from "@hra/contracts/api-v1";
import type { AcademicObservation } from "@/lib/academic-observability";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), finalize: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/academics/student-assignments/queries", () => ({
  getMyAssignments: mocks.list,
  getMyAssignment: mocks.detail,
}));
vi.mock("@/features/academics/submissions/service", () => ({ finalizeAssignmentSubmission: mocks.finalize }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { GET as listAssignments } from "@/app/api/v1/assignments/route";
import { GET as readAssignment } from "@/app/api/v1/assignments/[id]/route";
import { GET as readSubmission } from "@/app/api/v1/assignments/[id]/submission/route";
import { POST as finalizeSubmission } from "@/app/api/v1/submissions/route";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import { SubmissionFinalizationError } from "@/features/academics/submissions/validation";

const userId = "10000000-0000-4000-8000-000000000001";
const assignmentId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";
const uploadIntentId = "40000000-0000-4000-8000-000000000001";
const submissionKey = "50000000-0000-4000-8000-000000000001";
const submissionId = "60000000-0000-4000-8000-000000000001";
const fileId = "70000000-0000-4000-8000-000000000001";
const submission = { submissionId, submittedAt: "2026-10-28T07:00:00.123Z" };
const file = { fileId, originalName: "합성 과제.pdf", mimeType: "application/pdf", sizeBytes: 2048 };
const summary = {
  assignmentId, targetId, title: "본인 과제", status: "PUBLISHED",
  dueAt: "2030-11-01T00:00:00.000Z", publishedAt: "2026-10-01T00:00:00.000Z", submission,
};
const detail = { ...summary, instructions: "합성 과제 지침", file };
const finalizeInput = { assignmentId, uploadIntentId, submissionKey };
const finalized = {
  assignmentId, submissionId, submittedAt: "2026-10-28T07:00:00.123456+00:00", replayed: false, file,
};
const privateFields = { fileUrl: "https://private.invalid/secret.pdf", storageKey: "비공개저장키", email: "private@example.invalid" };

/** URL·파일 위치가 없는 허용 필드만 비교할 수 있도록 요청을 구성합니다. */
const request = (path = "/assignments", query = "") => new Request(`https://qa.invalid/api/v1${path}${query}`);
const context = (id = assignmentId) => ({ params: Promise.resolve({ id }) });
const writeRequest = (body: unknown = finalizeInput, options: { origin?: string | null; query?: string; rawBody?: string; contentType?: string } = {}) => {
  const headers = new Headers({ "Content-Type": options.contentType ?? "application/json" });
  if (options.origin !== null) headers.set("Origin", options.origin ?? "https://qa.invalid");
  return new Request(`https://qa.invalid/api/v1/submissions${options.query ?? ""}`, {
    method: "POST", headers, body: options.rawBody ?? JSON.stringify(body),
  });
};

/** 성공·실패 모두 캐시를 막고 응답 헤더와 오류 본문의 추적 ID를 연결합니다. */
function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
}

async function expectFailure(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expectPrivateHeaders(response);
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  expect(JSON.stringify(body)).not.toMatch(/private\.invalid|storageKey|SELECT|example\.invalid|비공개저장키/);
  return body;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.list.mockResolvedValue({ items: [{ ...summary, ...privateFields }], page: 1, pageSize: 20, hasNextPage: false });
  mocks.detail.mockResolvedValue({
    ...detail, ...privateFields,
    submission: { ...submission, ...privateFields }, file: { ...file, ...privateFields },
  });
  mocks.finalize.mockImplementation(async (input: typeof finalizeInput, observation: AcademicObservation) => {
    observation.authenticated(userId);
    observation.identify({ requestId: input.submissionKey });
    return { ...finalized, ...privateFields, file: { ...file, ...privateFields } };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("학생 과제 읽기 API", () => {
  it("기본 목록은 인가 서비스에 page/pageSize만 전달하고 최소 응답과 다음 페이지 표식을 반환한다", async () => {
    const response = await listAssignments(request());
    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 20 });
    const body = await response.json();
    expect(apiV1AssignmentListResponseSchema.parse(body)).toEqual(body);
    expect(body).toEqual({ assignments: [summary], page: { page: 1, pageSize: 20, hasNextPage: false } });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|storageKey|email|totalCount/);
  });

  it("요청한 페이지와 마지막 빈 페이지를 유지하며 전체 개수를 추정하지 않는다", async () => {
    mocks.list.mockResolvedValueOnce({ items: [], page: 10000, pageSize: 50, hasNextPage: false });
    const response = await listAssignments(request("/assignments", "?page=10000&pageSize=50"));
    expect(mocks.list).toHaveBeenCalledWith({ page: 10000, pageSize: 50 });
    expect(await response.json()).toEqual({ assignments: [], page: { page: 10000, pageSize: 50, hasNextPage: false } });
  });

  it.each(["?page=0", "?page=10001", "?pageSize=51", "?pageSize=0", "?page=1.5", "?page=no", "?page=1&page=2", "?pageSize=1&pageSize=2", "?userId=타인", "?cohortId=기수", "?q=검색"])(
    "미지원·중복·범위 밖 query %s는 서비스 전 400으로 거부한다", async (query) => {
      await expectFailure(await listAssignments(request("/assignments", query)), 400, "INVALID_INPUT");
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["DISABLED", 503], ["INVALID_INPUT", 400], ["UNAVAILABLE", 503],
  ] as const)("현재 인가 서비스의 %s 실패를 v1 상태 %s로 변환한다", async (code, status) => {
    mocks.list.mockRejectedValueOnce(new AcademicAccessError(code));
    await expectFailure(await listAssignments(request()), status, code);
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("알 수 없는 저장소 오류는 고정 503이고 SQL·개인정보를 반사하지 않는다", async () => {
    mocks.list.mockRejectedValueOnce(new Error("SELECT secret FROM private.invalid WHERE email=private@example.invalid"));
    await expectFailure(await listAssignments(request()), 503, "UNAVAILABLE");
  });

  it("상세는 같은 본인 인가 서비스를 사용하며 중첩 제출·파일까지 허용 필드로 다시 투영한다", async () => {
    const response = await readAssignment(request(`/assignments/${assignmentId}`), context());
    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(assignmentId);
    const body = await response.json();
    expect(apiV1AssignmentDetailResponseSchema.parse(body)).toEqual(body);
    expect(body).toEqual({ assignment: detail });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|storageKey|email|private\.invalid/);
  });

  it("본인 제출 조회는 과제 지침·대상 식별자를 포함하지 않고 제출·파일 메타만 반환한다", async () => {
    const response = await readSubmission(request(`/assignments/${assignmentId}/submission`), context());
    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(mocks.detail).toHaveBeenCalledExactlyOnceWith(assignmentId);
    const body = await response.json();
    expect(apiV1AssignmentSubmissionResponseSchema.parse(body)).toEqual(body);
    expect(body).toEqual({ submission, file });
    expect(JSON.stringify(body)).not.toMatch(/instructions|targetId|fileUrl|storageKey|email/);
  });

  it("아직 최종화하지 않은 본인 과제는 제출·파일을 null로 구분한다", async () => {
    mocks.detail.mockResolvedValueOnce({ ...detail, submission: null, file: null });
    const response = await readSubmission(request(`/assignments/${assignmentId}/submission`), context());
    expect(await response.json()).toEqual({ submission: null, file: null });
  });

  it.each([readAssignment, readSubmission])("상세 계열 query·잘못된 UUID는 서비스 전에 거부하고 타인/없는 대상은 고정 404다", async (read) => {
    await expectFailure(await read(request(`/assignments/${assignmentId}`, "?userId=타인"), context()), 400, "INVALID_INPUT");
    await expectFailure(await read(request("/assignments/invalid-id"), context("invalid-id")), 404, "NOT_FOUND");
    await expectFailure(await read(request("/assignments/invalid-uuid"), context("20000000-0000-4000-0000-000000000001")), 404, "NOT_FOUND");
    expect(mocks.detail).not.toHaveBeenCalled();
    mocks.detail.mockRejectedValueOnce(new AcademicAccessError("NOT_FOUND"));
    await expectFailure(await read(request(`/assignments/${assignmentId}`), context()), 404, "NOT_FOUND");
  });

  it("서비스가 잘못된 출력 상태·날짜를 반환해도 정상 과제로 직렬화하지 않는다", async () => {
    mocks.detail.mockResolvedValueOnce({ ...detail, status: "DRAFT" });
    await expectFailure(await readAssignment(request(`/assignments/${assignmentId}`), context()), 503, "UNAVAILABLE");
    mocks.list.mockResolvedValueOnce({ items: [{ ...summary, dueAt: "invalid" }], page: 1, pageSize: 20, hasNextPage: false });
    await expectFailure(await listAssignments(request()), 503, "UNAVAILABLE");
  });
});

describe("학생 제출 최종화 API", () => {
  it("HTTP 입력을 검증한 뒤 같은 원자 서비스·관측기를 호출하고 UTC 밀리초 응답과 Web 캐시 갱신을 유지한다", async () => {
    const response = await finalizeSubmission(writeRequest());
    expect(response.status).toBe(200);
    expectPrivateHeaders(response);
    expect(mocks.finalize).toHaveBeenCalledExactlyOnceWith(finalizeInput, expect.objectContaining({
      correlationId: response.headers.get("x-request-id"),
    }));
    const body = await response.json();
    expect(apiV1FinalizedSubmissionResponseSchema.parse(body)).toEqual(body);
    expect(body).toEqual({ submission: { ...finalized, submittedAt: submission.submittedAt } });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|storageKey|email|private\.invalid/);
    expect(mocks.revalidate.mock.calls.map((call) => call[0])).toEqual([
      "/member/assignments", `/member/assignments/${assignmentId}`,
      "/admin/academics/assignments", `/admin/academics/assignments/${assignmentId}/submissions`,
    ]);
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      action: "SUBMISSION_FINALIZE", outcome: "COMPLETED", actorUserId: userId,
      requestId: submissionKey, resourceId: submissionId, correlationId: response.headers.get("x-request-id"),
    }));
  });

  it("응답 유실 후 동일 키 재시도는 서비스가 복구한 제출·REPLAYED 결과를 유지한다", async () => {
    mocks.finalize.mockRejectedValueOnce(new SubmissionFinalizationError("UNAVAILABLE"));
    await expectFailure(await finalizeSubmission(writeRequest()), 503, "UNAVAILABLE");
    mocks.finalize.mockResolvedValueOnce({ ...finalized, replayed: true });
    const response = await finalizeSubmission(writeRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).submission).toMatchObject({ submissionId, replayed: true });
    expect(mocks.finalize.mock.calls.map((call) => call[0])).toEqual([finalizeInput, finalizeInput]);
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({ outcome: "REPLAYED" }));
  });

  it.each([null, "https://other.invalid", "null"])("Origin %s는 서비스 전에 거부한다", async (origin) => {
    await expectFailure(await finalizeSubmission(writeRequest(finalizeInput, { origin })), 403, "FORBIDDEN");
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    { body: { ...finalizeInput, userId } }, { body: { ...finalizeInput, storageKey: "비공개저장키" } },
    { body: { ...finalizeInput, assignmentId: "invalid-id" } }, { body: null },
    { rawBody: "{" }, { contentType: "text/plain" }, { query: "?userId=타인" },
  ])("부적절한 JSON·식별자·추가 속성·query는 서비스 전 400이다 (%j)", async (options) => {
    await expectFailure(await finalizeSubmission(writeRequest("body" in options ? options.body : finalizeInput, options)), 400, "INVALID_INPUT");
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("실제 본문 크기 16KiB 제한은 작은 Content-Length 주장으로 우회하지 못한다", async () => {
    const oversized = writeRequest({ ...finalizeInput, padding: "가".repeat(6000) });
    oversized.headers.set("Content-Length", "1");
    await expectFailure(await finalizeSubmission(oversized), 413, "TOO_LARGE");
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it.each([
    [new AcademicAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
    [new AcademicAccessError("FORBIDDEN"), 403, "FORBIDDEN"],
    [new AcademicAccessError("DISABLED"), 503, "DISABLED"],
    [new SubmissionFinalizationError("FORBIDDEN"), 404, "NOT_FOUND"],
    [new SubmissionFinalizationError("CONFLICT"), 409, "CONFLICT"],
    [new SubmissionFinalizationError("EXPIRED"), 409, "CONFLICT"],
    [new SubmissionFinalizationError("NOT_READY"), 409, "CONFLICT"],
    [new SubmissionFinalizationError("DEADLINE"), 409, "CONFLICT"],
    [new SubmissionFinalizationError("INVALID_INPUT"), 400, "INVALID_INPUT"],
    [new AcademicUploadError("INVALID_FILE"), 400, "INVALID_INPUT"],
    [new AcademicUploadError("UNAVAILABLE"), 503, "STORAGE_UNAVAILABLE"],
  ] as const)("서비스 실패 %s를 상태 %s·코드 %s로 변환하고 캐시는 갱신하지 않는다", async (error, status, code) => {
    mocks.finalize.mockRejectedValueOnce(error);
    await expectFailure(await finalizeSubmission(writeRequest()), status, code);
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[academic/events]", expect.objectContaining({
      context: expect.objectContaining({ outcome: ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"].includes(error.code) ? "DENIED" : "FAILED" }),
    }));
  });

  it("요청 제한에는 대기 시간을 JSON·Retry-After에 일치시킨다", async () => {
    mocks.finalize.mockRejectedValueOnce(new AcademicUploadError("RATE_LIMITED", 37));
    const response = await finalizeSubmission(writeRequest());
    const body = await expectFailure(response, 429, "RATE_LIMITED");
    expect(body.error.retryAfterSeconds).toBe(37);
    expect(response.headers.get("retry-after")).toBe("37");
  });

  it("알 수 없는 서비스·캐시 오류는 원문 없는 503·실패 관측을 남긴다", async () => {
    const secret = "SELECT private_file WHERE email=private@example.invalid";
    mocks.finalize.mockRejectedValueOnce(new Error(secret));
    await expectFailure(await finalizeSubmission(writeRequest()), 503, "UNAVAILABLE");
    mocks.revalidate.mockImplementationOnce(() => { throw new Error(secret); });
    const response = await finalizeSubmission(writeRequest());
    await expectFailure(response, 503, "UNAVAILABLE");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/SELECT|private@example\.invalid/);
    expect(console.error).toHaveBeenCalledWith("[academic/events]", expect.objectContaining({
      context: expect.objectContaining({ outcome: "FAILED", correlationId: response.headers.get("x-request-id") }),
    }));
  });
});
