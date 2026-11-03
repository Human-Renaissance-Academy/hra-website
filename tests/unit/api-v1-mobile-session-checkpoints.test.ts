// @vitest-environment node
/** 모바일 인가의 반복 재검증과 Blob 대기 중 자격 회수 후 최종화 차단을 검증합니다. */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ validate: vi.fn(), auth: vi.fn(), target: vi.fn(), execute: vi.fn(), verify: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/mobile-session/service", () => ({ validateMobileSession: mocks.validate, authenticateAccessToken: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@/features/academics/student-assignments/data", () => ({ buildAssignmentTargetLookup: mocks.target }));
vi.mock("@/features/academics/assignment-uploads/server", () => ({ verifyAssignmentUploadIntent: mocks.verify }));
import { runWithMobilePrincipal, type MobileApiPrincipal } from "@/lib/api-v1-principal";
import { requireAcademicStudent, requireAssignmentTarget } from "@/lib/academic-permissions";
import { finalizeAssignmentSubmission } from "@/features/academics/submissions/service";

const id = "10000000-0000-4000-8000-000000000001";
const assignmentId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";
const principal: MobileApiPrincipal = { userId: id, role: "MEMBER", sessionId: id, sessionVersion: 7, transport: "mobile" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
  mocks.validate.mockResolvedValue(principal);
  mocks.target.mockResolvedValue([{ assignmentId, targetId, status: "PUBLISHED", dueAt: new Date("2030-01-01"), publishedAt: new Date("2026-01-01") }]);
  mocks.execute.mockResolvedValue({ rows: [{ result: null }] });
});
afterEach(() => vi.unstubAllEnvs());

it("같은 요청의 학생·대상 확인은 각 호출에서 세션 버전을 재조회한다", async () => {
  // Given / When
  await runWithMobilePrincipal(principal, async () => {
    await requireAcademicStudent();
    await requireAssignmentTarget({ assignmentId });
    await requireAssignmentTarget({ targetId });
  });
  // Then
  expect(mocks.validate).toHaveBeenCalledTimes(3);
  expect(mocks.validate).toHaveBeenLastCalledWith({ sessionId: id, expectedVersion: 7 });
  expect(mocks.auth).not.toHaveBeenCalled();
});

it.each(["revoked", "version-bumped"])("Blob 대기 중 %s 세션은 최종 커밋 호출 전에 차단한다", async () => {
  // Given
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  mocks.verify.mockImplementation(async () => { entered.resolve(); await resume.promise; });
  const pending = runWithMobilePrincipal(principal, () => finalizeAssignmentSubmission({ assignmentId, uploadIntentId: id, submissionKey: targetId }));
  const rejection = expect(pending).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await entered.promise;
  // When
  mocks.validate.mockResolvedValue(null);
  resume.resolve();
  await rejection;
  // Then: 유일한 SQL은 finalize=false인 기존 성공 조회이고 최종 쓰기는 실행되지 않습니다.
  expect(mocks.execute).toHaveBeenCalledTimes(1);
  expect(mocks.validate).toHaveBeenCalledTimes(2);
  expect(mocks.target).toHaveBeenCalledTimes(1);
  expect(mocks.auth).not.toHaveBeenCalled();
});
