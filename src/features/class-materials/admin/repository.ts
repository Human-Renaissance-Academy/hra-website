/**
 * 관리자 강의자료의 PostgreSQL 접근을 소유합니다.
 * 목록 정렬과 파일 교체의 이전 URL 조건은 기존 Drizzle 호출 순서를 유지합니다.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classMaterials, users } from "@/lib/db/schema";

export type ClassMaterialTextFields = {
  readonly title: string;
  readonly weekNumber: number | null;
  readonly lectureTitle: string | null;
  readonly audience: "FACULTY" | "STUDENT";
  readonly classDate: Date | null;
};

/** 목록에서 표시하는 일곱 필드와 업로드자 이름만 읽습니다. */
export async function listMaterials() {
  return db
    .select({
      id: classMaterials.id,
      title: classMaterials.title,
      weekNumber: classMaterials.weekNumber,
      lectureTitle: classMaterials.lectureTitle,
      audience: classMaterials.audience,
      createdAt: classMaterials.createdAt,
      uploaderName: users.name,
    })
    .from(classMaterials)
    .leftJoin(users, eq(classMaterials.uploadedById, users.id))
    .orderBy(desc(classMaterials.createdAt));
}

/** 편집 폼의 기본값만 읽고 원본 URL을 반환하지 않습니다. */
export async function getMaterial(id: string) {
  return db.query.classMaterials.findFirst({
    where: eq(classMaterials.id, id),
    columns: { title: true, weekNumber: true, lectureTitle: true, audience: true, fileName: true },
  });
}

/** 수정의 날짜 보존·낙관적 파일 교체에 필요한 현재 참조만 읽습니다. */
export async function getMutationTarget(id: string) {
  return db.query.classMaterials.findFirst({
    where: eq(classMaterials.id, id),
    columns: { fileUrl: true, classDate: true },
  });
}

/** 기존 파일 URL이 일치할 때만 새 참조와 텍스트를 함께 저장합니다. */
export async function replaceMaterialFile(id: string, textFields: ClassMaterialTextFields, file: {
  readonly url: string; readonly fileName: string; readonly previousUrl: string;
}) {
  const [updated] = await db
    .update(classMaterials)
    .set({ ...textFields, fileUrl: file.url, fileName: file.fileName })
    .where(and(eq(classMaterials.id, id), eq(classMaterials.fileUrl, file.previousUrl)))
    .returning({ id: classMaterials.id });
  return Boolean(updated);
}

/** 파일 교체가 없으면 기존처럼 ID 조건만으로 텍스트를 저장합니다. */
export async function updateMaterialText(id: string, textFields: ClassMaterialTextFields) {
  const [updated] = await db
    .update(classMaterials)
    .set(textFields)
    .where(eq(classMaterials.id, id))
    .returning({ id: classMaterials.id });
  return Boolean(updated);
}

/** 실제 삭제 행을 반환하는 기존 체인으로 조회 이후 삭제 경합을 감지합니다. */
export async function deleteMaterial(id: string) {
  const [deleted] = await db.delete(classMaterials)
    .where(eq(classMaterials.id, id))
    .returning({ id: classMaterials.id });
  return Boolean(deleted);
}
