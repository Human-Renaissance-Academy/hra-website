/** 편집기 직접 업로드의 붙여넣기 파일·권한·서명·소유권 경계를 검증합니다 (#102). */
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  handleUpload: vi.fn(),
  upload: vi.fn(),
  head: vi.fn(),
  recordUpload: vi.fn(),
  findAsset: vi.fn(),
  reserveUploadAttempt: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload, upload: mocks.upload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordUpload }));
vi.mock("@/lib/db", () => ({
  db: { query: { markdownImageAssets: { findFirst: mocks.findAsset } } },
}));
vi.mock("@/lib/rate-limit", () => ({ reserveUploadAttempt: mocks.reserveUploadAttempt }));
vi.mock("@/lib/rate-limit-core", () => ({ extractClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/editor-image-uploads/route";
import { uploadEditorImage } from "@/lib/editor-image-upload-client";
import { validateEditorImageReference } from "@/lib/editor-image-upload-server";
import { editorImagePath } from "@/lib/editor-image-upload-contract";
import { projectBlobHost } from "@/lib/blob-host";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const pathname = editorImagePath(uploadId, "png");
const url = `https://${projectBlobHost}/${pathname}`;
const pngHeader = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

async function issueToken(size = 10 * 1024 * 1024, path = pathname, request?: Request) {
  mocks.handleUpload.mockImplementation(
    async (options: {
      onBeforeGenerateToken: (pathname: string, payload: string) => Promise<unknown>;
    }) => options.onBeforeGenerateToken(path, JSON.stringify({ uploadId, extension: "png", size })),
  );
  return POST(
    request ??
      new Request("https://hra.example/api/editor-image-uploads", {
        method: "POST",
        headers: { origin: "https://hra.example" },
        body: JSON.stringify({ type: "blob.generate-client-token" }),
      }),
  );
}

describe("편집기 이미지 직접 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    mocks.reserveUploadAttempt.mockResolvedValue({ blocked: false, retryAfterSec: 0 });
    mocks.head.mockResolvedValue({
      url,
      pathname,
      size: 10 * 1024 * 1024,
      contentType: "image/png",
    });
    mocks.findAsset.mockResolvedValue({ uploadedById: userId, deletedAt: null });
    mocks.fetch.mockImplementation(async () => new Response(pngHeader, { status: 206 }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  directUploadOriginCases({
    route: "/api/editor-image-uploads",
    issue: (request) => issueToken(10 * 1024 * 1024, pathname, request),
    authCount: () => mocks.auth.mock.calls.length,
    recordCount: () => mocks.recordUpload.mock.calls.length,
  });

  it("이름·MIME이 없는 붙여넣기 PNG를 직접 올리고 서버 검증 뒤 URL을 반환한다", async () => {
    mocks.upload.mockResolvedValue({ url });
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const file = new File([pngHeader], "", { type: "" });
    expect(await uploadEditorImage(file)).toBe(url);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^editor-images\/.+\.png$/),
      file,
      expect.objectContaining({
        contentType: "image/png",
        handleUploadUrl: "/api/editor-image-uploads",
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      "/api/editor-image-uploads",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("SVG와 10MB 초과 파일은 업로드하지 않는다", async () => {
    await expect(
      uploadEditorImage(new File(["<svg/>"], "image.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow();
    await expect(
      uploadEditorImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png")),
    ).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("승인된 회원에게만 정확히 10MB 토큰을 발급한다", async () => {
    expect((await issueToken()).status).toBe(200);
    expect(mocks.recordUpload).toHaveBeenCalledWith(url, userId);
    expect((await issueToken(10 * 1024 * 1024 + 1)).status).toBe(400);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "PENDING" } });
    expect((await issueToken()).status).toBe(400);
    mocks.auth.mockResolvedValue(null);
    expect((await issueToken()).status).toBe(400);
  });

  it("다른 경로와 요청 제한 초과를 거부한다", async () => {
    expect((await issueToken(100, editorImagePath(otherUserId, "png"))).status).toBe(400);
    mocks.reserveUploadAttempt.mockResolvedValue({ blocked: true, retryAfterSec: 60 });
    expect((await issueToken(100)).status).toBe(400);
  });

  it("완료 URL의 실제 이미지 형식과 원장 소유자를 확인한다", async () => {
    expect(await validateEditorImageReference(userId, url)).toBe(true);
    mocks.findAsset.mockResolvedValue({ uploadedById: otherUserId, deletedAt: null });
    expect(await validateEditorImageReference(userId, url)).toBe(false);
    mocks.findAsset.mockResolvedValue({ uploadedById: userId, deletedAt: null });
    mocks.fetch.mockResolvedValue(new Response("not an image", { status: 206 }));
    expect(await validateEditorImageReference(userId, url)).toBe(false);
  });

  it("완료 콜백의 외부 URL·다른 경로를 거부한다", async () => {
    const payload = JSON.stringify({ uploadId, extension: "png", userId, pathname });
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
        new Request("https://hra.example/api/editor-image-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "blob.upload-completed" }),
        }),
      );
    };
    expect((await complete("https://evil.example/photo.png")).status).toBe(400);
    expect((await complete(url, "editor-images/other.png")).status).toBe(400);
    expect((await complete(url)).status).toBe(200);
    expect(mocks.recordUpload).toHaveBeenCalledExactlyOnceWith(url, userId);
  });

  it("삽입 전 검증은 비로그인과 타인 URL을 거부한다", async () => {
    const verify = () =>
      POST(
        new Request("https://hra.example/api/editor-image-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "editor.verify", url }),
        }),
      );
    mocks.auth.mockResolvedValue(null);
    expect((await verify()).status).toBe(403);
    mocks.auth.mockResolvedValue({ user: { id: otherUserId, role: "MEMBER" } });
    expect((await verify()).status).toBe(400);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await verify()).status).toBe(200);
  });
});
