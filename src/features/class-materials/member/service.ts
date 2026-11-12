/**
 * 승인 회원용 강의자료 목록·상세·파일 다운로드 Application Service입니다.
 *
 * 역할:
 * - 현재 계정 행과 역할을 다시 확인하고 PENDING·삭제·역할 변경 주체를 거부합니다.
 * - 대상 인가는 저장소의 SQL 필터가 강제하며, MEMBER에게 교수용 자료는 존재하지 않는 자료와 같게 보입니다.
 * - Web 세션과 향후 모바일 Bearer(#273) 어댑터가 같은 주체 형식으로 호출할 수 있습니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import { openResourceAttachment, ResourceFileError } from "@/features/resources/file-download/service";
import { resourceListOffset, toResourceCalendarDate, verifySharedResourceReader } from "@/features/resources/reader";
import type { MePrincipal } from "@/features/users/me/service";
import {
  countClassMaterialsForReader,
  findClassMaterialFileForReader,
  findClassMaterialForReader,
  listClassMaterialsForReader,
} from "./repository";

export type MemberClassMaterialSummary = {
  id: string;
  title: string;
  audience: string;
  weekNumber: number | null;
  lectureTitle: string | null;
  classDate: string | null;
};

export type MemberClassMaterialListResult =
  | { kind: "ok"; items: readonly MemberClassMaterialSummary[]; totalCount: number }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

export type MemberClassMaterialDetailResult =
  | { kind: "ok"; item: MemberClassMaterialSummary & { fileName: string } }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "not_found" };

/** 저장소 mock이나 열 추가에도 URL·업로더 정보가 응답으로 넘어가지 않도록 재투영합니다. */
function toSummary(row: {
  id: string; title: string; audience: string; weekNumber: number | null; lectureTitle: string | null; classDate: Date | null;
}): MemberClassMaterialSummary {
  return {
    id: row.id,
    title: row.title,
    audience: row.audience,
    weekNumber: row.weekNumber,
    lectureTitle: row.lectureTitle,
    classDate: toResourceCalendarDate(row.classDate),
  };
}

/** 페이지 인자를 먼저 검증한 뒤 현재 승인 회원에게 허용된 대상의 강의자료 페이지를 반환합니다. */
export async function listClassMaterialsForMember(input: {
  principal: MePrincipal;
  page: number;
  pageSize: number;
}): Promise<MemberClassMaterialListResult> {
  const offset = resourceListOffset(input?.page, input?.pageSize);
  const verified = await verifySharedResourceReader(input.principal);
  if (verified.kind !== "ok") return verified;
  const reader = { id: verified.reader.id, role: verified.reader.role };

  const totalCount = await countClassMaterialsForReader(reader);
  if (offset >= totalCount) return { kind: "ok", items: [], totalCount };
  const rows = await listClassMaterialsForReader(reader, input.pageSize, offset);
  return { kind: "ok", items: rows.map(toSummary), totalCount };
}

/** 잘못된 ID·없는 자료·허용 대상이 아닌 자료를 모두 같은 not_found로 처리합니다. */
export async function getClassMaterialForMember(principal: MePrincipal, id: string): Promise<MemberClassMaterialDetailResult> {
  const verified = await verifySharedResourceReader(principal);
  if (verified.kind !== "ok") return verified;
  const parsedId = apiV1UuidSchema.safeParse(id);
  if (!parsedId.success) return { kind: "not_found" };

  const row = await findClassMaterialForReader({ id: verified.reader.id, role: verified.reader.role }, parsedId.data);
  if (!row) return { kind: "not_found" };
  return { kind: "ok", item: { ...toSummary(row), fileName: row.fileName } };
}

/** 같은 대상 인가 조건으로 찾은 파일만 서버가 읽어 첨부 스트림으로 반환합니다. */
export async function downloadClassMaterialFile(principal: MePrincipal, id: string, signal?: AbortSignal): Promise<Response> {
  const verified = await verifySharedResourceReader(principal);
  if (verified.kind === "unauthenticated") throw new ResourceFileError("UNAUTHENTICATED");
  if (verified.kind === "forbidden") throw new ResourceFileError("FORBIDDEN");
  const parsedId = apiV1UuidSchema.safeParse(id);
  if (!parsedId.success) throw new ResourceFileError("NOT_FOUND");

  const file = await findClassMaterialFileForReader({ id: verified.reader.id, role: verified.reader.role }, parsedId.data);
  return openResourceAttachment(file, signal);
}
