/** 주차별 텍스트 사진 직접 업로드의 관리자 권한·크기·완료 URL 검증입니다 (#102). */
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  handleUpload: vi.fn(),
  upload: vi.fn(),
  head: vi.fn(),
  recordUpload: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload, upload: mocks.upload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordUpload }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/weekly-text-image-uploads/route";
import { prepareWeeklyTextImages } from "@/lib/weekly-text-image-upload-client";
import { validateWeeklyTextImageReference } from "@/lib/weekly-text-image-upload";
import { weeklyTextImagePath } from "@/lib/weekly-text-image-upload-contract";
import { projectBlobHost } from "@/lib/blob-host";

const requestId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const pathname = weeklyTextImagePath(requestId, userId, uploadId, "png");
const url = `https://${projectBlobHost}/${pathname}`;
const input = {
  requestId,
  uploadId,
  fileName: "사진.png",
  size: 10 * 1024 * 1024,
  contentType: "image/png",
};

async function issueToken(payload = input, path = pathname, request?: Request) {
  mocks.handleUpload.mockImplementation(
    async (options: {
      onBeforeGenerateToken: (pathname: string, payload: string) => Promise<unknown>;
    }) => options.onBeforeGenerateToken(path, JSON.stringify(payload)),
  );
  return POST(
    request ??
      new Request("https://hra.example/api/weekly-text-image-uploads", {
        method: "POST",
        headers: { origin: "https://hra.example" },
        body: JSON.stringify({ type: "blob.generate-client-token" }),
      }),
  );
}

describe("주차별 텍스트 사진 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.head.mockResolvedValue({ url, pathname, size: input.size, contentType: "image/png" });
    mocks.fetch.mockImplementation(async (input: string) =>
      input === "/api/weekly-text-image-uploads"
        ? Response.json({ access: "public" })
        : new Response(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), {
            status: 206,
          }),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => vi.unstubAllEnvs());

  directUploadOriginCases({
    route: "/api/weekly-text-image-uploads",
    issue: (request) => issueToken(input, pathname, request),
    authCount: () => mocks.auth.mock.calls.length,
    recordCount: () => mocks.recordUpload.mock.calls.length,
  });

  it("관리자에게만 10MB PNG 토큰을 발급한다", async () => {
    expect((await issueToken()).status).toBe(200);
    expect(mocks.recordUpload).toHaveBeenCalledWith(url, userId);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await issueToken()).status).toBe(400);
    mocks.auth.mockResolvedValue(null);
    expect((await issueToken()).status).toBe(400);
  });

  it("초과 크기·다른 요청 경로·형식 위조를 거부한다", async () => {
    expect((await issueToken({ ...input, size: input.size + 1 })).status).toBe(400);
    expect(
      (await issueToken(input, weeklyTextImagePath(uploadId, userId, uploadId, "png"))).status,
    ).toBe(400);
    expect((await issueToken({ ...input, contentType: "image/jpeg" })).status).toBe(400);
  });

  it("브라우저는 사진을 직접 올리고 액션에는 URL만 넘긴다", async () => {
    mocks.upload.mockResolvedValue({ url });
    const formData = new FormData();
    formData.set(
      "images",
      new File([Uint8Array.of(0x89, 0x50)], "사진.png", { type: "image/png" }),
    );
    const prepared = await prepareWeeklyTextImages(formData, requestId, userId);
    expect("formData" in prepared).toBe(true);
    expect(formData.getAll("images")).toHaveLength(0);
    expect(formData.get("uploadedImageUrls")).toBe(JSON.stringify([url]));
  });

  it("완료 콜백의 외부 URL과 다른 경로를 거부한다", async () => {
    const payload = JSON.stringify({ ...input, userId, pathname });
    const complete = async (blobUrl: string, blobPath = pathname) => {
      mocks.handleUpload.mockImplementation(
        async (options: {
          onUploadCompleted: (event: {
            blob: { url: string; pathname: string };
            tokenPayload: string;
          }) => Promise<void>;
        }) => {
          await options.onUploadCompleted({
            blob: { url: blobUrl, pathname: blobPath },
            tokenPayload: payload,
          });
          return { type: "blob.upload-completed" };
        },
      );
      return POST(
        new Request("https://hra.example/api/weekly-text-image-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "blob.upload-completed" }),
        }),
      );
    };
    expect((await complete("https://evil.example/photo.png")).status).toBe(400);
    expect((await complete(url, "weekly-text-images/other.png")).status).toBe(400);
    expect((await complete(url)).status).toBe(200);
    expect(mocks.recordUpload).toHaveBeenCalledExactlyOnceWith(url, userId);
    // 같은 완료 경로가 private 저장소의 전용 HEAD 토큰도 유지하는지 확인합니다.
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "server-only-token");
    const privateUrl = `https://private123.private.blob.vercel-storage.com/${pathname}`;
    mocks.head.mockResolvedValueOnce({
      url: privateUrl,
      pathname,
      size: input.size,
      contentType: "image/png",
    });
    expect((await complete(privateUrl)).status).toBe(200);
    expect(mocks.head).toHaveBeenLastCalledWith(privateUrl, { token: "server-only-token" });
    expect(mocks.recordUpload).toHaveBeenLastCalledWith(privateUrl, userId);
    expect(mocks.handleUpload).toHaveBeenLastCalledWith(
      expect.objectContaining({ token: "server-only-token" }),
    );
  });

  it("완료 URL의 경로·크기·실제 시작 바이트를 확인한다", async () => {
    expect(await validateWeeklyTextImageReference(requestId, userId, url)).toBe(true);
    expect(await validateWeeklyTextImageReference(requestId, uploadId, url)).toBe(false);
    mocks.head.mockResolvedValueOnce({
      url,
      pathname,
      size: input.size + 1,
      contentType: "image/png",
    });
    expect(await validateWeeklyTextImageReference(requestId, userId, url)).toBe(false);
    mocks.fetch.mockResolvedValueOnce(new Response("not an image", { status: 206 }));
    expect(await validateWeeklyTextImageReference(requestId, userId, url)).toBe(false);
  });
});
