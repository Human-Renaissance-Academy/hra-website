// @vitest-environment node
/**
 * v1 개인 제출 파일의 실제 어댑터·서비스 연결과 공통 오류·보호 스트림을 검증합니다.
 * 학사 DB와 Blob만 합성하고 기존 인증·인가·감사 경계는 그대로 실행합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));

import { GET } from "@/app/api/v1/submissions/[id]/files/[fileId]/route";

const userId = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const fileId = "30000000-0000-4000-8000-000000000001";
const key = "academic-uploads/v1/40000000-0000-4000-8000-000000000001/document.pdf";
const bytes = new TextEncoder().encode("PDF");
const stored = {
  storage_key: key, original_name: "한글 과제.pdf", mime_type: "application/pdf",
  size_bytes: bytes.length, checksum: "a".repeat(64), access_id: "50000000-0000-4000-8000-000000000001",
};
const context = () => ({ params: Promise.resolve({ id, fileId }) });
const request = (query = "") => new Request(`http://localhost/api/v1/submissions/${id}/files/${fileId}${query}`);
const blob = () => ({
  statusCode: 200,
  blob: { size: bytes.length, contentType: "application/pdf", pathname: key,
    url: `https://submissionqa.private.blob.vercel-storage.com/${key}` },
  stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", "");
  vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST", "submissionqa.private.blob.vercel-storage.com");
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "qa-only-sensitive-token");
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.execute.mockResolvedValue({ rows: [stored] });
  mocks.get.mockImplementation(async () => blob());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("v1 개인 제출 파일 다운로드", () => {
  it("익명은 params·학사 DB·Blob 전에 401 공통 JSON으로 거부한다", async () => {
    mocks.auth.mockResolvedValue(null);
    const params = Promise.resolve({ get id(): string { throw new Error("인증 전 ID 평가 금지"); }, fileId });
    const response = await GET(request(), { params });
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({ error: {
      code: "UNAUTHENTICATED", message: "로그인이 필요합니다.", requestId: response.headers.get("x-request-id"),
    } });
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "FACULTY", "PENDING"])("미지정 %s는 기능 gate보다 먼저 403으로 거부한다", async (role) => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    mocks.auth.mockResolvedValue({ user: { id: userId, role } });
    const response = await GET(request(), context());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("인증된 학생의 비활성 기능은 DB 전에 503 DISABLED로 구분한다", async () => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("DISABLED");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("UUID 오류·없는 파일·타인 파일은 같은 404 코드와 문구를 사용한다", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const invalid = await GET(request(), { params: Promise.resolve({ id: "bad", fileId }) });
    expect(mocks.execute).not.toHaveBeenCalled();
    const missing = await GET(request(), context());
    const denied = await GET(request(), context());
    const errors = await Promise.all([invalid, missing, denied].map(async (response) => {
      expect(response.status).toBe(404);
      return (await response.json()).error;
    }));
    expect(new Set(errors.map((error) => error.code))).toEqual(new Set(["NOT_FOUND"]));
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(["?url=https://attacker.invalid/file.pdf", "?inline=1", "?userId=ignored"])("지원하지 않는 query는 저장소 전에 거부한다: %s", async (query) => {
    const response = await GET(request(query), context());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_INPUT");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("현재 소유권·감사 확정 뒤 보호 첨부를 전달하고 원본 위치를 공개하지 않는다", async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.get.mock.invocationCallOrder[0]);
    expect(await response.text()).toBe("PDF");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%ED%95%9C%EA%B8%80%20%EA%B3%BC%EC%A0%9C.pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
    expect(JSON.stringify([...response.headers])).not.toContain(key);
    expect(JSON.stringify([...response.headers])).not.toContain("qa-only-sensitive-token");
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      outcome: "COMPLETED", resourceId: fileId, correlationId: response.headers.get("x-request-id"),
    }));
  });

  it("지정된 승인자만 기존 MANAGEMENT 범위로 읽을 수 있다", async () => {
    vi.stubEnv("ACADEMIC_APPROVER_USER_ID", userId);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "FACULTY" } });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toContain("MANAGEMENT");
    expect(query.params).toContain(userId);
    await response.body?.cancel();
  });

  it("DB·Blob 오류 원문을 공통 오류 응답이나 실패 로그에 복사하지 않는다", async () => {
    const secret = `private ${key} qa-only-sensitive-token`;
    mocks.execute.mockRejectedValueOnce(new Error(secret));
    const database = await GET(request(), context());
    expect(database.status).toBe(503);
    mocks.get.mockRejectedValueOnce(new Error(secret));
    const storage = await GET(request(), context());
    expect(storage.status).toBe(503);
    const output = JSON.stringify([await database.json(), await storage.json(), vi.mocked(console.error).mock.calls]);
    expect(output).not.toContain(key);
    expect(output).not.toContain("qa-only-sensitive-token");
  });

  it("스트림 취소를 기존 감사에 전달하고 정상 완료로 기록하지 않는다", async () => {
    const cancel = vi.fn();
    mocks.get.mockResolvedValue({ ...blob(), stream: new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>(() => undefined); }, cancel,
    }) });
    const response = await GET(request(), context());
    await response.body?.cancel();
    expect(cancel).toHaveBeenCalledOnce();
    const events = vi.mocked(console.info).mock.calls.map((call) => call[1]);
    expect(events).toContainEqual(expect.objectContaining({ outcome: "CANCELLED" }));
    expect(events).not.toContainEqual(expect.objectContaining({ outcome: "COMPLETED" }));
  });

  it("시작한 스트림의 원본 오류도 고정 오류로 변환한다", async () => {
    mocks.get.mockResolvedValue({ ...blob(), stream: new ReadableStream<Uint8Array>({
      pull() { throw new Error(`private ${key} qa-only-sensitive-token`); },
    }) });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow("파일 전송이 중단되었습니다.");
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(output).not.toContain(key);
    expect(output).not.toContain("qa-only-sensitive-token");
  });
});
