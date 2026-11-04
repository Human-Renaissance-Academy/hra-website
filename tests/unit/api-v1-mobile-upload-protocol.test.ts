// @vitest-environment node
/**
 * 실제 Blob SDK를 사용해 모바일 토큰과 공급자 callback 권한의 분리를 검증합니다.
 * DB 원장과 외부 저장소만 합성하며 원본 본문 HMAC 검증을 우회하지 않습니다.
 */
import { createHmac } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), validate: vi.fn(), auth: vi.fn(), authorize: vi.fn(), reserve: vi.fn(), receipt: vi.fn(), record: vi.fn(), ip: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/auth/mobile-session/service", () => ({ authenticateAccessToken: mocks.authenticate, validateMobileSession: mocks.validate }));
vi.mock("@/features/academics/assignment-uploads/repository", () => ({
  authorizeUploadRecord: mocks.authorize, reserveAssignmentUploadAttempt: mocks.reserve,
  getUploadReceiptRecord: mocks.receipt, recordUploadReceipt: mocks.record,
}));
vi.mock("@/lib/rate-limit", () => ({ reserveUploadAttempt: mocks.ip }));
vi.mock("@/features/academics/student-assignments/data", () => ({ buildAssignmentTargetLookup: vi.fn() }));
vi.mock("@/lib/academic-permissions", async (original) => ({
  ...await original<typeof import("@/lib/academic-permissions")>(),
  requireAssignmentTarget: async () => {
    const { requireAcademicStudent } = await import("@/lib/academic-permissions");
    return { ...await requireAcademicStudent(), targetId: "20000000-0000-4000-8000-000000000001", status: "PUBLISHED", dueAt: new Date("2099-01-01") };
  },
}));
import { POST } from "@/app/api/v1/uploads/route";
import { academicUploadPath } from "@/features/academics/assignment-uploads/contract";
const id = "10000000-0000-4000-8000-000000000001";
const targetId = "20000000-0000-4000-8000-000000000001";
const path = academicUploadPath(id);
const host = "mobileqa.private.blob.vercel-storage.com";
const token = "vercel_blob_rw_mobileqa_fixture";
const tokenBody = { type: "blob.generate-client-token", payload: { pathname: path, multipart: false, clientPayload: JSON.stringify({ assignmentId: id, uploadIntentId: id }) } };
const callback = { extra: "preserved", payload: { tokenPayload: JSON.stringify({ uploadIntentId: id }),
  blob: { etag: "qa", contentDisposition: "attachment", contentType: "application/pdf", downloadUrl: `https://${host}/${path}?download=1`, pathname: path, url: `https://${host}/${path}` },
}, type: "blob.upload-completed" };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://qa.invalid/api/v1/uploads", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED", "true");
  vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST", host);
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", token);
  mocks.auth.mockResolvedValue({ user: { id: targetId, role: "MEMBER" } });
  mocks.authenticate.mockImplementation(async (raw: string) => raw === "valid" ? { userId: id, role: "MEMBER", sessionVersion: 1, sessionId: id } : null);
  mocks.validate.mockResolvedValue({ userId: id, role: "MEMBER" });
  mocks.authorize.mockResolvedValue({ intent_id: id, target_id: targetId, user_id: id, state: "INTENDED", storage_key: path, expected_size: 100, expires_at: new Date("2099-01-01") });
  mocks.receipt.mockResolvedValue({ storageKey: path });
  mocks.ip.mockResolvedValue({ blocked: false });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const tokenScenarios: { headers: Record<string, string>; status: number }[] = [
  { headers: { Authorization: "Bearer valid" }, status: 200 },
  { headers: { Cookie: "valid" }, status: 404 },
  { headers: { Cookie: "valid", Authorization: "Bearer invalid", Origin: "https://qa.invalid" }, status: 401 },
  { headers: { Origin: "https://qa.invalid" }, status: 200 },
];
it.each(tokenScenarios)("토큰 발급은 검증된 전송 정책을 따른다: $status", async ({ headers, status }) => {
  // Given
  const input = request(tokenBody, headers);
  // When
  const response = await POST(input);
  // Then
  expect(response.status).toBe(status);
  if (status === 200) expect(await response.json()).toMatchObject({ type: "blob.generate-client-token", clientToken: expect.any(String) });
  else expect((await response.json()).error.code).toBe(status === 404 ? "NOT_FOUND" : "UNAUTHENTICATED");
  if (headers.Authorization) expect(mocks.auth).not.toHaveBeenCalled();
});

it.each(["signed", "forged", "unsigned"])("%s callback은 사용자 권한 대신 SDK 서명만 신뢰한다", async (signatureKind) => {
  // Given: 무효 Authorization도 callback의 서명 판정에 영향을 주지 않음
  const signature = signatureKind === "signed" ? createHmac("sha256", token).update(JSON.stringify(callback)).digest("hex") : "forged";
  const input = request(callback, { Authorization: "Bearer invalid", ...(signatureKind === "unsigned" ? {} : { "x-vercel-signature": signature }) });
  // When
  const response = await POST(input);
  // Then
  expect(response.status).toBe(signatureKind === "signed" ? 200 : 503);
  expect(mocks.record).toHaveBeenCalledTimes(signatureKind === "signed" ? 1 : 0);
  expect(mocks.authenticate).not.toHaveBeenCalled();
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.authorize).not.toHaveBeenCalled();
});
