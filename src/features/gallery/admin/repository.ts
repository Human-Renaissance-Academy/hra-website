/**
 * 관리자 갤러리의 PostgreSQL 접근을 소유합니다.
 * 기존 관계 조회와 DELETE returning, 대표 사진 조건부 SQL, 단일 CASE 정렬을 유지합니다.
 */
import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { galleries, galleryImages } from "@/lib/db/schema";

export type GalleryInput = { readonly title: string; readonly description?: string | undefined };
export type GalleryImage = {
  readonly id: string;
  readonly url: string;
  readonly alt: string | null;
  readonly order: number;
};
export type GalleryEdit = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly coverImageUrl: string | null;
  readonly images: GalleryImage[];
};
export type GalleryAlbum = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly coverImageUrl: string | null;
  readonly createdAt: Date;
  readonly images: { readonly id: string }[];
};
export type GallerySnapshot = {
  readonly id: string;
  readonly coverImageUrl: string | null;
  readonly images: { readonly id: string }[];
};
export type GalleryImagesInput = {
  readonly gallery: GallerySnapshot;
  readonly urls: string[];
  readonly alt?: string | undefined;
};

/** 목록의 기존 전체 앨범 관계 조회와 작성일 역순을 그대로 유지합니다. */
export async function listAlbums() {
  return db.query.galleries.findMany({
    orderBy: [desc(galleries.createdAt)],
    with: { images: { columns: { id: true } } },
  });
}

/** 편집 페이지의 표시 열과 사진의 순서·생성 시각 동점 정렬을 유지합니다. */
export async function findEditGallery(id: string) {
  return db.query.galleries.findFirst({
    columns: { id: true, title: true, description: true, coverImageUrl: true },
    where: eq(galleries.id, id),
    with: {
      images: {
        columns: { id: true, url: true, alt: true, order: true },
        orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)],
      },
    },
  });
}

/** 쓰기 전 스냅샷은 기존 액션의 관계 조회 체인을 변경하지 않습니다. */
export async function findGalleryWithImages(id: string) {
  const gallery = await db.query.galleries.findFirst({
    where: eq(galleries.id, id),
    with: { images: { orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)] } },
  });
  return gallery ?? null;
}

/** 생성 결과에는 웹 이동에 필요한 ID만 반환합니다. */
export async function insertGallery(input: GalleryInput) {
  const [createdGallery] = await db
    .insert(galleries)
    .values({
      title: input.title,
      description: input.description ?? null,
      coverImageUrl: null,
    })
    .returning({ id: galleries.id });
  return createdGallery ?? null;
}

/** 기존 수정은 returning 없이 선택한 앨범 ID로만 갱신합니다. */
export async function updateGallery(id: string, input: GalleryInput): Promise<void> {
  await db
    .update(galleries)
    .set({ title: input.title, description: input.description ?? null })
    .where(eq(galleries.id, id));
}

/** 실제 삭제 행으로 조회 이후의 삭제 경합을 구분합니다. */
export async function deleteGallery(id: string): Promise<boolean> {
  const [deleted] = await db
    .delete(galleries)
    .where(eq(galleries.id, id))
    .returning({ id: galleries.id });
  return Boolean(deleted);
}

/** URL 중복은 앨범 범위가 아닌 기존 전체 이미지 테이블에서 확인합니다. */
export async function findImagesByUrls(urls: string[]) {
  return db
    .select({ url: galleryImages.url })
    .from(galleryImages)
    .where(inArray(galleryImages.url, urls));
}

/** 사진 순서는 검증 전에 읽은 앨범의 사진 수 다음부터 시작합니다. */
export async function insertImages(input: GalleryImagesInput): Promise<void> {
  const baseOrder = input.gallery.images.length;
  await db.insert(galleryImages).values(
    input.urls.map((url, index) => ({
      galleryId: input.gallery.id,
      url,
      alt: input.alt ?? null,
      order: baseOrder + index,
    })),
  );
}

/** 기존 업로드 대표 사진 갱신에는 추가 조건을 붙이지 않습니다. */
export async function setCover(id: string, url: string): Promise<void> {
  await db.update(galleries).set({ coverImageUrl: url }).where(eq(galleries.id, id));
}

/** 정렬 전에 요청 ID 모두가 해당 앨범에 속하는지 기존 투영으로 읽습니다. */
export async function findImageIds(galleryId: string, ids: string[]) {
  return db
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(and(eq(galleryImages.galleryId, galleryId), inArray(galleryImages.id, ids)));
}

/** 단일 CASE UPDATE의 앨범 조건과 0 기반 순서를 유지합니다. */
export async function reorderImages(galleryId: string, ids: string[]): Promise<number> {
  const { affected } = await reorderByCase({
    table: galleryImages,
    idColumn: galleryImages.id,
    targetColumn: galleryImages.order,
    assignments: ids.map((id, index) => ({ id, value: index })),
    extraWhere: eq(galleryImages.galleryId, galleryId),
  });
  return affected;
}

/** 사진 소속 조건을 조회와 삭제에 똑같이 적용합니다. */
export async function findImage(galleryId: string, imageId: string) {
  return db.query.galleryImages.findFirst({
    where: and(eq(galleryImages.id, imageId), eq(galleryImages.galleryId, galleryId)),
  });
}

/** 삭제가 0행이면 대표 사진 갱신을 시작하지 않도록 결과를 반환합니다. */
export async function deleteImage(galleryId: string, imageId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(galleryImages)
    .where(and(eq(galleryImages.id, imageId), eq(galleryImages.galleryId, galleryId)))
    .returning({ id: galleryImages.id });
  return Boolean(deleted);
}

/** 현재 남은 사진을 읽되 다른 관리자가 바꾼 대표 사진은 덮어쓰지 않습니다. */
export async function refreshCover(galleryId: string, deletedUrl: string): Promise<void> {
  await db
    .update(galleries)
    .set({
      coverImageUrl: sql<string | null>`(
      SELECT ${galleryImages.url} FROM ${galleryImages}
      WHERE ${galleryImages.galleryId} = ${galleryId}
      ORDER BY ${galleryImages.order}, ${galleryImages.createdAt}
      LIMIT 1
    )`,
    })
    .where(and(eq(galleries.id, galleryId), eq(galleries.coverImageUrl, deletedUrl)));
}

/** 직접 업로드는 기존과 같이 앨범 ID의 존재만 조회합니다. */
export async function galleryExistsForDirectUpload(id: string): Promise<boolean> {
  const row = await db.query.galleries.findFirst({
    where: eq(galleries.id, id),
    columns: { id: true },
  });
  return Boolean(row);
}
