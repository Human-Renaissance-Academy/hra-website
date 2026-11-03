/**
 * 관리자 가이드북의 PostgreSQL 접근을 소유합니다.
 * 기존 조회 투영·호출 체인과 이전 파일 URL을 비교하는 낙관적 갱신 조건을 유지합니다.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

export type GuidebookInput = {
  readonly title: string;
  readonly fileUrl: string;
  readonly fileName: string;
};
export type GuidebookReplacement = GuidebookInput & { readonly previousFileUrl: string };

/** 목록은 기존 다섯 열의 순서와 생성일 내림차순을 그대로 사용합니다. */
export async function listGuidebooks() {
  return db
    .select({
      id: guidebooks.id,
      title: guidebooks.title,
      fileUrl: guidebooks.fileUrl,
      fileName: guidebooks.fileName,
      createdAt: guidebooks.createdAt,
    })
    .from(guidebooks)
    .orderBy(desc(guidebooks.createdAt));
}

/** 편집·변경·삭제의 기존 단건 조회 체인을 공유합니다. 행 공개 범위는 서비스가 제한합니다. */
export async function findGuidebook(id: string) {
  return db.query.guidebooks.findFirst({ where: eq(guidebooks.id, id) });
}

/** 검증 완료된 파일 참조와 제목만 저장하며 완료를 기다립니다. */
export async function insertGuidebook(input: GuidebookInput): Promise<void> {
  await db.insert(guidebooks).values({ title: input.title, fileUrl: input.fileUrl, fileName: input.fileName });
}

/** 파일 교체는 조회 당시 URL이 여전히 일치할 때만 원자적으로 저장합니다. */
export async function replaceGuidebookFile(id: string, input: GuidebookReplacement): Promise<boolean> {
  const [updated] = await db
    .update(guidebooks)
    .set({ title: input.title, fileUrl: input.fileUrl, fileName: input.fileName })
    .where(and(eq(guidebooks.id, id), eq(guidebooks.fileUrl, input.previousFileUrl)))
    .returning({ id: guidebooks.id });
  return Boolean(updated);
}

/** 제목만 수정할 때는 파일 필드를 건드리지 않고 실제 변경 행을 확인합니다. */
export async function updateGuidebookTitle(id: string, title: string): Promise<boolean> {
  const [updated] = await db
    .update(guidebooks)
    .set({ title })
    .where(eq(guidebooks.id, id))
    .returning({ id: guidebooks.id });
  return Boolean(updated);
}

/** 삭제 결과로 조회 이후 삭제 경합도 구분합니다. 기존 Blob은 삭제하지 않습니다. */
export async function deleteGuidebook(id: string): Promise<boolean> {
  const [deleted] = await db.delete(guidebooks)
    .where(eq(guidebooks.id, id))
    .returning({ id: guidebooks.id });
  return Boolean(deleted);
}
