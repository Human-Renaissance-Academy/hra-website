/**
 * 관리자 갤러리의 재인가·표시 DTO·사진 저장 업무 규칙을 소유합니다.
 * 웹 입력 검증·Blob 실물 검사·오류 기록·재검증은 어댑터에서 기존 순서대로 수행합니다.
 */
import "server-only";
import * as repository from "./repository";
import type {
  GalleryAlbum,
  GalleryEdit,
  GalleryImagesInput,
  GalleryInput,
  GallerySnapshot,
} from "./repository";

export type GalleryActor = { userId: string; role: string };
export type { GalleryAlbum, GalleryEdit, GallerySnapshot } from "./repository";
export type ImageSaveResult =
  | { readonly kind: "duplicate" }
  | { readonly kind: "insert-error"; readonly error: unknown }
  | { readonly kind: "cover-error"; readonly error: unknown }
  | { readonly kind: "saved" };
export type ImageDeleteResult =
  | { readonly kind: "missing-gallery" }
  | { readonly kind: "missing-image" }
  | { readonly kind: "cover-error"; readonly error: unknown }
  | { readonly kind: "deleted" };

/** FAQ와 같은 방식으로 다른 어댑터의 호출도 관리자 권한을 다시 검사합니다. */
function assertAdmin(actor: GalleryActor): void {
  if (!actor || actor.role !== "ADMIN" || typeof actor.userId !== "string" || !actor.userId) {
    throw new Error("GALLERY_ADMIN_REQUIRED");
  }
}

/** 목록 화면에 실제 사용하는 열과 사진 ID만 전달합니다. */
export async function listAdminAlbums(actor: GalleryActor): Promise<GalleryAlbum[]> {
  assertAdmin(actor);
  return (await repository.listAlbums()).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    coverImageUrl: row.coverImageUrl,
    createdAt: row.createdAt,
    images: row.images.map((image) => ({ id: image.id })),
  }));
}

/** 편집 DTO에는 폼·그리드에 필요한 표시 열만 남깁니다. */
export async function getAdminGallery(
  actor: GalleryActor,
  id: string,
): Promise<GalleryEdit | null> {
  assertAdmin(actor);
  const row = await repository.findEditGallery(id);
  return row
    ? {
        id: row.id,
        title: row.title,
        description: row.description,
        coverImageUrl: row.coverImageUrl,
        images: row.images.map((image) => ({
          id: image.id,
          url: image.url,
          alt: image.alt,
          order: image.order,
        })),
      }
    : null;
}

/** 업로드 전에 앨범 존재와 기존 사진 수·대표 사진 스냅샷만 전달합니다. */
export async function getGallerySnapshot(
  actor: GalleryActor,
  id: string,
): Promise<GallerySnapshot | null> {
  assertAdmin(actor);
  const row = await repository.findGalleryWithImages(id);
  return row
    ? {
        id: row.id,
        coverImageUrl: row.coverImageUrl,
        images: row.images.map((image) => ({ id: image.id })),
      }
    : null;
}

/** 생성 입력은 명시한 두 필드만 저장소에 전달합니다. */
export async function createAdminGallery(
  actor: GalleryActor,
  input: GalleryInput,
): Promise<{ id: string } | null> {
  assertAdmin(actor);
  const row = await repository.insertGallery({
    title: input.title,
    description: input.description,
  });
  return row ? { id: row.id } : null;
}

/** 원본처럼 존재 조회 뒤의 UPDATE는 변경 행 수를 별도로 검사하지 않습니다. */
export async function updateAdminGallery(
  actor: GalleryActor,
  id: string,
  input: GalleryInput,
): Promise<void> {
  assertAdmin(actor);
  await repository.updateGallery(id, { title: input.title, description: input.description });
}

/** 기존 파일의 소유권이 미확정이므로 앨범 삭제는 DB에만 적용합니다. */
export async function deleteAdminGallery(actor: GalleryActor, id: string): Promise<boolean> {
  assertAdmin(actor);
  return repository.deleteGallery(id);
}

/** 실물·소유자 검사 이후 중복 조회→사진 INSERT→필요한 대표 사진 UPDATE 순서를 유지합니다. */
export async function saveGalleryImages(
  actor: GalleryActor,
  input: GalleryImagesInput,
): Promise<ImageSaveResult> {
  assertAdmin(actor);
  const existingImages = await repository.findImagesByUrls(input.urls);
  if (existingImages.length > 0) return { kind: "duplicate" };
  try {
    await repository.insertImages(input);
  } catch (error) {
    // INSERT 응답 실패가 미커밋을 뜻하지 않으므로 파일을 삭제하지 않고 웹 경계에 전달합니다.
    return { kind: "insert-error", error };
  }
  const firstUrl = input.urls[0];
  if (!input.gallery.coverImageUrl && firstUrl) {
    try {
      await repository.setCover(input.gallery.id, firstUrl);
    } catch (error) {
      // 사진은 이미 저장됐으므로 대표 사진 실패만 부분 성공으로 구분합니다.
      return { kind: "cover-error", error };
    }
  }
  return { kind: "saved" };
}

/** 정렬 전 소속 검사 오류는 기존처럼 UPDATE 오류 처리 바깥으로 전파합니다. */
export async function checkGalleryImageIds(
  actor: GalleryActor,
  galleryId: string,
  ids: string[],
): Promise<boolean> {
  assertAdmin(actor);
  return (await repository.findImageIds(galleryId, ids)).length === ids.length;
}

/** 원자 SQL의 실제 변경 수와 요청 수 일치 여부를 판단합니다. */
export async function reorderAdminImages(actor: GalleryActor, galleryId: string, ids: string[]) {
  assertAdmin(actor);
  const affected = await repository.reorderImages(galleryId, ids);
  return { matched: affected === ids.length, affected };
}

/** 앨범→사진 소속→DELETE returning→조건부 대표 사진 갱신의 원본 순서를 유지합니다. */
export async function deleteAdminImage(
  actor: GalleryActor,
  galleryId: string,
  imageId: string,
): Promise<ImageDeleteResult> {
  assertAdmin(actor);
  const gallery = await repository.findGalleryWithImages(galleryId);
  if (!gallery) return { kind: "missing-gallery" };
  const targetImage = await repository.findImage(galleryId, imageId);
  if (!targetImage) return { kind: "missing-image" };
  if (!(await repository.deleteImage(galleryId, imageId))) return { kind: "missing-image" };
  try {
    await repository.refreshCover(galleryId, targetImage.url);
  } catch (error) {
    // 사진 삭제 성공 이후 대표 사진 오류는 전체 실패로 되돌리지 않습니다.
    return { kind: "cover-error", error };
  }
  return { kind: "deleted" };
}

/** 파일·경로 검사 이후 호출하며 업로드 대상의 존재만 확인합니다. */
export async function galleryExistsForDirectUpload(
  actor: GalleryActor,
  id: string,
): Promise<boolean> {
  assertAdmin(actor);
  return repository.galleryExistsForDirectUpload(id);
}
