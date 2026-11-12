// @vitest-environment node
/**
 * 학사 업로드 API v1이 기존 서비스·실제 SDK 서명 검증을 재사용하는지 확인합니다.
 * 외부 저장소·세션 대신 합성 대상과 객체만 사용하며 입력 차단·공통 오류·비공개 헤더를 검증합니다.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  target: vi.fn(), head: vi.fn(), get: vi.fn(), authorize: vi.fn(), persist: vi.fn(),
  reserve: vi.fn(), issue: vi.fn(), retire: vi.fn(), receipt: vi.fn(), record: vi.fn(), ipReserve: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/academic-permissions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/academic-permissions")>(),
  requireAssignmentTarget: mocks.target,
}));
vi.mock("@vercel/blob", () => ({ head: mocks.head, get: mocks.get }));
vi.mock("@/features/academics/assignment-uploads/repository", () => ({
  authorizeUploadRecord: mocks.authorize,
  persistUploadVerification: mocks.persist,
  reserveAssignmentUploadAttempt: mocks.reserve,
  issueUploadRecord: mocks.issue,
  retireUploadRecord: mocks.retire,
  getUploadReceiptRecord: mocks.receipt,
  recordUploadReceipt: mocks.record,
}));
vi.mock("@/lib/rate-limit", () => ({ reserveUploadAttempt: mocks.ipReserve }));

import { POST as createIntent } from "@/app/api/v1/uploads/intents/route";
import { DELETE as cancelIntent } from "@/app/api/v1/uploads/intents/[id]/route";
import { POST as verifyIntent } from "@/app/api/v1/uploads/[id]/verify/route";
import { POST as protocol } from "@/app/api/v1/uploads/route";
import { AcademicUploadError, academicUploadPath } from "@/features/academics/assignment-uploads/contract";
import { AcademicAccessError } from "@/lib/academic-permissions";

const id = "10000000-0000-4000-8000-000000000001";
const assignmentId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";
const host = "qa272.private.blob.vercel-storage.com";
const token = "vercel_blob_rw_qa272_fixture";
const pathname = academicUploadPath(id);
const bytes = new TextEncoder().encode("%PDF-1.7\n합성 파일\n%%EOF");
const params = { params: Promise.resolve({ id }) };
const input = { assignmentId, requestId: id, originalName: "합성.pdf", sizeBytes: bytes.length, mimeType: "application/pdf" };
const selection = { assignmentId, uploadIntentId: id };

/** 동일 출처 JSON 요청을 기본으로 만들고 개별 검사에서 경계 하나만 바꿉니다. */
function request(path: string, value: unknown, options: { origin?: string | null; type?: string | null; method?: string } = {}) {
  const origin = options.origin === undefined ? "https://app.invalid" : options.origin;
  const type = options.type === undefined ? "application/json" : options.type;
  return new Request(`https://app.invalid/api/v1/uploads${path}`, {
    method: options.method ?? "POST",
    headers: { ...(origin ? { Origin: origin } : {}), ...(type ? { "Content-Type": type } : {}) },
    body: typeof value === "string" ? value : JSON.stringify(value),
  });
}

/** 성공과 오류 모두 다른 쿠키의 결과로 재사용하지 않으며 상관 ID는 응답 헤더로 제공합니다. */
function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")?.split(",").map((token) => token.trim().toLowerCase())).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expectPrivate(response);
  const body = await response.json();
  expect(body).toEqual({ error: expect.objectContaining({ code, requestId: response.headers.get("x-request-id"), message: expect.any(String) }) });
  for (const secret of [host, token, "private://", "SELECT", "합성.pdf"]) expect(JSON.stringify(body)).not.toContain(secret);
  return body;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED", "true");
  vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST", host);
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", token);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.target.mockResolvedValue({ userId: id, targetId, assignmentId, status: "PUBLISHED", dueAt: new Date(Date.now() + 120_000) });
  mocks.authorize.mockImplementation(async () => ({
    intent_id: id, target_id: targetId, user_id: id, original_name: "합성.pdf", expected_size: bytes.length,
    storage_key: pathname, expires_at: new Date(Date.now() + 60_000), state: "INTENDED", verified_etag: null,
  }));
  mocks.head.mockResolvedValue({ url: `https://${host}/${pathname}`, pathname, size: bytes.length, contentType: "application/pdf", etag: "etag-1" });
  mocks.get.mockImplementation(async () => ({
    statusCode: 200,
    blob: { url: `https://${host}/${pathname}`, pathname, size: bytes.length, contentType: "application/pdf", etag: "etag-1" },
    stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
  }));
  mocks.issue.mockResolvedValue(id);
  mocks.ipReserve.mockResolvedValue({ blocked: false, retryAfterSec: 0 });
  mocks.receipt.mockResolvedValue({ storageKey: pathname });
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("API v1 업로드 의도·검증·취소 연결", () => {
  it("발급 결과는 서버가 발급한 의도 ID·정확한 SDK 경로·만료 시각만 제공한다", async () => {
    const response = await createIntent(request("/intents", input));
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ uploadIntentId: id, pathname, expiresAt: expect.stringMatching(/Z$/) });
    expect(mocks.target).toHaveBeenCalledWith({ assignmentId });
    expect(mocks.reserve).toHaveBeenCalledWith(id, targetId, "intent");
    expect(mocks.issue).toHaveBeenCalledWith({ ...input, targetId, userId: id });
  });

  it.each([null, "https://other.invalid"])("Origin %s는 현재 대상·원장 조회 전에 거부한다", async (origin) => {
    await expectError(await createIntent(request("/intents", input, { origin })), 403, "FORBIDDEN");
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it.each([null, "text/plain"])("JSON 이외 Content-Type %s는 발급 전에 거부한다", async (type) => {
    await expectError(await createIntent(request("/intents", input, { type })), 400, "INVALID_INPUT");
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it.each(["/intents?owner=other", "/intents?page=1&page=2"])("미지원 query %s는 서비스 전에 거부한다", async (path) => {
    await expectError(await createIntent(request(path, input)), 400, "INVALID_INPUT");
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it.each([{}, { ...input, ownerId: id }, { ...input, originalName: "../합성.pdf" }, { ...input, sizeBytes: 52_428_801 }])("허용하지 않는 발급 입력은 안전한 400으로 거부한다", async (value) => {
    await expectError(await createIntent(request("/intents", value)), 400, "INVALID_INPUT");
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it("잘못된 JSON과 실제 16KiB 초과 본문은 서로 다른 공통 입력 오류로 끝난다", async () => {
    await expectError(await createIntent(request("/intents", "{")), 400, "INVALID_INPUT");
    await expectError(await createIntent(request("/intents", JSON.stringify({ extra: "x".repeat(16_385) }))), 413, "TOO_LARGE");
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it.each([["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["NOT_FOUND", 404]] as const)("서비스의 %s 거부를 v1 공통 계약으로 반환한다", async (code, status) => {
    mocks.target.mockRejectedValue(new AcademicAccessError(code));
    await expectError(await createIntent(request("/intents", input)), status, code);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("업로드 비활성화는 기존 서비스 gate를 유지하며 v1 DISABLED 503을 반환한다", async () => {
    vi.stubEnv("ACADEMIC_UPLOADS_ENABLED", "false");
    await expectError(await createIntent(request("/intents", input)), 503, "DISABLED");
    expect(mocks.target).not.toHaveBeenCalled();
  });

  it("요청 예산의 재시도 시간과 Retry-After를 보존한다", async () => {
    mocks.reserve.mockRejectedValue(new AcademicUploadError("RATE_LIMITED", 37));
    const response = await createIntent(request("/intents", input));
    expect(response.headers.get("retry-after")).toBe("37");
    expect((await expectError(response, 429, "RATE_LIMITED")).error.retryAfterSeconds).toBe(37);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it("실제 PDF 검증 서비스가 원장 해시를 저장한 뒤 최소 상태만 반환한다", async () => {
    const response = await verifyIntent(request(`/${id}/verify`, { assignmentId }), params);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ state: "VERIFIED" });
    expect(mocks.persist).toHaveBeenCalledWith(id, id, expect.stringMatching(/^[0-9a-f]{64}$/), "etag-1");
    expect(mocks.reserve).toHaveBeenCalledWith(id, targetId, "external");
  });

  it("저장소 오류 원문은 노출하지 않고 STORAGE_UNAVAILABLE로 변환한다", async () => {
    mocks.head.mockRejectedValue(new Error(`SELECT private://${host}/${pathname} ${token}`));
    await expectError(await verifyIntent(request(`/${id}/verify`, { assignmentId }), params), 503, "STORAGE_UNAVAILABLE");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("미완료 객체는 CONFLICT이고 실제 객체가 유효해진 뒤 같은 의도로 검증할 수 있다", async () => {
    mocks.get.mockResolvedValueOnce(null);
    await expectError(await verifyIntent(request(`/${id}/verify`, { assignmentId }), params), 409, "CONFLICT");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect((await verifyIntent(request(`/${id}/verify`, { assignmentId }), params)).status).toBe(200);
  });

  it("취소는 현재 대상의 원장을 종료하고 객체 삭제나 검증을 요청하지 않는다", async () => {
    const response = await cancelIntent(request(`/intents/${id}`, { assignmentId }, { method: "DELETE" }), params);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ state: "CANCELLED" });
    expect(mocks.retire).toHaveBeenCalledWith(id, id, targetId);
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("잘못된 경로 UUID와 위조 파일 메타는 검증·취소 서비스 전에 차단한다", async () => {
    const invalid = { params: Promise.resolve({ id: "invalid" }) };
    await expectError(await verifyIntent(request("/invalid/verify", { assignmentId }), invalid), 404, "NOT_FOUND");
    await expectError(await cancelIntent(request("/intents/invalid", { assignmentId }, { method: "DELETE" }), invalid), 404, "NOT_FOUND");
    await expectError(await verifyIntent(request(`/${id}/verify`, { assignmentId, fileUrl: "private://forged" }), params), 400, "INVALID_INPUT");
    expect(mocks.target).not.toHaveBeenCalled();
  });
});

describe("API v1 실제 SDK 토큰·서명 callback", () => {
  const tokenBody = () => ({ type: "blob.generate-client-token", payload: { pathname, multipart: false, clientPayload: JSON.stringify(selection) } });

  it("현재 대상·발급 원장·정확한 경로·두 요청 예산 확인 뒤에만 SDK 토큰을 발급한다", async () => {
    const response = await protocol(request("", tokenBody()));
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toMatchObject({ type: "blob.generate-client-token", clientToken: expect.any(String) });
    expect(mocks.target).toHaveBeenCalledWith({ assignmentId });
    expect(mocks.reserve).toHaveBeenCalledWith(id, targetId, "external");
    expect(mocks.ipReserve).toHaveBeenCalledOnce();
  });

  it.each([null, "https://other.invalid"])("토큰 요청 Origin %s는 callback 예외를 사용할 수 없다", async (origin) => {
    await expectError(await protocol(request("", tokenBody(), { origin })), 404, "NOT_FOUND");
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.ipReserve).not.toHaveBeenCalled();
  });

  it("서비스 거부와 IP 예산 초과 시 토큰이 응답에 포함되지 않는다", async () => {
    mocks.target.mockRejectedValueOnce(new AcademicAccessError("FORBIDDEN"));
    await expectError(await protocol(request("", tokenBody())), 403, "FORBIDDEN");
    mocks.ipReserve.mockResolvedValueOnce({ blocked: true, retryAfterSec: 23 });
    const limited = await protocol(request("", tokenBody()));
    expect(limited.headers.get("retry-after")).toBe("23");
    await expectError(limited, 429, "RATE_LIMITED");
  });

  it("본문 크기·JSON 형식·query는 SDK를 호출하기 전에 검사한다", async () => {
    await expectError(await protocol(request("?extra=1", tokenBody())), 400, "INVALID_INPUT");
    await expectError(await protocol(request("", tokenBody(), { type: "text/plain" })), 400, "INVALID_INPUT");
    await expectError(await protocol(request("", JSON.stringify({ extra: "x".repeat(16_385) }))), 413, "TOO_LARGE");
    expect(mocks.target).not.toHaveBeenCalled();
    expect(mocks.receipt).not.toHaveBeenCalled();
  });

  it("Origin 없는 공급자 callback은 추가 속성·키 순서 그대로 HMAC 검증하고 재전송에도 수신만 기록한다", async () => {
    const body = {
      extra: "provider-extra",
      payload: {
        extra: "payload-extra", tokenPayload: JSON.stringify({ uploadIntentId: id }),
        blob: { extra: "blob-extra", etag: "etag-1", contentDisposition: "attachment", contentType: "application/pdf",
          downloadUrl: `https://${host}/${pathname}?download=1`, pathname, url: `https://${host}/${pathname}` },
      },
      type: "blob.upload-completed",
    };
    const raw = JSON.stringify(body);
    const signature = createHmac("sha256", token).update(raw).digest("hex");
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await protocol(new Request("https://app.invalid/api/v1/uploads", {
        method: "POST", headers: { "Content-Type": "application/json", "x-vercel-signature": signature }, body: raw,
      }));
      expect(response.status).toBe(200);
      expectPrivate(response);
      expect(await response.json()).toEqual({ type: "blob.upload-completed", response: "ok" });
    }
    expect(mocks.record).toHaveBeenCalledTimes(2);
    expect(mocks.record).toHaveBeenCalledWith(id);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.target).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      action: "UPLOAD_RECEIPT", outcome: "COMPLETED", actorUserId: null, resourceId: id,
    }));
  });

  it("위조 서명 callback은 원장 조회·변경 전에 거부하고 공급자 오류를 노출하지 않는다", async () => {
    const body = { type: "blob.upload-completed", payload: {
      blob: { url: `https://${host}/${pathname}`, pathname, downloadUrl: `https://${host}/${pathname}?download=1`,
        contentType: "application/pdf", contentDisposition: "attachment", etag: "etag-1" },
      tokenPayload: JSON.stringify({ uploadIntentId: id }),
    } };
    const response = await protocol(new Request("https://app.invalid/api/v1/uploads", {
      method: "POST", headers: { "Content-Type": "application/json", "x-vercel-signature": "forged" }, body: JSON.stringify(body),
    }));
    await expectError(response, 503, "UNAVAILABLE");
    expect(mocks.receipt).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
