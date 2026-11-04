/** 수료생 이야기 서버 액션: 글과 사진을 관리하고 직접·서버 업로드의 형식을 검증합니다. */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { createStory, updateStory, togglePin, reorderStories, deleteStory } from "@/features/alumni/admin/service";
import { logServerError } from "@/lib/errors";
import { uploadBlobsForCreate } from "@/lib/create-with-blobs";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";
import { validateAdminImage, type ValidatedAdminImage } from "@/lib/admin-image-validation";
import { alumniImageRule } from "@/lib/alumni-upload-contract";
import { validateAlumniImageReference } from "@/lib/alumni-upload-server";

const maxImageSize = 5 * 1024 * 1024;

const alumniStoryFormSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100, "이름은 100자 이하여야 합니다."),
  title: z.string().trim().max(100, "소속/직함은 100자 이하여야 합니다.").optional(),
  quote: z.string().trim().min(1, "대표 문구를 입력해주세요.").max(500, "대표 문구는 500자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
  imageUrl: z.string().optional(), // 대표 이미지 URL
  isFeatured: z
    .union([z.literal("true"), z.literal("on"), z.null(), z.undefined()])
    .transform((value) => value === "true" || value === "on"),
});

export type AlumniStoryActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function issuesToFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function parseAlumniStoryFormData(formData: FormData) {
  return alumniStoryFormSchema.safeParse({
    name: normalizeText(formData.get("name")),
    title: normalizeText(formData.get("title")) || undefined,
    quote: normalizeText(formData.get("quote")),
    content: normalizeText(formData.get("content")),
    imageUrl: normalizeText(formData.get("imageUrl")) || undefined,
    isFeatured: formData.get("isFeatured"),
  });
}

async function validateImageFiles(formData: FormData) {
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File);
  const validFiles: ValidatedAdminImage[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size === 0) continue;

    const image = await validateAdminImage(file, alumniImageRule);
    if (!image) {
      return {
        success: false as const,
        message: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다.",
        fieldErrors: { images: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
      };
    }

    if (file.size > maxImageSize) {
      return {
        success: false as const,
        message: "이미지는 5MB 이하만 업로드할 수 있습니다.",
        fieldErrors: { images: "이미지는 5MB 이하만 업로드할 수 있습니다." },
      };
    }
    totalBytes += file.size;
    validFiles.push(image);
  }

  // 구형 서버 경유 요청은 플랫폼 본문 한도 아래에서만 허용합니다.
  if (totalBytes > 3 * 1024 * 1024) {
    return { success: false as const, message: "사진을 다시 선택해 업로드해주세요.", fieldErrors: { images: "사진을 다시 선택해 업로드해주세요." } };
  }

  return { success: true as const, files: validFiles };
}

/** 브라우저 완료 URL은 전달 문자열을 신뢰하지 않고 업로드 실물과 소유자를 재확인합니다. */
async function getUploadedImageUrls(formData: FormData, storyId: string, userId: string): Promise<{ urls: string[] } | { error: string }> {
  const raw = formData.get("uploadedImageUrls");
  if (raw === null) return { urls: [] };
  if (typeof raw !== "string" || raw.length > 100_000) return { error: "업로드한 사진 정보를 확인해주세요." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "업로드한 사진 정보를 확인해주세요." };
  }
  const urls = z.array(z.url()).max(100).safeParse(parsed);
  if (!urls.success || new Set(urls.data).size !== urls.data.length) return { error: "업로드한 사진 정보를 확인해주세요." };
  for (const url of urls.data) {
    if (!await validateAlumniImageReference(storyId, userId, url)) return { error: "업로드한 사진을 확인할 수 없습니다. 다시 업로드해주세요." };
  }
  return { urls: urls.data };
}

/** 실제 형식을 검증한 사진만 UUID 경로와 서버가 정한 MIME으로 원장에 선예약해 저장합니다 (#302). */
async function uploadAlumniImage(image: ValidatedAdminImage, uploadedById: string) {
  return uploadWithOwnedIntent({
    namespace: "alumni",
    extension: image.extension,
    body: image.file,
    contentType: image.contentType,
    uploadedById,
  });
}

function revalidateAlumniPaths() {
  revalidatePath("/");
  revalidatePath("/admin/alumni");
  revalidatePath("/alumni");
}

export async function createAlumniStory(formData: FormData): Promise<AlumniStoryActionState> {
  const session = await requireAdmin();

  const parsed = parseAlumniStoryFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const validatedImages = await validateImageFiles(formData);
  if (!validatedImages.success) {
    return {
      success: false,
      message: validatedImages.message,
      fieldErrors: validatedImages.fieldErrors,
    };
  }

  const requestId = z.uuid().safeParse(formData.get("requestId"));
  if (!requestId.success) {
    return { success: false, message: "페이지를 새로고침한 뒤 다시 제출해주세요." };
  }

  const directImages = await getUploadedImageUrls(formData, requestId.data, session.user.id);
  if ("error" in directImages) return { success: false, message: directImages.error, fieldErrors: { images: directImages.error } };

  try {
    await createStory({ userId: session.user.id, role: session.user.role }, {
      id: requestId.data,
      story: parsed.data,
      directUrls: directImages.urls,
      upload: () => uploadBlobsForCreate(
        validatedImages.files.map((image) => ({
          pathname: `alumni/${crypto.randomUUID()}.${image.extension}`,
          file: image.file,
          contentType: image.contentType,
        })),
        session.user.id,
      ),
    });
  } catch (error) {
    logServerError("alumni/create", error);
    return {
      success: false,
      message: "수료생 이야기 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

export async function updateAlumniStory(id: string, formData: FormData): Promise<AlumniStoryActionState> {
  const session = await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 수료생 이야기 ID입니다.",
    };
  }

  const parsed = parseAlumniStoryFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const validatedImages = await validateImageFiles(formData);
  if (!validatedImages.success) {
    return {
      success: false,
      message: validatedImages.message,
      fieldErrors: validatedImages.fieldErrors,
    };
  }

  const directImages = await getUploadedImageUrls(formData, parsedId.data, session.user.id);
  if ("error" in directImages) return { success: false, message: directImages.error, fieldErrors: { images: directImages.error } };

  try {
    const result = await updateStory({ userId: session.user.id, role: session.user.role }, {
      id: parsedId.data,
      story: parsed.data,
      directUrls: directImages.urls,
      upload: async () => {
        const uploadedUrls: string[] = [];
        for (const file of validatedImages.files) {
          const url = await uploadAlumniImage(file, session.user.id);
          uploadedUrls.push(url);
        }
        return uploadedUrls;
      },
    });
    if (!result.success) return result;
  } catch (error) {
    logServerError("alumni/update", error, { id: parsedId.data });
    return {
      success: false,
      message: "수정 중 오류가 발생했습니다. DB 마이그레이션 상태를 확인해주세요.",
    };
  }

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

/**
 * 상단 고정 클릭마다 DB의 현재 값을 반전한다. 재전송도 별도 명령으로 다시 반전한다.
 * 응답은 해당 명령의 저장값이며, 후속 명령까지 같은 상태로 유지됨을 보장하지 않는다.
 */
export async function toggleAlumniPin(id: string): Promise<{ success: boolean; message: string }> {
  const session = await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "잘못된 ID입니다." };
  }

  const updated = await togglePin({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!updated) {
    return { success: false, message: "수료생 이야기를 찾을 수 없습니다." };
  }

  revalidateAlumniPaths();
  return { success: true, message: updated.pinned ? "상단에 고정했습니다." : "고정을 해제했습니다." };
}

// 수료생 이야기 순서 일괄 변경 — 드래그앤드롭 결과를 DB에 저장
// orderedIds: 새 순서대로 정렬된 수료생 이야기 ID 배열
// 단일 UPDATE ... CASE 문(reorderByCase 헬퍼)으로 원자적으로 갱신 —
// 개별 UPDATE 루프에서 중간 실패 시 정렬 상태가 뒤엉키던 문제를 근본 차단한다.
export async function reorderAlumniStories(
  orderedIds: string[]
): Promise<{ success: boolean; message: string }> {
  const session = await requireAdmin();

  // Oracle Phase D 5라운드 BLOCK 수정 — orderedIds 각 원소를 UUID 로 사전 검증한다.
  // 이 배열은 reorderByCase 헬퍼의 `${a.id}::uuid` raw SQL 캐스트로 흘러가는데
  // UUID 형식이 아닌 값이 도달하면 Postgres cast error 로 raw ID 가 Vercel Logs 에
  // 노출될 수 있으므로 사전 차단한다.
  const parsedIds = z.array(z.uuid()).min(1).safeParse(orderedIds);
  if (!parsedIds.success) {
    return { success: false, message: "유효하지 않은 요청입니다." };
  }
  const validIds = parsedIds.data;

  try {
    const { affected, matched } = await reorderStories({ userId: session.user.id, role: session.user.role }, validIds);

    // 존재하지 않는 ID 또는 중복 ID 로 인해 일부만 갱신된 경우 방어
    if (!matched) {
      logServerError("alumni/reorder", new Error("update count mismatch"), {
        expected: validIds.length,
        actual: affected,
      });
      return { success: false, message: "일부 항목을 저장하지 못했습니다." };
    }
  } catch (err) {
    logServerError("alumni/reorder", err);
    return { success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." };
  }

  revalidateAlumniPaths();
  return { success: true, message: "순서를 저장했습니다." };
}

export async function deleteAlumniStory(id: string): Promise<void> {
  const session = await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  try {
    // 기존 이미지 URL만으로 파일 소유권을 증명할 수 없으므로 DB 삭제 전에
    // Blob을 지우지 않습니다. 미확인 파일은 보존합니다 (#93).
    await deleteStory({ userId: session.user.id, role: session.user.role }, parsedId.data);
  } catch (error) {
    logServerError("alumni/delete", error, { id: parsedId.data });
    // 서버 액션 void 반환형이라 에러 발생 시 redirect 등으로 처리하거나 에러를 던질 수 있음
    throw new Error("삭제 중 오류가 발생했습니다.");
  }
  
  revalidateAlumniPaths();
}
