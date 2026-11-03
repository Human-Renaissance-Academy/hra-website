/** 모집 설정 서버 액션: 모집 정보와 포스터를 저장하고 이미지 변환 실패를 폼 오류로 반환합니다. */
"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";
import {
  getSettings, getPosterImageUrl, getCohortOptions,
  saveSettings, saveInfo, savePoster, saveDetails,
} from "@/features/recruitment-settings/admin/service";
import { logServerError } from "@/lib/errors";
import { validateAdminImage } from "@/lib/admin-image-validation";
import { posterImageRule } from "@/lib/poster-upload-contract";
import { prepareStoredPoster } from "@/lib/poster-upload-server";

const maxPosterFileSize = 10 * 1024 * 1024;
const posterInputModeSchema = z.enum(["url", "file"]);

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "마감일 형식이 올바르지 않습니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "유효한 마감일을 입력해주세요.",
  });

const recruitmentSettingsSchema = z
  .object({
    posterInputMode: posterInputModeSchema,
    posterImageUrl: z.string().trim().optional(),
    // 현재 모집 기수 섹션
    activeCohortId: z.union([z.uuid("올바른 기수를 선택해주세요."), z.literal("")]).optional(),
    googleFormUrl: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.startsWith("https://"), { message: "구글폼 URL은 https://로 시작해야 합니다." }),
    recruitmentStartDate: z.union([dateStringSchema, z.literal("")]).optional(),
    // 기존 모집 안내 섹션
    deadlineDate: z.union([dateStringSchema, z.literal("")]).optional(),
    detailsMarkdown: z.string().trim().max(20000, "세부 안내는 20000자 이하여야 합니다.").optional(),
    posterLayout: z.enum(["right", "left", "none"]).default("right"),
  })
  .superRefine((value, context) => {
    if (value.recruitmentStartDate && value.deadlineDate &&
        value.recruitmentStartDate > value.deadlineDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deadlineDate"],
        message: "모집 종료일은 시작일 이후여야 합니다.",
      });
    }

    if (value.posterInputMode !== "url" || !value.posterImageUrl) {
      return;
    }

    if (!value.posterImageUrl.startsWith("http://") && !value.posterImageUrl.startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["posterImageUrl"],
        message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다.",
      });
    }
  });

export type RecruitmentSettingsActionState = {
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

async function validatePosterFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      success: true as const,
      file: undefined,
    };
  }

  if (!await validateAdminImage(fileEntry, posterImageRule)) {
    return {
      success: false as const,
      message: "포스터 이미지는 JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다." },
    };
  }

  if (fileEntry.size > maxPosterFileSize) {
    return {
      success: false as const,
      message: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다." },
    };
  }

  // 구형 서버 경유 요청은 플랫폼 본문 한도 아래로 제한합니다.
  if (fileEntry.size > 3 * 1024 * 1024) {
    return { success: false as const, message: "포스터를 다시 선택해 업로드해주세요.", fieldErrors: { posterFile: "포스터를 다시 선택해 업로드해주세요." } };
  }

  return {
    success: true as const,
    file: fileEntry,
  };
}

/** 브라우저가 전달한 포스터 URL은 저장 전에 Blob 실물과 소유자를 다시 검증합니다. */
async function getDirectPosterUrl(formData: FormData, userId: string): Promise<string | null> {
  const value = formData.get("uploadedPosterUrl");
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2_000) throw new Error("업로드한 포스터 정보가 올바르지 않습니다.");
  return prepareStoredPoster(value, userId);
}

/** 변환 실패는 호출자의 안전한 폼 오류로 처리하며 원본 저장으로 우회하지 않습니다. */
async function uploadPosterFile(file: File, uploadedById: string) {
  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const webpBuffer = await sharp(originalBuffer).webp({ quality: 85 }).toBuffer();
  return uploadWithOwnedIntent({
    namespace: "recruitment", extension: "webp", body: webpBuffer,
    contentType: "image/webp", uploadedById,
  });
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

export async function getRecruitmentSettings() {
  const session = await requireAdmin();
  return getSettings({ userId: session.user.id, role: session.user.role });
}

export async function updateRecruitmentSettings(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  const session = await requireAdmin();

  const parsed = recruitmentSettingsSchema.safeParse({
    posterInputMode: normalizeText(formData.get("posterInputMode")),
    posterImageUrl: normalizeText(formData.get("posterImageUrl")) || undefined,
    activeCohortId: normalizeText(formData.get("activeCohortId")) || undefined,
    recruitmentStatus: normalizeText(formData.get("recruitmentStatus")) || undefined,
    googleFormUrl: normalizeText(formData.get("googleFormUrl")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    deadlineDate: normalizeText(formData.get("deadlineDate")) || undefined,
    detailsMarkdown: normalizeText(formData.get("detailsMarkdown")) || undefined,
    posterLayout: normalizeText(formData.get("posterLayout")) || "right",
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const removePoster = normalizeText(formData.get("removePoster")) === "true";
  const validatedPosterFile = await validatePosterFile(formData.get("posterFile"));

  if (!validatedPosterFile.success) {
    return {
      success: false,
      message: validatedPosterFile.message,
      fieldErrors: validatedPosterFile.fieldErrors,
    };
  }

  let nextPosterImageUrl: string | null = await getPosterImageUrl({ userId: session.user.id, role: session.user.role });
  // 직접·서버 업로드 모두 원장으로 추적해 응답 유실 후 현재 참조를 재확인합니다.

  if (removePoster) {
    nextPosterImageUrl = null;
  } else if (parsed.data.posterInputMode === "file") {
    if (formData.has("uploadedPosterUrl") || validatedPosterFile.file) {
      // 업로드 실패는 예외로 흘려보내지 않고 폼 메시지로 돌려준다 (그렇지 않으면 오류 화면으로 넘어간다).
      try {
        if (formData.has("uploadedPosterUrl")) {
          nextPosterImageUrl = await getDirectPosterUrl(formData, session.user.id);
        } else if (validatedPosterFile.file) {
          nextPosterImageUrl = await uploadPosterFile(validatedPosterFile.file, session.user.id);
        }
      } catch (error) {
        logServerError("recruitment-settings/poster-upload", error);
        return {
          success: false,
          message: "포스터 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
          fieldErrors: { posterFile: "포스터 업로드에 실패했습니다." },
        };
      }
    }
  } else {
    nextPosterImageUrl = parsed.data.posterImageUrl ?? null;
  }

  // 커밋 후 응답 유실도 가능하므로 새 객체를 삭제하지 않고 원장 정리에 맡깁니다.
  await saveSettings({ userId: session.user.id, role: session.user.role }, {
    ...parsed.data, posterImageUrl: nextPosterImageUrl,
  });

  // 이전 URL은 관리자 입력값일 수 있습니다. 같은 Blob 도메인이어도 현재 설정이
  // 파일 소유자임을 증명하지 못하므로 교체·제거 시 자동 삭제하지 않습니다 (#88).

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return {
    success: true,
    message: "모집 설정을 저장했습니다.",
  };
}

// 기수 선택 드롭다운용 — 전체 기수 목록을 최신 순으로 반환
export async function getCohorts() {
  const session = await requireAdmin();
  return getCohortOptions({ userId: session.user.id, role: session.user.role });
}

// ─── 섹션별 독립 저장 액션 ────────────────────────────────────────────────────

/**
 * 섹션 1: 현재 모집 정보 저장
 * 저장 대상: activeCohortId, googleFormUrl, recruitmentStartDate, deadlineDate
 */
export async function updateRecruitmentInfo(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  const session = await requireAdmin();

  const infoSchema = z.object({
    activeCohortId: z.union([z.uuid("올바른 기수를 선택해주세요."), z.literal("")]).optional(),
    googleFormUrl: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.startsWith("https://"), { message: "구글폼 URL은 https://로 시작해야 합니다." }),
    recruitmentStartDate: z.union([dateStringSchema, z.literal("")]).optional(),
    deadlineDate: z.union([dateStringSchema, z.literal("")]).optional(),
  }).refine(
    (value) => !value.recruitmentStartDate || !value.deadlineDate ||
      value.recruitmentStartDate <= value.deadlineDate,
    { path: ["deadlineDate"], message: "모집 종료일은 시작일 이후여야 합니다." },
  );

  const parsed = infoSchema.safeParse({
    activeCohortId: normalizeText(formData.get("activeCohortId")) || undefined,
    googleFormUrl: normalizeText(formData.get("googleFormUrl")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    deadlineDate: normalizeText(formData.get("deadlineDate")) || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await saveInfo({ userId: session.user.id, role: session.user.role }, parsed.data);

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "현재 모집 정보를 저장했습니다." };
}

/**
 * 섹션 2: 모집 포스터 저장
 * 저장 대상: posterImageUrl (파일 업로드 또는 URL), posterLayout
 */
export async function updateRecruitmentPoster(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  const session = await requireAdmin();

  const posterSchema = z.object({
    posterInputMode: posterInputModeSchema,
    posterImageUrl: z.string().trim().optional(),
    posterLayout: z.enum(["right", "left", "none"]).default("right"),
  }).superRefine((value, ctx) => {
    if (value.posterInputMode === "url" && value.posterImageUrl) {
      if (!value.posterImageUrl.startsWith("http://") && !value.posterImageUrl.startsWith("https://")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["posterImageUrl"], message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다." });
      }
    }
  });

  const parsed = posterSchema.safeParse({
    posterInputMode: normalizeText(formData.get("posterInputMode")) || "file",
    posterImageUrl: normalizeText(formData.get("posterImageUrl")) || undefined,
    posterLayout: normalizeText(formData.get("posterLayout")) || "right",
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const removePoster = normalizeText(formData.get("removePoster")) === "true";
  const validatedPosterFile = await validatePosterFile(formData.get("posterFile"));

  if (!validatedPosterFile.success) {
    return { success: false, message: validatedPosterFile.message, fieldErrors: validatedPosterFile.fieldErrors };
  }

  let nextPosterImageUrl: string | null = await getPosterImageUrl({ userId: session.user.id, role: session.user.role });
  // 직접·서버 업로드 모두 원장으로 추적해 응답 유실 후 현재 참조를 재확인합니다.

  if (removePoster) {
    nextPosterImageUrl = null;
  } else if (parsed.data.posterInputMode === "file") {
    if (formData.has("uploadedPosterUrl") || validatedPosterFile.file) {
      // 업로드 실패는 예외로 흘려보내지 않고 폼 메시지로 돌려준다 (그렇지 않으면 오류 화면으로 넘어간다).
      try {
        if (formData.has("uploadedPosterUrl")) {
          nextPosterImageUrl = await getDirectPosterUrl(formData, session.user.id);
        } else if (validatedPosterFile.file) {
          nextPosterImageUrl = await uploadPosterFile(validatedPosterFile.file, session.user.id);
        }
      } catch (error) {
        logServerError("recruitment-settings/poster-upload", error);
        return {
          success: false,
          message: "포스터 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.",
          fieldErrors: { posterFile: "포스터 업로드에 실패했습니다." },
        };
      }
    }
  } else {
    nextPosterImageUrl = parsed.data.posterImageUrl ?? null;
  }

  // 커밋 후 응답 유실도 가능하므로 새 객체를 삭제하지 않고 원장 정리에 맡깁니다.
  await savePoster({ userId: session.user.id, role: session.user.role }, {
    posterImageUrl: nextPosterImageUrl, posterLayout: parsed.data.posterLayout,
  });

  // 이전 URL은 파일 소유권을 확인할 수 없으므로 자동 삭제하지 않습니다 (#88).

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "모집 포스터를 저장했습니다." };
}

/**
 * 섹션 3: 모집 세부 안내 저장
 * 저장 대상: detailsMarkdown
 */
export async function updateRecruitmentDetails(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  const session = await requireAdmin();

  const detailsSchema = z.object({
    detailsMarkdown: z.string().trim().max(20000, "세부 안내는 20000자 이하여야 합니다.").optional(),
  });

  const parsed = detailsSchema.safeParse({
    detailsMarkdown: normalizeText(formData.get("detailsMarkdown")) || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await saveDetails({ userId: session.user.id, role: session.user.role }, parsed.data);

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return { success: true, message: "모집 세부 안내를 저장했습니다." };
}
