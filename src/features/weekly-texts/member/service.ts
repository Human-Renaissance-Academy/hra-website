/**
 * 승인 회원용 주차별 텍스트 목록·상세·파일 다운로드 Application Service입니다.
 *
 * 역할:
 * - 현재 계정 행과 역할을 다시 확인하고 PENDING·삭제·역할 변경 주체를 거부합니다.
 * - 공동 자료 정책(#100)에 따라 승인 회원은 다른 기수의 텍스트도 열람합니다(Web 상세·다운로드와 동일).
 * - 본문만 있는 텍스트의 파일 요청과 없는 텍스트는 같은 NOT_FOUND로 처리합니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import { openResourceAttachment, ResourceFileError } from "@/features/resources/file-download/service";
import { resourceListOffset, toResourceCalendarDate, verifySharedResourceReader } from "@/features/resources/reader";
import type { MePrincipal } from "@/features/users/me/service";
import { countWeeklyTexts, findWeeklyText, findWeeklyTextFile, listWeeklyTexts, type WeeklyTextRecord } from "./repository";

export type MemberWeeklyTextSummary = {
  id: string;
  title: string;
  textType: string | null;
  cohort: { id: string; name: string } | null;
  classDate: string | null;
  hasBody: boolean;
  hasFile: boolean;
};

export type MemberWeeklyTextListResult =
  | { kind: "ok"; items: readonly MemberWeeklyTextSummary[]; totalCount: number }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

export type MemberWeeklyTextDetailResult =
  | { kind: "ok"; item: MemberWeeklyTextSummary & { body: string | null; fileName: string | null } }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "not_found" };

/** 저장소 mock이나 열 추가에도 본문·URL이 목록 응답으로 넘어가지 않도록 재투영합니다. */
function toSummary(row: WeeklyTextRecord): MemberWeeklyTextSummary {
  return {
    id: row.id,
    title: row.title,
    textType: row.textType,
    cohort: row.cohortId && row.cohortName ? { id: row.cohortId, name: row.cohortName } : null,
    classDate: toResourceCalendarDate(row.classDate),
    hasBody: row.hasBody === true,
    hasFile: row.hasFile === true,
  };
}

/** 페이지 인자를 먼저 검증한 뒤 현재 승인 회원에게 주차별 텍스트 페이지를 반환합니다. */
export async function listWeeklyTextsForMember(input: {
  principal: MePrincipal;
  page: number;
  pageSize: number;
}): Promise<MemberWeeklyTextListResult> {
  const offset = resourceListOffset(input?.page, input?.pageSize);
  const verified = await verifySharedResourceReader(input.principal);
  if (verified.kind !== "ok") return verified;

  const totalCount = await countWeeklyTexts();
  if (offset >= totalCount) return { kind: "ok", items: [], totalCount };
  const rows = await listWeeklyTexts(input.pageSize, offset);
  return { kind: "ok", items: rows.map(toSummary), totalCount };
}

/** 잘못된 ID와 없는 텍스트를 같은 not_found로 처리합니다. 첨부 사진은 반환하지 않습니다. */
export async function getWeeklyTextForMember(principal: MePrincipal, id: string): Promise<MemberWeeklyTextDetailResult> {
  const verified = await verifySharedResourceReader(principal);
  if (verified.kind !== "ok") return verified;
  const parsedId = apiV1UuidSchema.safeParse(id);
  if (!parsedId.success) return { kind: "not_found" };

  const row = await findWeeklyText(parsedId.data);
  if (!row) return { kind: "not_found" };
  return { kind: "ok", item: { ...toSummary(row), body: row.body, fileName: row.fileName } };
}

/** 첨부가 있는 텍스트만 서버가 원본을 읽어 첨부 스트림으로 반환합니다. */
export async function downloadWeeklyTextFile(principal: MePrincipal, id: string, signal?: AbortSignal): Promise<Response> {
  const verified = await verifySharedResourceReader(principal);
  if (verified.kind === "unauthenticated") throw new ResourceFileError("UNAUTHENTICATED");
  if (verified.kind === "forbidden") throw new ResourceFileError("FORBIDDEN");
  const parsedId = apiV1UuidSchema.safeParse(id);
  if (!parsedId.success) throw new ResourceFileError("NOT_FOUND");
  return openResourceAttachment(await findWeeklyTextFile(parsedId.data), signal);
}
