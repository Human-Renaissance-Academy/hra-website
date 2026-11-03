"use server";

/** 강의자료 입력 파싱·세션·캐시 후처리와 기존 오류 경계를 유지하는 Web 어댑터입니다. */
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { getAdminMutationTarget, updateAdminMaterial, deleteAdminMaterial } from "@/features/class-materials/admin/service";
import { createUploadedMaterial } from "@/features/class-materials/upload/service";
import { logServerError } from "@/lib/errors";
import { validateResourceUploadReference } from "@/lib/resource-upload-server";

export type ClassMaterialActionState = {
  success: boolean;
  error?: string;
};

const CLASS_MATERIAL_AUDIENCE_VALUES = ["FACULTY", "STUDENT"] as const;

const classMaterialIdSchema = z.uuid("유효하지 않은 강의 자료 ID입니다.");

const classMaterialFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  weekNumber: z
    .union([z.literal(""), z.coerce.number().int("주차는 정수로 입력해주세요.").min(1, "주차는 1 이상이어야 합니다.")])
    .optional(),
  lectureTitle: z
    .union([z.literal(""), z.string().trim().max(200, "강의명은 200자 이하여야 합니다.")])
    .optional(),
  audience: z.enum(CLASS_MATERIAL_AUDIENCE_VALUES, {
    error: "자료 대상을 선택해주세요.",
  }),
  classDate: z.string().optional().nullable(),
});

const revalidateClassMaterialPaths = () => {
  revalidatePath("/admin/resources/class-materials");
  revalidatePath("/resources");
  revalidatePath("/resources/class-materials");
};

export async function createClassMaterial(
  formData: FormData,
): Promise<ClassMaterialActionState> {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user) {
    return {
      success: false,
      error: "로그인 후 이용해주세요.",
    };
  }

  if (role !== "ADMIN" && role !== "FACULTY") {
    return {
      success: false,
      error: "교수진과 관리자만 강의 자료를 업로드할 수 있습니다.",
    };
  }

  const parsed = classMaterialFormSchema.safeParse({
    title: formData.get("title"),
    weekNumber: formData.get("weekNumber"),
    lectureTitle: formData.get("lectureTitle"),
    audience: formData.get("audience"),
    classDate: formData.get("classDate"),
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
    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    const uploaded = await validateResourceUploadReference("class-materials", session.user.id, uploadedFileUrl, uploadedFileName);
    if ("error" in uploaded) return { success: false, error: uploaded.error };

    await createUploadedMaterial({ userId: session.user.id, role }, {
      title: parsed.data.title,
      fileUrl: uploaded.url,
      fileName: uploaded.fileName,
      weekNumber: parsed.data.weekNumber === "" || parsed.data.weekNumber === undefined ? null : parsed.data.weekNumber,
      lectureTitle:
        parsed.data.lectureTitle === "" || parsed.data.lectureTitle === undefined
          ? null
          : parsed.data.lectureTitle,
      audience: parsed.data.audience,
      classDate: classDateObj,
    });

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    logServerError("class-materials/create", error, {
      audience: parsed.data.audience,
      hasUploadedBlob: true,
    });

    // INSERT 응답 오류만으로 커밋 여부를 단정할 수 없습니다. 원장에 남은
    // 미참조 파일은 쓰기를 멈춘 정리 작업에서 재검증한 뒤 삭제합니다.

    return {
      success: false,
      error: "강의 자료 저장에 실패했습니다.",
    };
  }
}

/**
 * 기존 강의 자료 수정 — 텍스트 필드 변경, 파일 교체(선택)
 * 새 파일이 없으면 기존 파일을 그대로 유지한다.
 */
export async function updateClassMaterial(id: string, formData: FormData): Promise<ClassMaterialActionState> {
  const session = await requireAdmin();

  const parsedId = classMaterialIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다." };
  }

  const parsed = classMaterialFormSchema.safeParse({
    title: formData.get("title"),
    weekNumber: formData.get("weekNumber"),
    lectureTitle: formData.get("lectureTitle"),
    audience: formData.get("audience"),
    classDate: formData.get("classDate"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  }

  try {
    const actor = { userId: session.user.id, role: session.user.role };
    const target = await getAdminMutationTarget(actor, parsedId.data);
    if (!target) {
      return { success: false, error: "강의 자료를 찾을 수 없습니다." };
    }

    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    const textFields = {
      title: parsed.data.title,
      weekNumber: parsed.data.weekNumber === "" || parsed.data.weekNumber === undefined ? null : parsed.data.weekNumber,
      lectureTitle: parsed.data.lectureTitle === "" || parsed.data.lectureTitle === undefined ? null : parsed.data.lectureTitle,
      audience: parsed.data.audience,
      // 관리자 폼에는 날짜 입력이 없으므로 필드가 빠졌다면 기존 날짜를 보존합니다.
      classDate: formData.has("classDate") ? classDateObj : target.classDate,
    };

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
      const uploaded = await validateResourceUploadReference("class-materials", session.user.id, uploadedFileUrl, uploadedFileName);
      if ("error" in uploaded) return { success: false, error: uploaded.error };

      const updated = await updateAdminMaterial(actor, {
        id: parsedId.data, textFields,
        file: { url: uploaded.url, fileName: uploaded.fileName, previousUrl: target.fileUrl },
      });
      if (!updated) {
        return { success: false, error: "강의 자료 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
      }

    } else {
      // 파일 교체 없이 텍스트 필드만 수정
      const updated = await updateAdminMaterial(actor, { id: parsedId.data, textFields });
      if (!updated) return { success: false, error: "강의 자료를 찾을 수 없습니다." };
    }

    revalidateClassMaterialPaths();
    return { success: true };
  } catch (error) {
    logServerError("class-materials/update", error, {
      id: parsedId.data,
      audience: parsed.data.audience,
    });
    return { success: false, error: "강의 자료 수정에 실패했습니다." };
  }
}

export async function deleteClassMaterial(id: string): Promise<ClassMaterialActionState> {
  const session = await requireAdmin();

  const parsedId = classMaterialIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: parsedId.error.issues[0]?.message ?? "유효하지 않은 강의 자료 ID입니다.",
    };
  }

  try {
    const deleted = await deleteAdminMaterial({ userId: session.user.id, role: session.user.role }, parsedId.data);
    if (!deleted) return { success: false, error: "강의 자료를 찾을 수 없습니다." };

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    logServerError("class-materials/delete", error, {
      id: parsedId.data,
    });

    return {
      success: false,
      error: "강의 자료 삭제에 실패했습니다.",
    };
  }
}
