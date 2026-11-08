/**
 * 승인 회원 강의 자료 상세·메타데이터용 Web Repository (#271).
 * 파일 URL, Blob 토큰, 업로더 계정 ID는 표시하지 않으며, 직접 다운로드는 별도 API로만 처리합니다.
 */
import "server-only";

import { and, eq } from "drizzle-orm";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

export type ClassMaterialReader = { id?: string; role?: string };

export type WebClassMaterialDetail = {
  id: string;
  title: string;
  fileName: string;
  audience: string;
  weekNumber: number | null;
  lectureTitle: string | null;
};

/** 제목도 조회 대상과 사용자 역할을 동일한 SQL WHERE에서 검사합니다. */
export async function findWebClassMaterialTitle(
  user: ClassMaterialReader, id: string,
): Promise<string | null> {
  const [material] = await db.select({ title: classMaterials.title })
    .from(classMaterials)
    .where(and(eq(classMaterials.id, id), classMaterialReadFilter(user)))
    .limit(1);
  return material?.title ?? null;
}

/** Page가 사용하는 표시 필드만 조회하고 실제 Blob URL은 포함하지 않습니다. */
export async function findWebClassMaterialDetail(
  user: ClassMaterialReader, id: string,
): Promise<WebClassMaterialDetail | null> {
  const [material] = await db.select({
    id: classMaterials.id,
    title: classMaterials.title,
    fileName: classMaterials.fileName,
    audience: classMaterials.audience,
    weekNumber: classMaterials.weekNumber,
    lectureTitle: classMaterials.lectureTitle,
  })
    .from(classMaterials)
    .where(and(eq(classMaterials.id, id), classMaterialReadFilter(user)))
    .limit(1);
  return material ?? null;
}
