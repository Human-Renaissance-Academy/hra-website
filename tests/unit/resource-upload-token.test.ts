/** #102 직접 업로드 토큰 발급의 권한·대상·형식·크기 경계를 확인합니다. */
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  handleUpload: vi.fn(),
  head: vi.fn(),
  recordResourceUpload: vi.fn(),
  userLimit: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/resource-upload-server", () => ({
  recordResourceUpload: mocks.recordResourceUpload,
}));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.userLimit }) }) }) },
}));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { GET, POST } from "@/app/api/resource-uploads/route";
import { projectBlobHost } from "@/lib/blob-host";
import { resourceUploadPath, type ResourceUploadKind } from "@/lib/resource-upload-contract";

const userId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";

type TokenInput = {
  kind: ResourceUploadKind;
  fileName: string;
  size: number;
  contentType: string;
  uploadId: string;
};

async function issueToken(
  input: TokenInput,
  pathname = resourceUploadPath(input.kind, userId, input.uploadId, input.fileName),
  request?: Request,
) {
  mocks.handleUpload.mockImplementation(
    async (options: {
      onBeforeGenerateToken: (path: string, payload: string) => Promise<unknown>;
    }) => options.onBeforeGenerateToken(pathname, JSON.stringify(input)),
  );
  return POST(
    request ??
      new Request("https://hra.example/api/resource-uploads", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://hra.example" },
        body: JSON.stringify({ type: "blob.generate-client-token" }),
      }),
  );
}

describe("자료실 직접 업로드 토큰", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.userLimit.mockResolvedValue([{ cohortId: uploadId }]);
  });

  afterEach(() => vi.unstubAllEnvs());

  directUploadOriginCases({
    route: "/api/resource-uploads",
    issue: (request) =>
      issueToken(
        {
          kind: "guidebooks",
          fileName: "합성.pdf",
          size: 100,
          contentType: "application/pdf",
          uploadId,
        },
        undefined,
        request,
      ),
    recordCount: () => mocks.recordResourceUpload.mock.calls.length,
  });

  it("정확히 30MB 가이드북에 제한된 토큰만 발급한다", async () => {
    const input = {
      kind: "guidebooks" as const,
      fileName: "책.pdf",
      size: 30 * 1024 * 1024,
      contentType: "application/pdf",
      uploadId,
    };
    const response = await issueToken(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      allowedContentTypes: ["application/pdf"],
      maximumSizeInBytes: 30 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    expect(mocks.recordResourceUpload).toHaveBeenCalledExactlyOnceWith(
      `https://${projectBlobHost}/${resourceUploadPath(input.kind, userId, uploadId, input.fileName)}`,
      userId,
    );
  });

  it("초과 크기·다른 사용자 경로·잘못된 확장자·MIME을 거부한다", async () => {
    const valid = {
      kind: "guidebooks" as const,
      fileName: "책.pdf",
      size: 100,
      contentType: "application/pdf",
      uploadId,
    };
    expect((await issueToken({ ...valid, size: 30 * 1024 * 1024 + 1 })).status).toBe(400);
    expect(
      (
        await issueToken(
          valid,
          resourceUploadPath("guidebooks", uploadId, uploadId, valid.fileName),
        )
      ).status,
    ).toBe(400);
    expect((await issueToken({ ...valid, fileName: "책.exe" })).status).toBe(400);
    expect((await issueToken({ ...valid, contentType: "image/png" })).status).toBe(400);
  });

  it("교수는 강의 자료만, 비로그인 사용자는 어떤 토큰도 발급받지 못한다", async () => {
    const input = {
      kind: "guidebooks" as const,
      fileName: "책.pdf",
      size: 100,
      contentType: "application/pdf",
      uploadId,
    };
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "FACULTY" } });
    expect((await issueToken(input)).status).toBe(400);
    expect((await issueToken({ ...input, kind: "class-materials" })).status).toBe(200);
    mocks.auth.mockResolvedValue(null);
    expect((await issueToken({ ...input, kind: "class-materials" })).status).toBe(400);
  });

  it("기수가 배정된 회원에게만 30MB 주차별 텍스트 문서 토큰을 발급한다", async () => {
    const input = {
      kind: "weekly-texts" as const,
      fileName: "읽기자료.pdf",
      size: 30 * 1024 * 1024,
      contentType: "application/pdf",
      uploadId,
    };
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await issueToken(input)).status).toBe(200);
    expect((await issueToken({ ...input, size: input.size + 1 })).status).toBe(400);
    expect((await issueToken({ ...input, fileName: "자료.pptx" })).status).toBe(400);
    mocks.userLimit.mockResolvedValue([]);
    expect((await issueToken(input)).status).toBe(400);
  });

  it("완료 콜백의 URL·경로 위조를 거부하고 실제 Blob만 원장에 남긴다", async () => {
    const pathname = resourceUploadPath("guidebooks", userId, uploadId, "책.pdf");
    const tokenPayload = JSON.stringify({
      kind: "guidebooks",
      fileName: "책.pdf",
      uploadId,
      userId,
      pathname,
    });
    const invoke = async (url: string, blobPath = pathname) => {
      mocks.handleUpload.mockImplementation(
        async (options: {
          onUploadCompleted: (event: {
            blob: { url: string; pathname: string };
            tokenPayload: string;
          }) => Promise<void>;
        }) => {
          await options.onUploadCompleted({ blob: { url, pathname: blobPath }, tokenPayload });
          return { type: "blob.upload-completed", response: "ok" };
        },
      );
      return POST(
        new Request("https://hra.example/api/resource-uploads", {
          method: "POST",
          body: JSON.stringify({ type: "blob.upload-completed" }),
        }),
      );
    };

    expect((await invoke("https://evil.example/book.pdf")).status).toBe(400);
    const validUrl = `https://${projectBlobHost}/${pathname}`;
    expect((await invoke(validUrl, "guidebooks/other.pdf")).status).toBe(400);
    mocks.head.mockResolvedValue({ url: validUrl, pathname });
    expect((await invoke(validUrl)).status).toBe(200);
    expect(mocks.recordResourceUpload).toHaveBeenCalledExactlyOnceWith(validUrl, userId);
  });

  it("운영 Private Blob 전환 누락 시 공개 업로드 안내와 토큰 발급을 모두 차단", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
    const get = await GET();
    expect(get.status).toBe(503);
    expect(await get.json()).toEqual({ error: "업로드 저장소를 사용할 수 없습니다." });

    const response = await issueToken({
      kind: "guidebooks",
      fileName: "합성.pdf",
      size: 100,
      contentType: "application/pdf",
      uploadId,
    });
    expect(response.status).toBe(400);
    expect(mocks.handleUpload).not.toHaveBeenCalled();
    expect(mocks.recordResourceUpload).not.toHaveBeenCalled();
  });

  it("운영 Private Blob 전환 후에는 브라우저 업로드 설정과 토큰이 private만 제공", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "synthetic-protected-token");
    const get = await GET();
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ access: "private" });
    const token = await issueToken({
      kind: "guidebooks",
      fileName: "합성.pdf",
      size: 100,
      contentType: "application/pdf",
      uploadId,
    });
    expect(token.status).toBe(200);
    expect(mocks.handleUpload).toHaveBeenCalledWith(
      expect.objectContaining({ token: "synthetic-protected-token" }),
    );
    expect(mocks.recordResourceUpload.mock.calls[0][0]).toMatch(
      /^https:\/\/private123\.private\.blob\.vercel-storage\.com\//,
    );
  });

  it("비공개 전환 후 전용 토큰으로 발급하고 공개 완료 URL을 거부한다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "server-only-token");
    const input = {
      kind: "guidebooks" as const,
      fileName: "책.pdf",
      size: 100,
      contentType: "application/pdf",
      uploadId,
    };
    const pathname = resourceUploadPath(input.kind, userId, uploadId, input.fileName);
    expect((await issueToken(input)).status).toBe(200);
    expect(mocks.handleUpload).toHaveBeenCalledWith(
      expect.objectContaining({ token: "server-only-token" }),
    );
    expect(mocks.recordResourceUpload).toHaveBeenCalledWith(
      `https://private123.private.blob.vercel-storage.com/${pathname}`,
      userId,
    );
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "");
    expect((await issueToken(input)).status).toBe(400);
  });
});
