/**
 * 교수진·관리자 공용 강의자료 생성의 PostgreSQL 쓰기를 소유합니다.
 * 관리자 저장소를 의존하지 않고 기존 INSERT 체인과 값 순서를 유지합니다.
 */
import "server-only";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

export type ClassMaterialUpload = {
  readonly title: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly weekNumber: number | null;
  readonly lectureTitle: string | null;
  readonly audience: "FACULTY" | "STUDENT";
  readonly classDate: Date | null;
};

/** 업로드 참조 검증 뒤 세션 주체를 작성자로 저장합니다. */
export async function insertMaterial(input: ClassMaterialUpload, userId: string): Promise<void> {
  await db.insert(classMaterials).values({
    title: input.title,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    weekNumber: input.weekNumber,
    lectureTitle: input.lectureTitle,
    audience: input.audience,
    uploadedById: userId,
    classDate: input.classDate,
  });
}
