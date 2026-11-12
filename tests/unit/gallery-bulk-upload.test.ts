/** 갤러리 직접 업로드 URL 검증, 중복 차단, DB 실패 시 파일 보존을 확인합니다 (#102). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), findGallery: vi.fn(), validateReference: vi.fn(),
  selectWhere: vi.fn(), insertValues: vi.fn(), updateWhere: vi.fn(),
  logServerError: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/gallery-upload-server", () => ({ validateGalleryUploadReference: mocks.validateReference }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  query: { galleries: { findFirst: mocks.findGallery } },
  select: () => ({ from: () => ({ where: mocks.selectWhere }) }),
  insert: () => ({ values: mocks.insertValues }),
  update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
} }));

import { addGalleryImages } from "@/features/gallery/actions";

const galleryId = "11111111-1111-4111-8111-111111111111";
const urls = [
  "https://example.public.blob.vercel-storage.com/gallery/first.png",
  "https://example.public.blob.vercel-storage.com/gallery/second.png",
];

function imagesForm(values: string[] = urls) {
  const formData = new FormData();
  formData.set("uploadedImageUrls", JSON.stringify(values));
  return formData;
}

describe("갤러리 직접 업로드 저장", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findGallery.mockResolvedValue({ id: galleryId, coverImageUrl: null, images: [] });
    mocks.requireAdmin.mockResolvedValue({ user: { id: galleryId, role: "ADMIN" } });
    mocks.validateReference.mockResolvedValue(true);
    mocks.selectWhere.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue([]);
    mocks.updateWhere.mockResolvedValue([]);
  });

  it("검증된 URL 두 건만 저장하고 첫 사진을 커버로 지정한다", async () => {
    const result = await addGalleryImages(galleryId, imagesForm());
    expect(result.success).toBe(true);
    expect(mocks.validateReference).toHaveBeenCalledTimes(2);
    expect(mocks.insertValues).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
  });

  it("위조된 URL 하나라도 있으면 이미지 행을 저장하지 않는다", async () => {
    mocks.validateReference.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = await addGalleryImages(galleryId, imagesForm());
    expect(result.success).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("중복 URL과 이미 등록된 URL을 거부한다", async () => {
    expect((await addGalleryImages(galleryId, imagesForm([urls[0], urls[0]]))).success).toBe(false);
    mocks.selectWhere.mockResolvedValue([{ url: urls[0] }]);
    expect((await addGalleryImages(galleryId, imagesForm())).success).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("INSERT 응답이 실패하면 원장의 파일을 보존한다", async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error("INSERT 응답 실패"));
    const result = await addGalleryImages(galleryId, imagesForm());
    expect(result.success).toBe(false);
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });

  it("커버 UPDATE만 실패하면 저장된 이미지의 부분 성공을 알린다", async () => {
    mocks.updateWhere.mockRejectedValueOnce(new Error("커버 UPDATE 실패"));
    const result = await addGalleryImages(galleryId, imagesForm());
    expect(result.success).toBe(true);
    expect(result.message).toContain("대표 사진 설정에 실패");
  });
});
