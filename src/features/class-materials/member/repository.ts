/**
 * 승인 회원용 강의자료 목록·상세·파일의 PostgreSQL 조회를 소유합니다.
 *
 * - 모든 조회는 기존 `classMaterialReadFilter`를 SQL WHERE에 넣어 대상(학생용·교수용) 인가를 조회 단계에서 강제합니다.
 *   MEMBER는 학생용만, ADMIN·FACULTY는 학생용·교수용을 읽습니다.
 * - 목록·상세는 원본 파일 URL·업로더 계정을 읽지 않고, 파일 조회만 저장 위치를 서버 내부로 반환합니다.
 */
import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

/** 저장소 인가 입력은 서비스가 현재 DB 행으로 확인한 계정 ID·역할입니다. */
export type ClassMaterialReader = { id: string; role: "ADMIN" | "FACULTY" | "MEMBER" };

export type ClassMaterialRecord = {
  id: string;
  title: string;
  audience: string;
  weekNumber: number | null;
  lectureTitle: string | null;
  classDate: Date | null;
};

const summaryColumns = {
  id: classMaterials.id,
  title: classMaterials.title,
  audience: classMaterials.audience,
  weekNumber: classMaterials.weekNumber,
  lectureTitle: classMaterials.lectureTitle,
  classDate: classMaterials.classDate,
};

/** 역할에 허용된 대상의 강의자료 수만 셉니다. */
export async function countClassMaterialsForReader(reader: ClassMaterialReader): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(classMaterials)
    .where(classMaterialReadFilter(reader));
  return total;
}

/** Web 통합 목록과 같은 수업일 역순(NULL 마지막)·작성 시각 역순에 ID를 더해 안정된 페이지를 읽습니다. */
export async function listClassMaterialsForReader(
  reader: ClassMaterialReader,
  pageSize: number,
  offset: number,
): Promise<ClassMaterialRecord[]> {
  return db.select(summaryColumns).from(classMaterials)
    .where(classMaterialReadFilter(reader))
    .orderBy(sql`${classMaterials.classDate} DESC NULLS LAST`, desc(classMaterials.createdAt), desc(classMaterials.id))
    .limit(pageSize)
    .offset(offset);
}

/** 허용 대상이 아닌 자료는 없는 자료와 같은 null로 반환합니다. */
export async function findClassMaterialForReader(
  reader: ClassMaterialReader,
  id: string,
): Promise<(ClassMaterialRecord & { fileName: string }) | null> {
  const [row] = await db.select({ ...summaryColumns, fileName: classMaterials.fileName }).from(classMaterials)
    .where(and(eq(classMaterials.id, id), classMaterialReadFilter(reader)))
    .limit(1);
  return row ?? null;
}

/** 다운로드에 필요한 저장 위치와 원본 파일명만 같은 대상 인가 조건으로 읽습니다. */
export async function findClassMaterialFileForReader(
  reader: ClassMaterialReader,
  id: string,
): Promise<{ fileUrl: string; fileName: string } | null> {
  const [row] = await db.select({ fileUrl: classMaterials.fileUrl, fileName: classMaterials.fileName })
    .from(classMaterials)
    .where(and(eq(classMaterials.id, id), classMaterialReadFilter(reader)))
    .limit(1);
  return row ?? null;
}
