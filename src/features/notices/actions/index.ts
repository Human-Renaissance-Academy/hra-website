"use server";

/**
 * 관리자 공지사항 생성·수정·삭제와 고정·게시 상태 반전을 처리한다.
 * 반전은 요청마다 실행하는 명령이며, 반환 안내는 그 명령이 저장한 상태를 나타낸다.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import * as noticeService from "@/features/notices/admin/service";

const noticeFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  pinned: z.boolean(),
});

export type NoticeActionState = {
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

function parsePinned(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return false;
  }

  return value === "on" || value === "true";
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

function parseNoticeFormData(formData: FormData) {
  return noticeFormSchema.safeParse({
    title: normalizeText(formData.get("title")),
    content: normalizeText(formData.get("content")),
    status: normalizeText(formData.get("status")),
    pinned: parsePinned(formData.get("pinned")),
  });
}

function parseNoticeId(id: string) {
  return z.uuid().safeParse(id);
}

function revalidateNoticePaths() {
  revalidatePath("/admin/notices");
  revalidatePath("/notices");
}

export async function createNotice(formData: FormData): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsed = parseNoticeFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await noticeService.createNotice({ userId: session.user.id, role: session.user.role }, parsed.data);

  revalidateNoticePaths();
  redirect("/admin/notices");
}

export async function updateNotice(id: string, formData: FormData): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const parsed = parseNoticeFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  if (!(await noticeService.updateNotice(
    { userId: session.user.id, role: session.user.role }, parsedId.data, parsed.data,
  ))) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  redirect("/admin/notices");
}

export async function deleteNotice(id: string): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  if (!(await noticeService.deleteNotice(
    { userId: session.user.id, role: session.user.role }, parsedId.data,
  ))) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  return {
    success: true,
    message: "공지사항이 삭제되었습니다.",
  };
}

/**
 * 클릭마다 현재 DB 값을 한 번 반전한다. 재전송도 별도 반전이며 중복 실행 방지는 보장하지 않는다.
 * 응답은 해당 UPDATE의 저장값 기준이고, 이후 다른 명령으로 상태가 다시 바뀔 수 있다.
 */
export async function togglePin(id: string): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const updated = await noticeService.togglePin(
    { userId: session.user.id, role: session.user.role }, parsedId.data,
  );

  if (!updated) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  return {
    success: true,
    message: updated.pinned ? "공지사항을 고정했습니다." : "공지사항 고정을 해제했습니다.",
  };
}

/** 게시 반전도 요청마다 적용하며, 재전송·후속 명령의 의미는 togglePin과 동일하다. */
export async function toggleStatus(id: string): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const updated = await noticeService.toggleStatus(
    { userId: session.user.id, role: session.user.role }, parsedId.data,
  );

  if (!updated) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  return {
    success: true,
    message:
      updated.status === "PUBLISHED"
        ? "공지사항을 게시했습니다."
        : "공지사항을 임시저장 상태로 변경했습니다.",
  };
}
