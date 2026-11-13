/** 모집 포스터 직접 업로드의 크기·역할·경로·실물 검증을 확인합니다 (#102). */
import { syntheticPng } from "../support/synthetic-image";
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  handleUpload: vi.fn(),
  upload: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  recordUpload: vi.fn(),
  recordOwnedBlob: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload, upload: mocks.upload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head, put: mocks.put }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordUpload }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/poster-uploads/route";
import {
  posterUploadPath,
  maxPosterImageBytes,
  posterUploadTargetId,
} from "@/lib/poster-upload-contract";
import { preparePosterUpload } from "@/lib/poster-upload-client";
import { prepareStoredPoster, validatePosterImageReference } from "@/lib/poster-upload-server";
import { projectBlobHost } from "@/lib/blob-host";
import sharp from "sharp";

const posterId = posterUploadTargetId;
const userId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const pathname = posterUploadPath(posterId, userId, uploadId, "png");
const url = `https://${projectBlobHost}/${pathname}`;
const input = {
  posterId,
  uploadId,
  fileName: "사진.png",
  size: maxPosterImageBytes,
  contentType: "image/png",
};

async function issueToken(payload = input, path = pathname, request?: Request) {
  mocks.handleUpload.mockImplementation(
    async (options: {
      onBeforeGenerateToken: (path: string, payload: string) => Promise<unknown>;
    }) => options.onBeforeGenerateToken(path, JSON.stringify(payload)),
  );
  return POST(
    request ??
      new Request("https://hra.example/api/poster-uploads", {
        method: "POST",
        headers: { origin: "https://hra.example" },
        body: JSON.stringify({ type: "blob.generate-client-token" }),
      }),
  );
}

describe("모집 포스터 직접 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.head.mockResolvedValue({
      url,
      pathname,
      size: maxPosterImageBytes,
      contentType: "image/png",
    });
    mocks.fetch.mockResolvedValue(
      new Response(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), { status: 206 }),
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  directUploadOriginCases({
    route: "/api/poster-uploads",
    issue: (request) => issueToken(input, pathname, request),
    authCount: () => mocks.auth.mock.calls.length,
    recordCount: () => mocks.recordUpload.mock.calls.length,
  });

  it("10MB 경계와 GIF를 허용하고 초과·타 경로·비관리자를 거부한다", async () => {
    const response = await issueToken();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      maximumSizeInBytes: maxPosterImageBytes,
      allowedContentTypes: ["image/png"],
    });
    expect((await issueToken({ ...input, size: maxPosterImageBytes + 1 })).status).toBe(400);
    expect(
      (await issueToken(input, posterUploadPath(uploadId, userId, uploadId, "png"))).status,
    ).toBe(400);
    expect(
      (
        await issueToken(
          { ...input, fileName: "사진.gif", contentType: "image/gif" },
          posterUploadPath(posterId, userId, uploadId, "gif"),
        )
      ).status,
    ).toBe(200);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await issueToken()).status).toBe(400);
  });

  it("브라우저가 직접 보내고 서버 액션에는 URL만 전달한다", async () => {
    mocks.upload.mockResolvedValue({ url });
    const formData = new FormData();
    formData.set("posterFile", new File([syntheticPng()], "사진.png", { type: "image/png" }));
    const result = await preparePosterUpload(formData, userId);
    expect("formData" in result).toBe(true);
    expect(formData.has("posterFile")).toBe(false);
    expect(formData.get("uploadedPosterUrl")).toBe(url);
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^poster-uploads\//),
      expect.any(File),
      expect.objectContaining({ handleUploadUrl: "/api/poster-uploads" }),
    );
  });

  it("완료 콜백은 외부 URL과 경로 위조를 거부한다", async () => {
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
        new Request("https://hra.example/api/poster-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "blob.upload-completed" }),
        }),
      );
    };
    expect((await complete("https://evil.example/photo.png")).status).toBe(400);
    expect((await complete(url, "poster-uploads/other.png")).status).toBe(400);
    expect((await complete(url)).status).toBe(200);
  });

  it("저장 전 URL·소유자·크기·실제 바이트를 검증한다", async () => {
    expect(await validatePosterImageReference(posterId, userId, url)).toBe(true);
    expect(
      await validatePosterImageReference(posterId, userId, "https://evil.example/photo.png"),
    ).toBe(false);
    expect(await validatePosterImageReference(posterId, uploadId, url)).toBe(false);
    mocks.head.mockResolvedValueOnce({
      url,
      pathname,
      size: maxPosterImageBytes + 1,
      contentType: "image/png",
    });
    expect(await validatePosterImageReference(posterId, userId, url)).toBe(false);
    mocks.fetch.mockResolvedValueOnce(new Response("not an image", { status: 206 }));
    expect(await validatePosterImageReference(posterId, userId, url)).toBe(false);
  });

  it("검증된 원본을 WebP로 변환하고 변환 결과의 소유권을 선예약한다", async () => {
    const original = await sharp({
      create: { width: 1, height: 1, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    mocks.fetch.mockResolvedValueOnce(new Response(new Uint8Array(original), { status: 206 }));
    mocks.fetch.mockResolvedValueOnce(new Response(new Uint8Array(original), { status: 200 }));
    mocks.put.mockImplementation(async (path: string) => ({
      url: `https://${projectBlobHost}/${path}`,
    }));
    const convertedUrl = await prepareStoredPoster(url, userId);
    expect(convertedUrl).toMatch(
      new RegExp(`^https://${projectBlobHost}/recruitment/[0-9a-f-]{36}\\.webp$`),
    );
    const webp = mocks.put.mock.calls[0]?.[1];
    expect(Buffer.isBuffer(webp)).toBe(true);
    if (Buffer.isBuffer(webp)) expect(webp.toString("ascii", 0, 4)).toBe("RIFF");
    expect(mocks.recordUpload).toHaveBeenCalledWith(convertedUrl, userId);
    expect(mocks.recordUpload.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.put.mock.invocationCallOrder[0],
    );
  });

  it("전체 디코딩에 실패한 직접 업로드 포스터를 원본 URL로 저장하지 않는다", async () => {
    const damaged = syntheticPng().slice(0, 12);
    mocks.fetch.mockResolvedValueOnce(new Response(damaged, { status: 206 }));
    mocks.fetch.mockResolvedValueOnce(new Response(damaged, { status: 200 }));
    await expect(prepareStoredPoster(url, userId)).rejects.toThrow(
      "포스터 이미지 변환에 실패했습니다.",
    );
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.recordUpload).toHaveBeenCalledTimes(1);
  });
});
