/** 보호 자료 저장소 전환 중 설정 누락과 URL 혼용을 막는 계약을 검증합니다. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectBlobHost } from "@/lib/blob-host";
import { isCurrentResourceUploadUrl, resourceUploadStore } from "@/lib/resource-blob-store";

afterEach(() => vi.unstubAllEnvs());

describe("보호 자료 업로드 저장소", () => {
  it("전환 전에는 현재 공개 저장소를 사용한다", () => {
    expect(resourceUploadStore()).toEqual({ access: "public", host: projectBlobHost });
    expect(isCurrentResourceUploadUrl(`https://${projectBlobHost}/file.pdf`)).toBe(true);
  });

  it("Vercel Production에서는 비공개 전환 누락·꺼짐·오입력을 공개로 fallback하지 않는다", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", undefined);
    expect(() => resourceUploadStore()).toThrow("운영 보호 자료 저장소가 비활성화되어 있습니다.");
    expect(() => isCurrentResourceUploadUrl(`https://${projectBlobHost}/leaked.pdf`)).toThrow(
      "운영 보호 자료 저장소가 비활성화되어 있습니다.",
    );

    for (const value of ["false", "", "TRUE", "1", " true "]) {
      vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", value);
      expect(() => resourceUploadStore()).toThrow("운영 보호 자료 저장소가 비활성화되어 있습니다.");
    }
  });

  it("Vercel Production은 private 토큰·호스트 설정도 필수이며 누락되면 공개로 복귀하지 않는다", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    expect(() => resourceUploadStore()).toThrow("비공개 자료 저장소 설정이 완전하지 않습니다.");

    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "wrong.public.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "not-a-real-token");
    expect(() => resourceUploadStore()).toThrow("비공개 자료 저장소 설정이 완전하지 않습니다.");

    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    expect(resourceUploadStore()).toEqual({
      access: "private",
      host: "private123.private.blob.vercel-storage.com",
      token: "not-a-real-token",
      storeId: "private123",
    });
    expect(isCurrentResourceUploadUrl(`https://${projectBlobHost}/file.pdf`)).toBe(false);
    expect(
      isCurrentResourceUploadUrl("https://private123.private.blob.vercel-storage.com/file.pdf"),
    ).toBe(true);
  });

  it("Preview는 NODE_ENV=production이어도 기존 분리 검증용 공개 fallback이 유지된다", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
    expect(resourceUploadStore()).toEqual({ access: "public", host: projectBlobHost });
  });

  it("비공개 전환 시 호스트와 토큰 모두 필요하며 공개 URL은 거부한다", () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    expect(() => resourceUploadStore()).toThrow("비공개 자료 저장소 설정이 완전하지 않습니다.");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "private123.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "server-only-token");
    expect(resourceUploadStore()).toEqual({
      access: "private",
      host: "private123.private.blob.vercel-storage.com",
      token: "server-only-token",
      storeId: "private123",
    });
    expect(isCurrentResourceUploadUrl(`https://${projectBlobHost}/file.pdf`)).toBe(false);
    expect(
      isCurrentResourceUploadUrl("https://private123.private.blob.vercel-storage.com/file.pdf"),
    ).toBe(true);
    expect(
      isCurrentResourceUploadUrl(
        "https://private123.private.blob.vercel-storage.com.attacker.test/file.pdf",
      ),
    ).toBe(false);
  });
});
