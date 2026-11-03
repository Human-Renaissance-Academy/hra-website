/** 관리자 서비스의 모든 진입점 재인가와 DTO 화이트리스트·저장 순서를 검증합니다. */
import { beforeEach, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  listAlbums: vi.fn(), findEditGallery: vi.fn(), findGalleryWithImages: vi.fn(), insertGallery: vi.fn(),
  updateGallery: vi.fn(), deleteGallery: vi.fn(), findImagesByUrls: vi.fn(), insertImages: vi.fn(),
  setCover: vi.fn(), findImageIds: vi.fn(), reorderImages: vi.fn(), findImage: vi.fn(),
  deleteImage: vi.fn(), refreshCover: vi.fn(),
}));
vi.mock("@/features/gallery/admin/repository", () => repository);
import * as service from "@/features/gallery/admin/service";
import type { GalleryActor } from "@/features/gallery/admin/service";

const admin = { userId: "admin-1", role: "ADMIN" };
const id = "10000000-0000-4000-8000-000000000001";
const imageId = "20000000-0000-4000-8000-000000000001";
const gallery = { id, coverImageUrl: null, images: [{ id: imageId }] };
const input = { gallery, urls: ["https://gallery.invalid/a.png"], alt: "합성 사진" };
const calls: Record<string, (actor: GalleryActor) => Promise<unknown>> = {
  listAdminAlbums: actor => service.listAdminAlbums(actor),
  getAdminGallery: actor => service.getAdminGallery(actor, id),
  getGallerySnapshot: actor => service.getGallerySnapshot(actor, id),
  createAdminGallery: actor => service.createAdminGallery(actor, { title: "합성 앨범" }),
  updateAdminGallery: actor => service.updateAdminGallery(actor, id, { title: "합성 앨범" }),
  deleteAdminGallery: actor => service.deleteAdminGallery(actor, id),
  saveGalleryImages: actor => service.saveGalleryImages(actor, input),
  checkGalleryImageIds: actor => service.checkGalleryImageIds(actor, id, [imageId]),
  reorderAdminImages: actor => service.reorderAdminImages(actor, id, [imageId]),
  deleteAdminImage: actor => service.deleteAdminImage(actor, id, imageId),
};
beforeEach(() => vi.resetAllMocks());

it("서비스의 모든 함수가 인가 검사 목록에 포함된다", () => {
  // 준비·실행: 런타임 export와 호출 목록을 비교합니다.
  expect(Object.keys(service).sort()).toEqual(Object.keys(calls).sort());
});
for (const [name, run] of Object.entries(calls)) {
  it.each([{ userId: "member-1", role: "MEMBER" }, { userId: "", role: "ADMIN" },
    { userId: "admin-1", role: "" }])(`${name}: 잘못된 주체는 저장소 전에 거부한다 (%j)`, async actor => {
    // 준비: 비관리자 또는 빈 식별자·역할입니다.
    // 실행: 웹 어댑터를 우회해 서비스를 직접 호출합니다.
    await expect(run(actor)).rejects.toThrow("GALLERY_ADMIN_REQUIRED");
    // 확인: 어떤 저장소 함수도 실행하지 않습니다.
    for (const mock of Object.values(repository)) expect(mock).not.toHaveBeenCalled();
  });
}

it("목록 DTO는 조회수·감사 열과 사진 URL을 제외한다", async () => {
  // 준비: 향후 추가 열이 포함된 저장소 행입니다.
  const createdAt = new Date(0);
  repository.listAlbums.mockResolvedValue([{ ...gallery, title: "합성 앨범", description: "설명", createdAt,
    viewCount: 99, updatedAt: new Date(1), images: [{ id: imageId, url: "private://image" }] }]);
  // 실행: 관리자 목록을 읽습니다.
  const result = await service.listAdminAlbums(admin);
  // 확인: 사용 필드만 새 객체에 남습니다.
  expect(result).toEqual([{ ...gallery, title: "합성 앨범", description: "설명", createdAt }]);
});
it("편집 DTO는 폼·그리드 표시 열만 남긴다", async () => {
  // 준비: 앨범과 사진 내부 열이 포함된 행입니다.
  const image = { id: imageId, url: input.urls[0], alt: null, order: 3 };
  repository.findEditGallery.mockResolvedValue({ ...gallery, title: "합성 앨범", description: null,
    createdAt: new Date(), images: [{ ...image, galleryId: id, createdAt: new Date() }] });
  // 실행: 편집 결과를 읽습니다.
  const result = await service.getAdminGallery(admin, id);
  // 확인: 내부 열은 클라이언트 경계에 전달하지 않습니다.
  expect(result).toEqual({ ...gallery, title: "합성 앨범", description: null, images: [image] });
});
it("업로드 스냅샷은 앨범 ID·대표 사진·사진 ID만 남긴다", async () => {
  // 준비: 전체 관계 행이 반환됩니다.
  repository.findGalleryWithImages.mockResolvedValue({ ...gallery, title: "내부 제목", viewCount: 9 });
  // 실행: 업로드 준비 스냅샷을 읽습니다.
  const result = await service.getGallerySnapshot(admin, id);
  // 확인: 저장 업무에 필요한 최소 스냅샷입니다.
  expect(result).toEqual(gallery);
});
it("생성 입력과 결과는 허용 열만 전달한다", async () => {
  // 준비: 구조적 타입의 추가 열이 있어도 저장에 사용하지 않습니다.
  const data = { title: "합성 앨범", description: "설명", viewCount: 99 };
  repository.insertGallery.mockResolvedValue({ id, internal: "비공개" });
  // 실행: 생성 서비스를 호출합니다.
  const result = await service.createAdminGallery(admin, data);
  // 확인: 입력과 출력 모두 화이트리스트입니다.
  expect(repository.insertGallery).toHaveBeenCalledWith({ title: data.title, description: data.description });
  expect(result).toEqual({ id });
});
it("INSERT 실패는 대표 사진을 쓰지 않고 원래 오류를 웹 경계로 반환한다", async () => {
  // 준비: 실물 검사는 끝났지만 INSERT 응답이 실패합니다.
  repository.findImagesByUrls.mockResolvedValue([]);
  const error = new Error("합성 실패"); repository.insertImages.mockRejectedValue(error);
  // 실행: 사진 저장 업무를 수행합니다.
  const result = await service.saveGalleryImages(admin, input);
  // 확인: 추가 SQL 없이 기존 로그를 위한 오류 객체를 유지합니다.
  expect(result).toEqual({ kind: "insert-error", error });
  expect(repository.setCover).not.toHaveBeenCalled();
});
it("대표 사진 실패는 INSERT 후 부분 성공으로 구분한다", async () => {
  // 준비: 이미지 INSERT는 성공하고 대표 사진만 실패합니다.
  repository.findImagesByUrls.mockResolvedValue([]);
  const error = new Error("합성 커버 실패"); repository.setCover.mockRejectedValue(error);
  // 실행: 저장 순서를 수행합니다.
  const result = await service.saveGalleryImages(admin, input);
  // 확인: 중복 조회→INSERT→대표 사진 순서를 유지합니다.
  expect(result).toEqual({ kind: "cover-error", error });
  expect(repository.findImagesByUrls.mock.invocationCallOrder[0]).toBeLessThan(repository.insertImages.mock.invocationCallOrder[0]);
  expect(repository.insertImages.mock.invocationCallOrder[0]).toBeLessThan(repository.setCover.mock.invocationCallOrder[0]);
});
it("사진 DELETE 0행이면 대표 사진을 갱신하지 않는다", async () => {
  // 준비: 소속 조회 뒤에 다른 관리자가 사진을 삭제했습니다.
  repository.findGalleryWithImages.mockResolvedValue(gallery);
  repository.findImage.mockResolvedValue({ id: imageId, url: input.urls[0] });
  repository.deleteImage.mockResolvedValue(false);
  // 실행: 이미지 삭제 업무를 호출합니다.
  const result = await service.deleteAdminImage(admin, id, imageId);
  // 확인: 대표 사진 SQL을 시작하지 않습니다.
  expect(result).toEqual({ kind: "missing-image" }); expect(repository.refreshCover).not.toHaveBeenCalled();
});
