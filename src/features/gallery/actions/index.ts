"use server";

/**
 * 갤러리 서버 액션 모음
 *
 * 역할:
 * - 검증한 갤러리 입력을 관리자 서비스에 전달합니다.
 * - 이미지 파일만 Vercel Blob에 업로드/삭제합니다.
 * - 관리자 페이지와 공개 페이지가 최신 데이터를 바로 보도록 경로를 재검증합니다.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import * as galleryService from "@/features/gallery/admin/service";
import type { GalleryActor } from "@/features/gallery/admin/service";
import { logServerError } from "@/lib/errors";
import { validateGalleryUploadReference } from "@/lib/gallery-upload-server";

export type GalleryActionState = {
  success: boolean;
  message: string;
};

const gallerySchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  description: z.string().trim().max(5000, "설명은 5000자 이하여야 합니다.").optional(),
});

const galleryImageBulkSchema = z.object({
  alt: z.string().trim().max(255, "대체 텍스트는 255자 이하여야 합니다.").optional(),
});

const idSchema = z.uuid("잘못된 ID입니다.");

const initialError = (message: string): GalleryActionState => ({
  success: false,
  message,
});

const successState = (message: string): GalleryActionState => ({
  success: true,
  message,
});

const normalizeText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  const text = normalizeText(value);
  return text.length > 0 ? text : undefined;
};

function revalidateGalleryPaths(id: string) {
  revalidatePath("/gallery");
  revalidatePath(`/gallery/${id}`);
  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${id}/edit`);
}

async function getValidatedGallery(actor: GalleryActor, id: string) {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? "잘못된 ID입니다." } as const;
  }

  const gallery = await galleryService.getGallerySnapshot(actor, parsedId.data);
  if (!gallery) {
    return { error: "앨범을 찾을 수 없습니다." } as const;
  }

  return { gallery } as const;
}

export async function createGallery(formData: FormData): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const createdGallery = await galleryService.createAdminGallery(actor, parsed.data);

  if (!createdGallery) {
    return initialError("앨범 생성에 실패했습니다.");
  }

  revalidateGalleryPaths(createdGallery.id);
  redirect(`/admin/gallery/${createdGallery.id}/edit`);
}

export async function updateGallery(id: string, formData: FormData): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const galleryResult = await getValidatedGallery(actor, id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  await galleryService.updateAdminGallery(actor, galleryResult.gallery.id, parsed.data);

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState("앨범 정보가 수정되었습니다.");
}

export async function deleteGallery(id: string): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const galleryResult = await getValidatedGallery(actor, id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  // 기존 이미지의 업로드 소유권이 확인되지 않아 파일은 보존합니다.
  // DB 삭제가 실패해도 원본 사진은 계속 열 수 있어야 합니다 (#93).
  const deleted = await galleryService.deleteAdminGallery(actor, galleryResult.gallery.id);
  if (!deleted) return initialError("앨범을 찾을 수 없습니다.");

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState("앨범이 삭제되었습니다.");
}

export async function addGalleryImages(id: string, formData: FormData): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const parsed = galleryImageBulkSchema.safeParse({
    alt: normalizeOptionalText(formData.get("alt")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const parsedUrls = z.array(z.url()).min(1).max(100).safeParse((() => {
    try { return JSON.parse(String(formData.get("uploadedImageUrls") ?? "")); }
    catch { return null; }
  })());
  if (!parsedUrls.success || new Set(parsedUrls.data).size !== parsedUrls.data.length) {
    return initialError("업로드한 이미지 정보를 확인할 수 없습니다.");
  }

  const galleryResult = await getValidatedGallery(actor, id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  // 완료 URL마다 실제 Blob 크기·형식·시작 바이트·업로드 소유자를 확인합니다.
  const checks = await Promise.all(parsedUrls.data.map((url) =>
    validateGalleryUploadReference(galleryResult.gallery.id, session.user.id, url)));
  if (checks.some((valid) => !valid)) {
    return initialError("업로드한 이미지 정보를 확인할 수 없습니다. 다시 시도해주세요.");
  }
  const result = await galleryService.saveGalleryImages(actor, {
    gallery: galleryResult.gallery, urls: parsedUrls.data, alt: parsed.data.alt,
  });
  switch (result.kind) {
    case "duplicate": return initialError("이미 등록된 이미지가 포함되어 있습니다.");
    case "insert-error":
      logServerError("gallery/add-images-insert", result.error, { galleryId: galleryResult.gallery.id });
      return initialError("이미지 저장 중 오류가 발생했습니다. 앨범을 확인해주세요.");
    case "cover-error":
      logServerError("gallery/add-images-cover", result.error, { galleryId: galleryResult.gallery.id });
      revalidateGalleryPaths(galleryResult.gallery.id);
      return successState("이미지는 추가됐지만 대표 사진 설정에 실패했습니다. 앨범을 확인해주세요.");
    case "saved": break;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState(`${parsedUrls.data.length}장의 이미지가 추가되었습니다.`);
}

// 갤러리 이미지 순서 일괄 변경 — 드래그앤드롭 결과를 DB에 저장
// galleryId: 해당 앨범 ID (이미지가 실제로 속한 앨범인지 검증에 사용)
// orderedIds: 새 순서대로 정렬된 이미지 ID 배열
export async function reorderGalleryImages(
  galleryId: string,
  orderedIds: string[]
): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const parsedGalleryId = idSchema.safeParse(galleryId);
  if (!parsedGalleryId.success) {
    return initialError(parsedGalleryId.error.issues[0]?.message ?? "잘못된 앨범 ID입니다.");
  }

  // Oracle Phase D 5라운드 BLOCK 수정 — orderedIds 각 원소를 UUID 로 사전 검증한다.
  // 이 배열은 두 경로에서 SQL 로 흘러간다: (1) inArray(galleryImages.id, orderedIds)
  // 는 파라미터 바인딩이라 injection 은 없지만 UUID 형식이 아닌 값이 들어가면 Postgres
  // 캐스트 에러로 raw ID 가 Vercel Logs 에 노출된다, (2) reorderByCase 헬퍼의
  // `${a.id}::uuid` raw SQL 캐스트도 동일한 leak 벡터를 가진다. 두 경로 진입 전에
  // 사전 차단한다.
  const parsedIds = z.array(z.uuid()).min(1).safeParse(orderedIds);
  if (!parsedIds.success) {
    return initialError("유효하지 않은 요청입니다.");
  }
  const validIds = parsedIds.data;

  // 전달된 ID가 모두 해당 갤러리에 속한 이미지인지 서비스에서 검증합니다.
  if (!(await galleryService.checkGalleryImageIds(actor, parsedGalleryId.data, validIds))) {
    return initialError("일부 이미지를 찾을 수 없습니다.");
  }

  try {
    const { matched, affected } = await galleryService.reorderAdminImages(actor, parsedGalleryId.data, validIds);

    // 존재하지 않는 ID 또는 중복 ID 로 인해 일부만 갱신된 경우 방어
    if (!matched) {
      logServerError(
        "gallery/reorder-images",
        new Error("update count mismatch"),
        {
          galleryId: parsedGalleryId.data,
          expected: validIds.length,
          actual: affected,
        },
      );
      return initialError("일부 이미지를 저장하지 못했습니다.");
    }
  } catch (err) {
    logServerError("gallery/reorder-images", err, {
      galleryId: parsedGalleryId.data,
      orderedIdsCount: validIds.length,
    });
    return initialError("순서를 저장하지 못했습니다. 다시 시도해주세요.");
  }

  revalidateGalleryPaths(parsedGalleryId.data);
  return successState("이미지 순서를 저장했습니다.");
}

export async function deleteGalleryImage(id: string, imageId: string): Promise<GalleryActionState> {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  const parsedGalleryId = idSchema.safeParse(id);
  if (!parsedGalleryId.success) {
    return initialError(parsedGalleryId.error.issues[0]?.message ?? "잘못된 ID입니다.");
  }

  const parsedImageId = idSchema.safeParse(imageId);
  if (!parsedImageId.success) {
    return initialError(parsedImageId.error.issues[0]?.message ?? "잘못된 이미지 ID입니다.");
  }

  const result = await galleryService.deleteAdminImage(actor, parsedGalleryId.data, parsedImageId.data);
  switch (result.kind) {
    case "missing-gallery": return initialError("앨범을 찾을 수 없습니다.");
    case "missing-image": return initialError("이미지를 찾을 수 없습니다.");
    case "cover-error":
      logServerError("gallery/delete-image-cover", result.error, { galleryId: parsedGalleryId.data });
      revalidateGalleryPaths(parsedGalleryId.data);
      return successState("이미지는 삭제됐지만 대표 사진 갱신에 실패했습니다. 앨범을 확인해주세요.");
    case "deleted": break;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }

  revalidateGalleryPaths(parsedGalleryId.data);
  return successState("이미지가 삭제되었습니다.");
}
