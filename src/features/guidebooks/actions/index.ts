/**
 * 가이드북 서버 액션
 *
 * 역할: 관리자 페이지(/admin/resources/guidebooks)에서 가이드북 파일(PDF/HWP/DOC 등)의
 *       업로드(생성)와 삭제를 처리한다. 파일은 Vercel Blob에, 메타는 Postgres에 저장한다.
 *
 * 사용 위치:
 *   - src/app/(admin)/admin/resources/guidebooks/_components/guidebook-form.tsx (생성 폼)
 *   - src/app/(admin)/admin/resources/guidebooks/_components/guidebook-row-actions.tsx (삭제)
 *
 * 보안:
 *   - 모든 진입점에서 requireAdmin()으로 관리자 권한 확인
 *   - 파일 확장자·시작 바이트·선언 MIME 검사 + 30MB 크기 제한
 *   - 파일명 sanitize (영숫자/.-_만 허용) — 경로 분리(/) 차단
 */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import {
  createAdminGuidebook,
  deleteAdminGuidebook,
  getGuidebookUpdateTarget,
  replaceAdminGuidebookFile,
  updateAdminGuidebookTitle,
} from "@/features/guidebooks/admin/service";
import { logServerError } from "@/lib/errors";
import { validateResourceUploadReference } from "@/lib/resource-upload-server";

export type GuidebookActionState = {
  success: boolean;
  error?: string;
};

const guidebookIdSchema = z.uuid("유효하지 않은 가이드북 ID입니다.");

const guidebookFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
});

const revalidateGuidebookPaths = () => {
  revalidatePath("/admin/resources/guidebooks");
  revalidatePath("/resources");
};

export async function createGuidebook(formData: FormData): Promise<GuidebookActionState> {
  const session = await requireAdmin();

  const parsed = guidebookFormSchema.safeParse({
    title: formData.get("title"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const uploadedFileUrl = formData.get("uploadedFileUrl");
  const uploadedFileName = formData.get("uploadedFileName");
  if (typeof uploadedFileUrl !== "string" || typeof uploadedFileName !== "string") {
    return { success: false, error: "파일을 다시 업로드해주세요." };
  }

  try {
    const uploaded = await validateResourceUploadReference("guidebooks", session.user.id, uploadedFileUrl, uploadedFileName);
    if ("error" in uploaded) return { success: false, error: uploaded.error };

    await createAdminGuidebook({ userId: session.user.id, role: session.user.role }, {
      title: parsed.data.title,
      fileUrl: uploaded.url,
      fileName: uploaded.fileName,
    });

    revalidateGuidebookPaths();

    return { success: true };
  } catch (error) {
    logServerError("guidebooks/create", error, {
      hasFile: true,
    });

    // 사용자 응답에 raw error.message 를 노출하지 않는다. Drizzle NeonHttpError·Blob 오류는
    // SQL query text·PII·인프라 세부를 포함할 수 있어 관리자 UI 로 반환되면 정보 유출이 된다.
    // 원본 예외는 위의 logServerError 로 서버 로그에만 기록되며, 사용자에게는 재시도 안내만 반환한다.
    return {
      success: false,
      error: "가이드북 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}

/**
 * 기존 가이드북 수정 — 제목 변경, 파일 교체(선택)
 * 새 파일이 없으면 기존 파일을 그대로 유지한다.
 */
export async function updateGuidebook(id: string, formData: FormData): Promise<GuidebookActionState> {
  const session = await requireAdmin();

  const parsedId = guidebookIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다." };
  }

  const parsed = guidebookFormSchema.safeParse({
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role };
    const target = await getGuidebookUpdateTarget(actor, parsedId.data);
    if (!target) {
      return { success: false, error: "가이드북을 찾을 수 없습니다." };
    }

    const fileEntry = formData.get("file");
    if (fileEntry instanceof File && fileEntry.size > 0) {
      return { success: false, error: "파일을 다시 업로드해주세요." };
    }
    const uploadedFileUrl = formData.get("uploadedFileUrl");
    const uploadedFileName = formData.get("uploadedFileName");
    const hasNewFile = typeof uploadedFileUrl === "string" && uploadedFileUrl.length > 0;

    if (hasNewFile) {
      // 새 파일 검증 및 업로드 후 DB 참조를 교체합니다. 이전 파일은 소유권이
      // 확인되지 않아 즉시 삭제하지 않습니다 (#93).
      if (typeof uploadedFileName !== "string") return { success: false, error: "파일을 다시 업로드해주세요." };
      const uploaded = await validateResourceUploadReference("guidebooks", session.user.id, uploadedFileUrl, uploadedFileName);
      if ("error" in uploaded) return { success: false, error: uploaded.error };

      const result = await replaceAdminGuidebookFile(actor, parsedId.data, {
        title: parsed.data.title, fileUrl: uploaded.url, fileName: uploaded.fileName,
        previousFileUrl: target.fileUrl,
      });
      if (!result.success) return result;

    } else {
      // 파일 교체 없이 제목만 수정
      const result = await updateAdminGuidebookTitle(actor, parsedId.data, parsed.data.title);
      if (!result.success) return result;
    }

    revalidateGuidebookPaths();
    return { success: true };
  } catch (error) {
    logServerError("guidebooks/update", error, {
      id: parsedId.data,
      hasNewFile: formData.get("file") instanceof File,
    });
    // createGuidebook 과 동일 정책 — raw error.message 를 사용자에게 노출하지 않는다.
    return { success: false, error: "가이드북 수정에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export async function deleteGuidebook(id: string): Promise<GuidebookActionState> {
  const session = await requireAdmin();

  const parsedId = guidebookIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: parsedId.error.issues[0]?.message ?? "유효하지 않은 가이드북 ID입니다.",
    };
  }

  try {
    const result = await deleteAdminGuidebook({ userId: session.user.id, role: session.user.role }, parsedId.data);
    if (!result.success) return result;

    revalidateGuidebookPaths();

    return { success: true };
  } catch (error) {
    logServerError("guidebooks/delete", error, {
      id: parsedId.data,
    });

    return {
      success: false,
      error: "가이드북 삭제에 실패했습니다.",
    };
  }
}
