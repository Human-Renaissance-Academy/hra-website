/**
 * 강의자료 Web Application Service (#271).
 * 미인가/손상 UUID 요청이 DB Repository에 들어가지 않도록 거르고,
 * Repository에서 기존 audience SQL predicate를 반드시 적용합니다.
 */
import "server-only";

import { z } from "zod/v4";
import { canReadSharedResource } from "@/features/resources/access";
import {
  findWebClassMaterialTitle,
  findWebClassMaterialDetail,
  type ClassMaterialReader,
} from "./repository";

function validatedId(user: ClassMaterialReader | null | undefined, id: string): string | null {
  if (!user?.id || !canReadSharedResource(user.role)) return null;
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}

export async function getWebClassMaterialTitle(
  user: ClassMaterialReader | null | undefined,
  id: string,
): Promise<string | null> {
  const validId = validatedId(user, id);
  return validId ? findWebClassMaterialTitle(user!, validId) : null;
}

export async function getWebClassMaterialDetail(
  user: ClassMaterialReader | null | undefined,
  id: string,
) {
  const validId = validatedId(user, id);
  return validId ? findWebClassMaterialDetail(user!, validId) : null;
}
