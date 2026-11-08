// @vitest-environment node
/** 서버 객체 생성 전에 확정 URL을 예약하고 실패 후에도 재조정 근거를 보존합니다 (#290). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn(), reserve: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.reserve }));
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";
import { projectBlobHost } from "@/lib/blob-host";

const userId = "11111111-1111-4111-8111-111111111111";
const input = { namespace: "weekly-texts" as const, extension: "pdf", body: new File(["%PDF-1.7"], "원본.pdf"), contentType: "application/pdf", uploadedById: userId, protectedResource: true };
let owned: Set<string>;
let objects: Set<string>;
let calls: string[];
beforeEach(() => {
  vi.resetAllMocks(); owned = new Set(); objects = new Set(); calls = [];
  vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
  mocks.reserve.mockImplementation(async (url: string) => { calls.push("reserve"); owned.add(url); });
  mocks.put.mockImplementation(async (path: string, _body: unknown, options: { access: string }) => {
    calls.push("put");
    const url = `https://${options.access === "private" ? "example.private.blob.vercel-storage.com" : projectBlobHost}/${path}`;
    objects.add(url); return { url };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("서버 업로드 의도 예약", () => {
  it("UUID URL을 예약한 뒤 같은 경로를 덮어쓰기 없이 저장한다", async () => {
    const url = await uploadWithOwnedIntent(input);
    expect(calls).toEqual(["reserve", "put"]);
    expect(mocks.reserve).toHaveBeenCalledWith(url, userId);
    expect(url).toMatch(new RegExp(`^https://${projectBlobHost}/weekly-texts/[0-9a-f-]{36}\\.pdf$`));
    expect(mocks.put).toHaveBeenCalledWith(new URL(url).pathname.slice(1), input.body,
      { access: "public", contentType: "application/pdf", addRandomSuffix: false, allowOverwrite: false });
    expect(owned).toEqual(objects);
  });

  it.each([false, true])("예약 응답 실패(실제 예약=%s) 시 객체를 생성하지 않는다", async committed => {
    mocks.reserve.mockImplementationOnce(async url => { if (committed) owned.add(url); throw new Error("원장 응답 유실"); });
    await expect(uploadWithOwnedIntent(input)).rejects.toThrow("원장 응답 유실");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(owned.size).toBe(committed ? 1 : 0);
  });

  it.each([false, true])("객체 업로드 응답 실패(실제 객체=%s) 시 예약을 보존한다", async committed => {
    mocks.put.mockImplementationOnce(async path => { if (committed) objects.add(`https://${projectBlobHost}/${path}`); throw new Error("업로드 응답 유실"); });
    await expect(uploadWithOwnedIntent(input)).rejects.toThrow("업로드 응답 유실");
    expect(owned.size).toBe(1);
    expect(objects.size).toBe(committed ? 1 : 0);
    for (const url of objects) expect(owned.has(url)).toBe(true);
  });

  it("재시도는 새 UUID를 사용해 이전 객체와 예약을 덮어쓰지 않는다", async () => {
    const first = await uploadWithOwnedIntent(input);
    const second = await uploadWithOwnedIntent(input);
    expect(second).not.toBe(first);
    expect(owned.size).toBe(2); expect(objects).toEqual(owned);
  });

  it("운영 보호 자료가 공개 fallback 설정이면 의도 예약·객체 업로드 모두 시작하지 않는다", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
    await expect(uploadWithOwnedIntent(input)).rejects.toThrow(
      "운영 보호 자료 저장소가 비활성화되어 있습니다.",
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();

    // 같은 Production에서도 공개 포스터는 자료실의 보호 대상이 아닙니다.
    const poster = await uploadWithOwnedIntent({
      ...input, protectedResource: false, namespace: "recruitment",
    });
    expect(poster).toContain(projectBlobHost);
    expect(mocks.put.mock.calls[0][2].access).toBe("public");
  });

  it("보호 자료는 비공개 저장소 URL을 예약하고 해당 토큰을 사용한다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "example.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "synthetic-private-token");
    const url = await uploadWithOwnedIntent(input);
    expect(mocks.reserve).toHaveBeenCalledWith(url, userId);
    expect(url).toMatch(/^https:\/\/example\.private\.blob\.vercel-storage\.com\//);
    expect(mocks.put.mock.calls[0][2]).toMatchObject({ access: "private", token: "synthetic-private-token" });
  });

  it("공개 포스터는 보호 자료 플래그가 켜져도 공개 호스트에 예약한다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    const url = await uploadWithOwnedIntent({ ...input, namespace: "recruitment", protectedResource: false });
    expect(new URL(url).hostname).toBe(projectBlobHost);
    expect(mocks.put.mock.calls[0][2]).not.toHaveProperty("token");
  });

  it("저장 설정 누락·잘못된 확장자·다른 응답 URL을 콘텐츠에 연결하지 않는다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true"); vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "");
    await expect(uploadWithOwnedIntent(input)).rejects.toThrow("비공개 자료 저장소 설정");
    expect(mocks.reserve).not.toHaveBeenCalled();
    await expect(uploadWithOwnedIntent({ ...input, extension: "../png" })).rejects.toThrow("확장자");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
    mocks.put.mockResolvedValueOnce({ url: "https://unexpected.example/file.pdf" });
    await expect(uploadWithOwnedIntent(input)).rejects.toThrow("저장 경로");
    expect(owned.size).toBe(1);
  });
});
