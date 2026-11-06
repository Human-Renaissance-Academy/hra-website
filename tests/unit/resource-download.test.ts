/**
 * 자료실 다운로드 경로의 저장소 제한·한글 파일명·공급자 스트림 종료 경계를 검증합니다.
 * 실제 route를 호출하고 SDK 타입에 맞는 합성 스트림으로 취소·지연 오류·reader 해제를 확인합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { get } from "@vercel/blob";
import { attachmentDisposition, isProjectBlobUrl, resourceBlobAccess } from "@/lib/resource-download";
import { projectBlobHost } from "@/lib/blob-host";

const mocks = vi.hoisted(() => ({
  get: vi.fn<typeof get>(),
  requireReader: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  logServerError: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
vi.mock("@/lib/resource-access", () => ({ requireSharedResourceReader: mocks.requireReader }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
// 사용자별 자료 조회 빈도 제한(#444)은 이 파일의 관심사가 아니므로 항상 허용합니다. 제한 동작은 resource-read-limit 테스트가 검증합니다.
vi.mock("@/lib/rate-limit", () => ({
  reserveResourceRead: async () => ({ blocked: false, retryAfterSec: 0, reservationId: null }),
}));

import { GET } from "@/app/api/resources/[kind]/[id]/download/route";

const id = "00000000-0000-4000-8000-000000000001";
const blobUrl = `https://${projectBlobHost}/materials/original-123.pdf`;
const safeStreamMessage = "파일 전송이 중단되었습니다.";
const providerDetail = "QA_ONLY_PROVIDER_DETAIL";
const nestedDetail = "QA_ONLY_NESTED_DETAIL";
type DownloadBlob = Extract<NonNullable<Awaited<ReturnType<typeof get>>>, { statusCode: 200 }>;

/** 설치된 SDK의 200 응답 타입을 충족하는 합성 메타데이터이며 외부 요청을 만들지 않습니다. */
function blobResult(stream: ReadableStream<Uint8Array>, contentType = "application/pdf", url = blobUrl): DownloadBlob {
  return { statusCode: 200, stream, headers: new Headers({ "Content-Type": contentType }), blob: {
    url, downloadUrl: url, pathname: new URL(url).pathname.slice(1), contentDisposition: "attachment",
    cacheControl: "private, no-store", uploadedAt: new Date("2026-10-17T00:00:00Z"),
    etag: '"qa-only-etag"', contentType, size: 3,
  } };
}

/** 오류 원문·중첩 cause가 응답이나 로깅 경계에 전달되지 않는지 직접 확인합니다. */
function expectSafeError(value: unknown, message?: string) {
  expect(value).toBeInstanceOf(Error);
  if (!(value instanceof Error)) throw new Error("고정 오류 객체가 필요합니다.");
  if (message) expect(value.message).toBe(message);
  else expect(value.message).toMatch(/[가-힣]/);
  expect(value.cause).toBeUndefined();
  for (const detail of [providerDetail, nestedDetail]) {
    expect(value.message).not.toContain(detail);
    expect(value.stack ?? "").not.toContain(detail);
  }
}

/** 타이머 없이 pull 진입과 종료 순서를 제어해 취소 경합을 결정적으로 검증합니다. */
function signal() {
  let complete: (() => void) | undefined;
  const promise = new Promise<void>(resolve => { complete = resolve; });
  return { promise, resolve() {
    if (!complete) throw new Error("합성 스트림 신호가 초기화되지 않았습니다.");
    complete();
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireReader.mockResolvedValue({ user: { id: "member-1", role: "MEMBER" } });
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: mocks.limit }) }) });
  mocks.limit.mockResolvedValue([{ fileUrl: blobUrl, fileName: "수업 자료.pdf" }]);
  mocks.get.mockResolvedValue(blobResult(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode("PDF")); controller.close(); },
  })));
});

afterEach(() => vi.unstubAllEnvs());

describe("자료실 다운로드", () => {
  it("한글 원본 파일명과 첨부 응답으로 내용을 스트리밍한다", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%EC%88%98%EC%97%85%20%EC%9E%90%EB%A3%8C.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("PDF");
    expect(mocks.get).toHaveBeenCalledWith(blobUrl, { access: "public" });
  });

  it("PDF 미리보기 요청만 인라인으로 전달하고 캐시를 막는다", async () => {
    const response = await GET(new Request("http://localhost?inline=1"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await response.body?.cancel();
  });

  it("이미지는 DB의 이미지 ID로만 읽고 실행 가능한 형식은 거부한다", async () => {
    mocks.get.mockResolvedValueOnce(blobResult(new ReadableStream<Uint8Array>(), "image/svg+xml"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "weekly-text-images", id }) });
    expect(response.status).toBe(404);
    mocks.get.mockResolvedValueOnce(blobResult(new ReadableStream<Uint8Array>(), "image/png"));
    const imageResponse = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "class-log-images", id }) });
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-disposition")).toBeNull();
    expect(imageResponse.headers.get("cache-control")).toBe("private, no-store");
    await imageResponse.body?.cancel();
  });

  it("등록된 비공개 저장소만 서버 토큰으로 읽는다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "server-only-token");
    const privateUrl = "https://private123.private.blob.vercel-storage.com/resources/test.pdf";
    mocks.limit.mockResolvedValue([{ fileUrl: privateUrl, fileName: "수업 자료.pdf" }]);
    mocks.get.mockResolvedValueOnce(blobResult(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("PDF")); controller.close(); },
    }), "application/pdf", privateUrl));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "class-materials", id }) });
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(privateUrl, {
      access: "private", token: "server-only-token", storeId: "private123", useCache: false,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await response.body?.cancel();
  });

  it("잘못된 종류·ID는 파일이나 DB를 조회하지 않는다", async () => {
    for (const params of [{ kind: "unknown", id }, { kind: "guidebooks", id: "bad" }]) {
      const response = await GET(new Request("http://localhost"), { params: Promise.resolve(params) });
      expect(response.status).toBe(404);
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("다른 저장소 URL이면 외부 요청을 보내지 않는다", async () => {
    mocks.limit.mockResolvedValue([{ fileUrl: "https://example.org/file.pdf", fileName: "자료.pdf" }]);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "weekly-texts", id }) });
    expect(response.status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("파일이 삭제되었으면 404를 반환한다", async () => {
    mocks.get.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "class-materials", id }) });
    expect(response.status).toBe(404);
  });
});

describe("다운로드 스트림 종료 경계", () => {
  it.each(["weekly-text-images", "class-log-images"])("%s의 MIME 거부는 공급자 스트림을 한 번 취소합니다", async kind => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    mocks.get.mockResolvedValueOnce(blobResult(source, "image/svg+xml"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind, id }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("파일을 찾을 수 없습니다.");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(source.locked).toBe(false);
  });

  it("MIME 거부 중 취소가 실패해도 원문을 노출하지 않고 404를 유지합니다", async () => {
    const cancel = vi.fn(async () => { throw new Error(providerDetail, { cause: new Error(nestedDetail) }); });
    const source = new ReadableStream<Uint8Array>({ cancel });
    mocks.get.mockResolvedValueOnce(blobResult(source, "image/svg+xml"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "weekly-text-images", id }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("파일을 찾을 수 없습니다.");
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(source.locked).toBe(false);
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    expectSafeError(mocks.logServerError.mock.calls[0]?.[1]);
  });

  it("정상 다중 청크는 원본을 유지하고 완료 후 공급자 reader 잠금을 해제합니다", async () => {
    const chunks = [new Uint8Array([80]), new Uint8Array([68, 70])];
    let position = 0;
    const source = new ReadableStream<Uint8Array>({ pull(controller) {
      if (position < chunks.length) controller.enqueue(chunks[position++]);
      else controller.close();
    } });
    mocks.get.mockResolvedValueOnce(blobResult(source));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("다운로드 응답 본문이 필요합니다.");
    try {
      const received: number[] = [];
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        received.push(...next.value);
      }
      expect(response.status).toBe(200);
      expect(received).toEqual([80, 68, 70]);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(source.locked).toBe(false);
      expect(mocks.logServerError).not.toHaveBeenCalled();
    } finally { reader.releaseLock(); }
  });

  it("읽기 중 늦은 pull 오류는 원문·cause 없는 고정 오류로 변환하고 잠금을 해제합니다", async () => {
    const original = new Error(providerDetail, { cause: new Error(nestedDetail) });
    let delivered = false;
    const source = new ReadableStream<Uint8Array>({ pull(controller) {
      if (delivered) throw original;
      delivered = true;
      controller.enqueue(new Uint8Array([80]));
    } });
    mocks.get.mockResolvedValueOnce(blobResult(source));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("다운로드 응답 본문이 필요합니다.");
    try {
      expect(await reader.read()).toEqual({ done: false, value: new Uint8Array([80]) });
      const failure: unknown = await reader.read().then(() => undefined, (error: unknown) => error);
      expect(failure).not.toBe(original);
      expectSafeError(failure, safeStreamMessage);
      expect(source.locked).toBe(false);
      expect(mocks.logServerError).toHaveBeenCalledTimes(1);
      expectSafeError(mocks.logServerError.mock.calls[0]?.[1]);
    } finally { reader.releaseLock(); }
  });

  it("응답 취소는 원문 사유를 전달하지 않고 공급자 취소를 한 번 호출합니다", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    mocks.get.mockResolvedValueOnce(blobResult(source));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    await response.body?.cancel(new Error(providerDetail, { cause: new Error(nestedDetail) }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(undefined);
    expect(source.locked).toBe(false);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it("공급자 취소의 실패도 원문을 전파하지 않고 잠금을 해제합니다", async () => {
    const cancel = vi.fn(async () => { throw new Error(providerDetail, { cause: new Error(nestedDetail) }); });
    const source = new ReadableStream<Uint8Array>({ cancel });
    mocks.get.mockResolvedValueOnce(blobResult(source));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("다운로드 응답 본문이 필요합니다.");
    try {
      await expect(reader.cancel()).resolves.toBeUndefined();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(source.locked).toBe(false);
      expect(mocks.logServerError).toHaveBeenCalledTimes(1);
      expectSafeError(mocks.logServerError.mock.calls[0]?.[1]);
    } finally { reader.releaseLock(); }
  });

  it("읽기 대기 중 취소와 늦은 pull 종료가 경합해도 중복 오류·잠금이 남지 않습니다", async () => {
    const entered = signal();
    const finishPull = signal();
    const pullFinished = signal();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      async pull() {
        entered.resolve();
        await finishPull.promise;
        pullFinished.resolve();
        throw new Error(providerDetail, { cause: new Error(nestedDetail) });
      }, cancel,
    });
    mocks.get.mockResolvedValueOnce(blobResult(source));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("다운로드 응답 본문이 필요합니다.");
    try {
      const pending = reader.read();
      await entered.promise;
      await reader.cancel();
      await expect(pending).resolves.toEqual({ done: true, value: undefined });
      finishPull.resolve();
      await pullFinished.promise;
      await Promise.resolve();
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(source.locked).toBe(false);
      expect(mocks.logServerError).not.toHaveBeenCalled();
    } finally {
      finishPull.resolve();
      reader.releaseLock();
    }
  });

  it.each(["/login", "/pending"])("%s 인가 거부는 DB·Blob 접근 전에 전파합니다", async path => {
    mocks.requireReader.mockRejectedValueOnce(new Error(`REDIRECT:${path}`));
    await expect(GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) }))
      .rejects.toThrow(`REDIRECT:${path}`);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });
});

describe("다운로드 입력 검증", () => {
  it("현재 프로젝트 저장소의 HTTPS URL만 허용한다", () => {
    expect(isProjectBlobUrl(blobUrl)).toBe(true);
    expect(isProjectBlobUrl(`http://${projectBlobHost}/file.pdf`)).toBe(false);
    expect(isProjectBlobUrl(`https://${projectBlobHost}.attacker.test/file.pdf`)).toBe(false);
    expect(isProjectBlobUrl(`https://${projectBlobHost}/file.pdf?redirect=1`)).toBe(false);
  });

  it("비공개 저장소는 지정된 정확한 호스트만 허용한다", () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    expect(resourceBlobAccess(blobUrl)).toBe("public");
    expect(resourceBlobAccess("https://private123.private.blob.vercel-storage.com/file.pdf")).toBe("private");
    expect(resourceBlobAccess("https://private123.private.blob.vercel-storage.com.attacker.test/file.pdf")).toBeNull();
    expect(resourceBlobAccess("https://private123.private.blob.vercel-storage.com/file.pdf?x=1")).toBeNull();
  });

  it("파일명으로 응답 헤더를 삽입할 수 없다", () => {
    const value = attachmentDisposition('한글/자료"\r\nSet-Cookie: bad.pdf');
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toContain("filename*=UTF-8''");
  });
});
