/** 갤러리 직접 업로드 토큰과 완료 URL의 권한·대상·실물 검증을 확인합니다 (#102). */
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  handleUpload: vi.fn(),
  upload: vi.fn(),
  head: vi.fn(),
  findGallery: vi.fn(),
  recordUpload: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload, upload: mocks.upload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/db", () => ({ db: { query: { galleries: { findFirst: mocks.findGallery } } } }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordUpload }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/gallery-uploads/route";
import { projectBlobHost } from "@/lib/blob-host";
import { galleryUploadPath } from "@/lib/gallery-upload-contract";
import { prepareGalleryUploads } from "@/lib/gallery-upload-client";
import { validateGalleryUploadReference } from "@/lib/gallery-upload-server";

const galleryId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const pathname = galleryUploadPath(galleryId, userId, uploadId, "png");
const url = `https://${projectBlobHost}/${pathname}`;
const input = {
  galleryId,
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
      new Request("https://hra.example/api/gallery-uploads", {
        method: "POST",
        headers: { origin: "https://hra.example" },
        body: JSON.stringify({ type: "blob.generate-client-token" }),
      }),
  );
}

describe("갤러리 직접 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.findGallery.mockResolvedValue({ id: galleryId });
    mocks.head.mockResolvedValue({
      url,
      pathname,
      size: 10 * 1024 * 1024,
      contentType: "image/png",
    });
    mocks.fetch.mockResolvedValue(
      new Response(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), { status: 206 }),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  directUploadOriginCases({
    route: "/api/gallery-uploads",
    issue: (request) => issueToken(input, pathname, request),
    authCount: () => mocks.auth.mock.calls.length,
    recordCount: () => mocks.recordUpload.mock.calls.length,
  });

  it("관리자의 10MB PNG만 해당 앨범 경로로 허용한다", async () => {
    const response = await issueToken();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      maximumSizeInBytes: 10 * 1024 * 1024,
      allowedContentTypes: ["image/png"],
    });
    expect(mocks.recordUpload).toHaveBeenCalledWith(url, userId);
  });

  it("브라우저는 파일을 직접 보내고 액션에는 URL만 넘긴다", async () => {
    mocks.upload.mockResolvedValue({ url });
    const formData = new FormData();
    formData.set(
      "images",
      new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], "사진.png", { type: "image/png" }),
    );
    const result = await prepareGalleryUploads(formData, galleryId, userId);
    expect("formData" in result).toBe(true);
    expect(formData.getAll("images")).toHaveLength(0);
    expect(formData.get("uploadedImageUrls")).toBe(JSON.stringify([url]));
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^gallery-uploads\//),
      expect.any(File),
      expect.objectContaining({ handleUploadUrl: "/api/gallery-uploads", access: "public" }),
    );
  });

  it("초과 크기·다른 경로·형식 불일치·없는 앨범을 거부한다", async () => {
    expect((await issueToken({ ...input, size: input.size + 1 })).status).toBe(400);
    expect(
      (await issueToken(input, galleryUploadPath(uploadId, userId, uploadId, "png"))).status,
    ).toBe(400);
    expect((await issueToken({ ...input, contentType: "image/jpeg" })).status).toBe(400);
    mocks.findGallery.mockResolvedValue(null);
    expect((await issueToken()).status).toBe(400);
  });

  it("비관리자와 비로그인 사용자는 토큰을 받지 못한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await issueToken()).status).toBe(400);
    mocks.auth.mockResolvedValue(null);
    expect((await issueToken()).status).toBe(400);
  });

  it("완료 콜백의 외부 URL·다른 경로를 거부한다", async () => {
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
        new Request("https://hra.example/api/gallery-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "blob.upload-completed" }),
        }),
      );
    };
    expect((await complete("https://evil.example/photo.png")).status).toBe(400);
    expect((await complete(url, "gallery-uploads/other.png")).status).toBe(400);
    expect((await complete(url)).status).toBe(200);
    expect(mocks.recordUpload).toHaveBeenCalledExactlyOnceWith(url, userId);
  });

  it("위조 URL·다른 사용자·초과 크기·잘못된 바이트를 저장 전에 거부한다", async () => {
    expect(await validateGalleryUploadReference(galleryId, userId, url)).toBe(true);
    expect(
      await validateGalleryUploadReference(galleryId, userId, "https://evil.example/image.png"),
    ).toBe(false);
    expect(await validateGalleryUploadReference(galleryId, uploadId, url)).toBe(false);
    mocks.head.mockResolvedValueOnce({
      url,
      pathname,
      size: input.size + 1,
      contentType: "image/png",
    });
    expect(await validateGalleryUploadReference(galleryId, userId, url)).toBe(false);
    mocks.fetch.mockResolvedValueOnce(new Response("not an image", { status: 206 }));
    expect(await validateGalleryUploadReference(galleryId, userId, url)).toBe(false);
  });
});
