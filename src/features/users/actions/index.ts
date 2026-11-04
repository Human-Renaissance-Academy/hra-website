/**
 * 회원 관리자 Web 서버 액션입니다.
 * 입력·세션을 검증하고 서비스의 업무 결과에 기존 웹 캐시·고정 로그 처리를 적용합니다.
 */
"use server";

import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { logServerError } from "@/lib/errors";
import { changeAdminUserGroup, deleteAdminUser } from "@/features/users/admin/service";

// 기존 드롭다운 값·검증 메시지·첫 오류 우선순위를 그대로 유지합니다.
const groupValueSchema = z.union([
  z.enum(["ADMIN", "FACULTY", "PENDING"]),
  z.uuid("올바른 기수 ID가 아닙니다."),
]);

const updateGroupSchema = z.object({
  userId: z.uuid("올바른 사용자 ID가 필요합니다."),
  groupValue: groupValueSchema,
});

export type ActionResult = {
  success: boolean;
  message: string;
};

/** 관리자 세션→입력 검증→서비스 저장 완료→목록·상세 캐시 순서를 유지합니다. */
export async function updateUserGroup(
  userId: string,
  groupValue: string
): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = updateGroupSchema.safeParse({ userId, groupValue });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const result = await changeAdminUserGroup(
    { userId: session.user.id, role: session.user.role }, parsed.data,
  );
  if (!result.success) return result;

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);

  return { success: true, message: "그룹이 변경되었습니다." };
}

const deleteUserSchema = z.object({
  userId: z.uuid("올바른 사용자 ID가 필요합니다."),
});

/** 서비스가 삭제 SQL만 분류하며 웹 캐시 오류는 원본처럼 catch 밖에서 전파합니다. */
export async function deleteUser(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = deleteUserSchema.safeParse({ userId });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const outcome = await deleteAdminUser(
    { userId: session.user.id, role: session.user.role }, parsed.data.userId,
  );
  switch (outcome.kind) {
    case "delete-error":
      // Drizzle 오류의 쿼리·매개변수·cause를 로거에 전달하지 않는다.
      logServerError("users/delete", new Error("회원 삭제 처리 실패"), { userId: parsed.data.userId });
      return { success: false, message: "회원 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
    case "result":
      if (!outcome.result.success) return outcome.result;
      break;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }

  revalidatePath("/admin/users");

  return { success: true, message: "회원이 삭제되었습니다." };
}
