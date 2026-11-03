// @vitest-environment node
/**
 * 기존 파일의 소유권이 미확정인 교체·삭제 경로를 검증합니다 (#93).
 * DB 실패·0행·동시 변경에서 기존 Blob을 삭제하지 않는 것이 핵심입니다.
 */
import { syntheticPng } from "../support/synthetic-image";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  put: vi.fn(),
  selectWhere: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
  deleteWhere: vi.fn(),
  deleteReturning: vi.fn(),
  findGallery: vi.fn(),
  findGalleryImage: vi.fn(),
  findGuidebook: vi.fn(),
  findClassMaterial: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  revalidatePath: vi.fn(),
  logServerError: vi.fn(),
  redirect: vi.fn(),
  recordOwnedBlob: vi.fn(),
  recordResourceUpload: vi.fn(),
  validateResourceUploadReference: vi.fn(),
  validateAlumniImageReference: vi.fn(),
  validateFacultyImageReference: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/resource-upload-server", () => ({
  recordResourceUpload: mocks.recordResourceUpload,
  validateResourceUploadReference: mocks.validateResourceUploadReference,
}));
vi.mock("@/lib/alumni-upload-server", () => ({ validateAlumniImageReference: mocks.validateAlumniImageReference }));
vi.mock("@/lib/faculty-upload-server", () => ({ validateFacultyImageReference: mocks.validateFacultyImageReference }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      galleries: { findFirst: mocks.findGallery },
      galleryImages: { findFirst: mocks.findGalleryImage },
      guidebooks: { findFirst: mocks.findGuidebook },
      classMaterials: { findFirst: mocks.findClassMaterial },
    },
    select: () => ({ from: () => ({ where: mocks.selectWhere }) }),
    update: () => ({ set: (values: unknown) => {
      mocks.updateSet(values);
      return { where: mocks.updateWhere };
    } }),
    insert: () => ({ values: mocks.insertValues }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));

import { updateFaculty, deleteFaculty } from "@/features/faculty/actions";
import { deleteGallery, deleteGalleryImage } from "@/features/gallery/actions";
import { deleteGuidebook, updateGuidebook } from "@/features/guidebooks/actions";
import { deleteClassMaterial, updateClassMaterial } from "@/features/class-materials/actions";
import { deleteAlumniStory, updateAlumniStory } from "@/features/alumni/actions";
import { projectBlobHost } from "@/lib/blob-host";

const id = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const oldUrl = "https://example.public.blob.vercel-storage.com/faculty/old.png";
const newUrl = "https://example.public.blob.vercel-storage.com/faculty/new.png";
const uuidUrlPattern = (prefix: string) => new RegExp(`^https://${projectBlobHost}/${prefix}/[0-9a-f-]{36}\\.png$`);

function facultyForm() {
  const formData = new FormData();
  formData.set("name", "교수");
  formData.set("category", "CLASSICS");
  formData.set("order", "0");
  formData.set("image", new File([syntheticPng()], "new.png", { type: "image/png" }));
  return formData;
}

function fileForm(kind: "guidebook" | "classMaterial") {
  const formData = new FormData();
  formData.set("title", "새 자료");
  formData.set("uploadedFileUrl", newUrl);
  formData.set("uploadedFileName", "new.pdf");
  if (kind === "classMaterial") {
    formData.set("weekNumber", "");
    formData.set("lectureTitle", "");
    formData.set("audience", "FACULTY");
    formData.set("classDate", "");
  }
  return formData;
}

function alumniForm() {
  const formData = new FormData();
  formData.set("name", "수료생");
  formData.set("quote", "새 이야기");
  formData.set("content", "본문");
  formData.append("images", new File([syntheticPng()], "new.png", { type: "image/png" }));
  return formData;
}

describe("기존 Blob 보존", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id, role: "ADMIN" } });
    mocks.selectWhere.mockResolvedValue([{ imageUrl: oldUrl }]);
    mocks.put.mockImplementation(async (path: string) => ({ url: `https://${projectBlobHost}/${path}` }));
    mocks.recordOwnedBlob.mockResolvedValue(undefined);
    mocks.recordResourceUpload.mockResolvedValue(undefined);
    mocks.validateResourceUploadReference.mockResolvedValue({ url: newUrl, fileName: "new.pdf" });
    mocks.validateAlumniImageReference.mockResolvedValue(true);
    mocks.validateFacultyImageReference.mockResolvedValue(true);
    mocks.updateReturning.mockResolvedValue([{ id }]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.updateWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mocks.updateReturning }));
    mocks.deleteReturning.mockResolvedValue([{ id }]);
    mocks.deleteWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mocks.deleteReturning }));
    mocks.findGallery.mockResolvedValue({
      id, coverImageUrl: oldUrl, images: [{ id: imageId, url: oldUrl }],
    });
    mocks.findGalleryImage.mockResolvedValue({ id: imageId, url: oldUrl });
    mocks.findGuidebook.mockResolvedValue({ id, fileUrl: oldUrl });
    mocks.findClassMaterial.mockResolvedValue({ id, fileUrl: oldUrl });
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("교수진 새 사진 업로드가 실패하면 원장 예약만 남기고 이전 파일을 보존한다", async () => {
    mocks.put.mockRejectedValueOnce(new Error("업로드 실패"));

    await expect(updateFaculty(id, facultyForm())).rejects.toThrow("업로드 실패");
    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.recordResourceUpload).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(uuidUrlPattern("faculty")), id);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("교수진 DB UPDATE 실패와 0행 경합에서도 이전 파일을 보존한다", async () => {
    mocks.updateReturning.mockRejectedValueOnce(new Error("DB 실패"));
    await expect(updateFaculty(id, facultyForm())).rejects.toThrow("DB 실패");
    expect(mocks.recordResourceUpload).toHaveBeenCalledWith(expect.stringMatching(uuidUrlPattern("faculty")), id);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();

    mocks.updateReturning.mockResolvedValueOnce([]);
    const result = await updateFaculty(id, facultyForm());
    expect(result.success).toBe(false);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
    expect(mocks.recordResourceUpload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.put.mock.invocationCallOrder[0],
    );
    expect(mocks.put.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateReturning.mock.invocationCallOrder[0],
    );
  });

  it("교수진 삭제가 DB에서 실패해도 사진은 남는다", async () => {
    mocks.deleteWhere.mockRejectedValueOnce(new Error("DB 실패"));
    await expect(deleteFaculty(id)).rejects.toThrow("DB 실패");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("교수진 수정은 검증된 직접 업로드 사진만 저장한다", async () => {
    const formData = facultyForm();
    formData.delete("image");
    formData.set("uploadedImageUrl", newUrl);
    formData.set("uploadTargetId", id);
    await updateFaculty(id, formData);
    expect(mocks.validateFacultyImageReference).toHaveBeenCalledWith(id, id, newUrl);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: newUrl }));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("교수진 수정은 다른 대상의 사진 URL을 거부한다", async () => {
    const formData = facultyForm();
    formData.delete("image");
    formData.set("uploadedImageUrl", newUrl);
    formData.set("uploadTargetId", imageId);
    const result = await updateFaculty(id, formData);
    expect(result.success).toBe(false);
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });

  it("갤러리와 개별 사진의 DB 삭제 실패 시 파일은 남는다", async () => {
    mocks.deleteReturning.mockRejectedValueOnce(new Error("앨범 삭제 실패"));
    await expect(deleteGallery(id)).rejects.toThrow("앨범 삭제 실패");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();

    mocks.deleteReturning.mockRejectedValueOnce(new Error("사진 삭제 실패"));
    await expect(deleteGalleryImage(id, imageId)).rejects.toThrow("사진 삭제 실패");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("사진 삭제 후 대표 사진 갱신 실패는 부분 성공으로 알리고 파일 정리에 넘긴다", async () => {
    mocks.updateWhere.mockRejectedValueOnce(new Error("대표 사진 갱신 실패"));

    const result = await deleteGalleryImage(id, imageId);

    expect(result.success).toBe(true);
    expect(result.message).toContain("대표 사진 갱신에 실패");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("가이드북과 강의자료 교체에서 0행 경합 시 기존 파일을 보존한다", async () => {
    mocks.updateReturning.mockResolvedValue([]);

    const guidebook = await updateGuidebook(id, fileForm("guidebook"));
    const classMaterial = await updateClassMaterial(id, fileForm("classMaterial"));

    expect(guidebook.success).toBe(false);
    expect(classMaterial.success).toBe(false);
    expect(mocks.validateResourceUploadReference).toHaveBeenCalledTimes(2);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("수료생 이야기 수정이 0행이면 새 파일을 원장에 남기고 기존 파일을 보존한다", async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await updateAlumniStory(id, alumniForm());

    expect(result.success).toBe(false);
    expect(mocks.recordResourceUpload).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(uuidUrlPattern("alumni")), id);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("수료생 이야기의 새 사진을 대표 이미지로 저장한다", async () => {
    await updateAlumniStory(id, alumniForm());

    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: expect.stringMatching(uuidUrlPattern("alumni")) }));
    expect(mocks.insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ alumniStoryId: id, url: expect.stringMatching(uuidUrlPattern("alumni")), order: 0 }),
    ]);
  });

  it("수료생 이야기 수정은 검증된 직접 업로드 URL만 대표 사진과 첨부 행에 저장한다", async () => {
    const formData = alumniForm();
    formData.delete("images");
    formData.set("uploadedImageUrls", JSON.stringify([newUrl]));
    await updateAlumniStory(id, formData);
    expect(mocks.validateAlumniImageReference).toHaveBeenCalledWith(id, id, newUrl);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: newUrl }));
    expect(mocks.insertValues).toHaveBeenCalledWith([expect.objectContaining({ url: newUrl })]);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("수료생 이야기 수정은 위조된 직접 업로드 URL을 거부한다", async () => {
    const formData = alumniForm();
    formData.delete("images");
    formData.set("uploadedImageUrls", JSON.stringify(["https://evil.example/photo.png"]));
    mocks.validateAlumniImageReference.mockResolvedValue(false);
    const result = await updateAlumniStory(id, formData);
    expect(result.success).toBe(false);
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });

  it("가이드북·강의자료·수료생 이야기 DB 삭제 실패 시 파일은 남는다", async () => {
    mocks.deleteReturning.mockRejectedValueOnce(new Error("가이드북 DB 실패"));
    expect((await deleteGuidebook(id)).success).toBe(false);

    mocks.deleteReturning.mockRejectedValueOnce(new Error("강의자료 DB 실패"));
    expect((await deleteClassMaterial(id)).success).toBe(false);

    mocks.deleteWhere.mockRejectedValueOnce(new Error("수료생 DB 실패"));
    await expect(deleteAlumniStory(id)).rejects.toThrow("삭제 중 오류");

    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });
});
