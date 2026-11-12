/**
 * 교수진 관리자 업무의 PostgreSQL 접근을 소유하는 저장소입니다.
 * 기존 쓰기 체인과 사진 URL 기반 낙관적 동시성 조건을 그대로 유지합니다.
 */
import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

export type FacultyInput = {
  readonly name: string;
  readonly category: "CLASSICS" | "BUSINESS" | "LECTURE";
  readonly currentPosition?: string;
  readonly formerPosition?: string;
  readonly order: number;
};
export type FacultyListItem = {
  readonly id: string;
  readonly name: string;
  readonly category: FacultyInput["category"];
  readonly currentPosition: string | null;
  readonly formerPosition: string | null;
};
export type FacultyEditItem = FacultyListItem & {
  readonly imageUrl: string | null;
  readonly order: number;
};
/** 사진이 실제로 교체될 때만 imageUrl을 추가하는 기존 UPDATE 값입니다. */
export type FacultyUpdateValues = {
  name: string;
  category: FacultyInput["category"];
  currentPosition: string | null;
  formerPosition: string | null;
  order: number;
  imageUrl?: string | null;
};

/** 관리자 목록의 순서·이름 정렬과 화면에서 사용하는 다섯 필드를 반환합니다. */
export async function listFacultyRows(): Promise<FacultyListItem[]> {
  return db.select({ id: faculty.id, name: faculty.name, category: faculty.category,
    currentPosition: faculty.currentPosition, formerPosition: faculty.formerPosition })
    .from(faculty).orderBy(asc(faculty.order), asc(faculty.name));
}

/** 편집 폼에서 사용하는 필드만 기존 단건 조회 체인으로 읽습니다. */
export async function getFacultyRow(id: string): Promise<FacultyEditItem | null> {
  const [row] = await db.select({ id: faculty.id, name: faculty.name, category: faculty.category,
    currentPosition: faculty.currentPosition, formerPosition: faculty.formerPosition,
    imageUrl: faculty.imageUrl, order: faculty.order })
    .from(faculty).where(eq(faculty.id, id)).limit(1);
  return row ?? null;
}

/** 삽입 시 빈 직함과 사진을 null로 저장하며 ID·감사 시각은 DB 기본값에 맡깁니다. */
export async function insertFaculty(input: FacultyInput, imageUrl: string | null): Promise<void> {
  await db.insert(faculty).values({
    name: input.name,
    category: input.category,
    currentPosition: input.currentPosition ?? null,
    formerPosition: input.formerPosition ?? null,
    imageUrl,
    order: input.order,
  });
}

/** 업로드 전에 현재 사진만 읽으며 행 없음과 null 사진을 구분합니다. */
export async function getExistingImage(id: string): Promise<{ imageUrl: string | null } | null> {
  const [existingFaculty] = await db
    .select({ imageUrl: faculty.imageUrl })
    .from(faculty)
    .where(eq(faculty.id, id));
  return existingFaculty ?? null;
}

/** 이전 사진 URL 조건을 유지해 먼저 교체된 행을 덮어쓰지 않습니다. */
export async function updateFacultyRow(
  id: string, updateValues: FacultyUpdateValues, previousImageUrl: string | null,
): Promise<boolean> {
  const [updated] = await db
    .update(faculty)
    .set(updateValues)
    .where(and(
      eq(faculty.id, id),
      previousImageUrl
        ? eq(faculty.imageUrl, previousImageUrl)
        : isNull(faculty.imageUrl),
    ))
    .returning({ id: faculty.id });
  return Boolean(updated);
}

/** 기존 행의 파일 소유권은 미확정이므로 DB만 멱등하게 삭제합니다. */
export async function deleteFacultyRow(id: string): Promise<void> {
  await db.delete(faculty).where(eq(faculty.id, id));
}
