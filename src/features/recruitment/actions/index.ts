/**
 * 모집(기수) 관리 서버 액션 파일
 * 
 * 역할: 관리자가 새로운 기수(모집)를 만들고, 수정하고, 삭제할 수 있게 해주는 파일입니다.
 * 예: 2025학년도 1기 모집을 만들고, 모집 기간을 정하고, 마감하는 작업들이 여기서 일어납니다.
 * 
 * "use server" 표기: 이 파일의 모든 함수는 서버에서만 실행되므로, 비밀 정보(DB 접근)를 안전하게 다룰 수 있습니다.
 */
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { createAdminCohort, updateAdminCohort, deleteAdminCohort, isCohortReferenceViolation } from "@/features/recruitment/admin/service";
import { logServerError } from "@/lib/errors";
import { validateAdminImage } from "@/lib/admin-image-validation";
import { galleryImageRule } from "@/lib/gallery-upload-contract";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";


/**
 * 기수 정보 유효성 검사 스키마
 *
 * 기수 소개 페이지(/cohorts)에 표시되는 정보만 검증합니다.
 * 모집 관련 정보(모집 상태, 날짜, 구글폼)는 모집 설정에서 관리합니다.
 */
const cohortSchema = z
  .object({
    name: z.string().trim().min(1, "기수명을 입력해주세요.").max(100, "기수명은 100자 이하여야 합니다."),
    description: z
      .string()
      .trim()
      .max(5000, "설명은 5000자 이하여야 합니다.")
      .optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    isActive: z.boolean(),
    order: z.coerce
      .number({ message: "정렬 순서는 숫자여야 합니다." })
      .int("정렬 순서는 정수여야 합니다."),
  })
  .superRefine((data, ctx) => {
    const parseDateString = (value: string | undefined, path: string) => {
      if (!value) return null;

      const isDateInputFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isDateInputFormat) {
        ctx.addIssue({ code: "custom", message: "날짜 형식이 올바르지 않습니다.", path: [path] });
        return null;
      }

      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: "custom", message: "유효한 날짜를 입력해주세요.", path: [path] });
        return null;
      }

      return parsed;
    };

    const startDate = parseDateString(data.startDate, "startDate");
    const endDate = parseDateString(data.endDate, "endDate");

    if (startDate && endDate && startDate > endDate) {
      ctx.addIssue({
        code: "custom",
        message: "기수 시작일은 종료일보다 늦을 수 없습니다.",
        path: ["endDate"],
      });
    }
  });

export type CohortActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * 텍스트를 정리하는 헬퍼 함수
 * 역할: 사용자가 입력한 값 앞뒤의 공백을 제거하거나, 잘못된 형식이면 빈 문자열로 반환
 * 예: "  안녕하세요  " → "안녕하세요"
 */
function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * 문자열을 Date 객체로 변환하거나 null 반환
 * 역할: "2025-03-24" 형식의 문자열을 날짜 객체로 변환하거나, 빈 값이면 null 반환
 * 예: "2025-03-24" → Date(2025, 3, 24) / "" → null
 */
function toDateOrNull(value: string | undefined) {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`);
}

/**
 * Zod 검증 에러를 필드별 에러로 변환하는 함수
 * 역할: 검증에 실패한 여러 오류를 "필드명: 에러 메시지" 형태로 정렬
 * 예: [{ path: ["name"], message: "필수 항목" }] → { name: "필수 항목" }
 */
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

/**
 * 폼 데이터를 기수 정보로 파싱하고 검증하는 함수
 * 역할: 사용자가 폼에 입력한 값들을 정리하고, cohortSchema로 검증
 * 예: FormData → { name: "1기", order: 1, ... } (또는 에러 반환)
 */
function parseCohortFormData(formData: FormData) {
  return cohortSchema.safeParse({
    name: normalizeText(formData.get("name")),
    description: normalizeText(formData.get("description")) || undefined,
    startDate: normalizeText(formData.get("startDate")) || undefined,
    endDate: normalizeText(formData.get("endDate")) || undefined,
    isActive: formData.get("isActive") === "on",
    order: normalizeText(formData.get("order")) || "0",
  });
}

async function uploadCohortImage(fileEntry: FormDataEntryValue | null, uploadedById: string) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return { imageUrl: null, error: null } as const;
  }

  const image = await validateAdminImage(fileEntry, galleryImageRule);
  if (!image) {
    return { imageUrl: null, error: "이미지는 JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다." } as const;
  }

  const maxFileSize = 4 * 1024 * 1024;
  if (fileEntry.size > maxFileSize) {
    return { imageUrl: null, error: "이미지 파일은 4MB 이하여야 합니다." } as const;
  }

  // 실제 사용 중인 기수 FormData 업로드는 유지하되 UUID 경로를 원장에 선예약해 저장합니다 (#302).
  const imageUrl = await uploadWithOwnedIntent({
    namespace: "cohorts",
    extension: image.extension,
    body: fileEntry,
    contentType: image.contentType,
    uploadedById,
  });

  return { imageUrl, error: null } as const;
}

/**
 * 새로운 기수(모집) 생성 서버 액션
 * 역할: 관리자가 새로운 기수를 만들 때 호출되는 함수
 * 
 * 단계:
 * 1. 관리자 권한 확인 (requireAdmin)
 * 2. 입력 데이터 검증 (parseCohortFormData)
 * 3. 검증 통과 시 데이터베이스에 저장
 * 4. 페이지 새로고침 및 리다이렉트
 * 
 * 반환값: { success, message, fieldErrors? } 형태의 상태 정보
 */
export async function createCohort(formData: FormData): Promise<CohortActionState> {
  const session = await requireAdmin();

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const uploadedImage = await uploadCohortImage(formData.get("image"), session.user.id);
  if (uploadedImage.error) {
    return {
      success: false,
      message: uploadedImage.error,
      fieldErrors: { image: uploadedImage.error },
    };
  }

  await createAdminCohort({ userId: session.user.id, role: session.user.role }, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    startDate: toDateOrNull(parsed.data.startDate),
    endDate: toDateOrNull(parsed.data.endDate),
    isActive: parsed.data.isActive,
    order: parsed.data.order,
    imageUrl: uploadedImage.imageUrl,
  });

  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
  redirect("/admin/recruitment");
}

/**
 * 기수 정보 수정 서버 액션
 * 역할: 관리자가 이미 만들어진 기수의 정보를 변경할 때 호출되는 함수
 * 
 * 단계:
 * 1. 기수 ID 유효성 확인
 * 2. 입력 데이터 검증
 * 3. 데이터베이스의 기수 정보 업데이트
 * 4. 페이지 새로고침 및 리다이렉트
 * 
 * 매개변수: id (기수의 고유 ID), formData (수정할 정보)
 */
export async function updateCohort(id: string, formData: FormData): Promise<CohortActionState> {
  const session = await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 기수 ID입니다.",
    };
  }

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  // 서비스가 기존 이미지 조회 뒤 콜백을 실행하므로 파일 검증·업로드 순서가 유지됩니다.
  const result = await updateAdminCohort({ userId: session.user.id, role: session.user.role }, parsedId.data, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    startDate: toDateOrNull(parsed.data.startDate),
    endDate: toDateOrNull(parsed.data.endDate),
    isActive: parsed.data.isActive,
    // 기수 폼에는 정렬 순서 입력이 없다. 값이 넘어온 경우에만 갱신해 기존 순서를 0 으로 덮어쓰지 않는다 (#115).
    ...(formData.has("order") ? { order: parsed.data.order } : {}),
    shouldRemoveImage: formData.get("removeImage") === "true",
    uploadImage: () => uploadCohortImage(formData.get("image"), session.user.id),
  });
  if (!result.success) return result;

  // 이전 이미지도 즉시 삭제하지 않습니다. 소유권 원장과 현재 공유 참조를 확인하는
  // 유지보수 정리 작업에 맡겨 다른 콘텐츠가 같은 URL을 쓰는 경우를 보존합니다 (#88).

  revalidatePath("/admin/recruitment");
  revalidatePath("/cohorts");
  revalidatePath("/recruitment");
  redirect("/admin/recruitment");
}

/** 제출 데이터가 있는 기수의 삭제를 거절하고, 성공 시 등록된 이미지는 정리 원장에 남깁니다. */
export async function deleteCohort(id: string): Promise<CohortActionState> {
  const session = await requireAdmin();

  const parsedId = z.uuid("잘못된 기수 ID입니다.").safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "잘못된 기수 ID입니다." };
  }

  try {
    const result = await deleteAdminCohort({ userId: session.user.id, role: session.user.role }, parsedId.data);
    if (!result.success) return result;

    // 업로드 소유권 원장의 파일은 공유 참조 검사와 쓰기 중단 조건을 갖춘 정리 작업에서만 삭제합니다.
    // 기존 미등록 이미지의 소유권을 URL만 보고 추정하지 않습니다 (#88).
    revalidatePath("/admin/recruitment");
    revalidatePath("/cohorts");
    revalidatePath("/recruitment");
    return { success: true, message: "기수가 삭제되었습니다." };
  } catch (error) {
    if (isCohortReferenceViolation(error)) {
      return { success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." };
    }
    logServerError("recruitment/deleteCohort", error, { id: parsedId.data });
    return { success: false, message: "연결된 데이터가 있거나 기수를 삭제할 수 없습니다. 다시 확인해주세요." };
  }
}
