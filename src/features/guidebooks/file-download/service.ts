/**
 * 승인 회원 가이드북 원본 다운로드 Application Service입니다.
 * 현재 계정·공동 자료 역할 정책(#100)과 기존 Blob URL/토큰/파일명 검증을 재사용합니다.
 * 저장 위치는 서버에서만 사용하며 클라이언트에는 첨부 스트림만 반환합니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import { openResourceAttachment, ResourceFileError } from "@/features/resources/file-download/service";
import { verifySharedResourceReader } from "@/features/resources/reader";
import type { MePrincipal } from "@/features/users/me/service";
import { findGuidebookFile } from "./repository";

/** 현재 승인 회원만 가이드북 원본을 받으며, 잘못된 ID·없는 파일은 같은 NOT_FOUND로 끝냅니다. */
export async function downloadGuidebookFile(principal: MePrincipal, id: string, signal?: AbortSignal): Promise<Response> {
  const verified = await verifySharedResourceReader(principal);
  if (verified.kind === "unauthenticated") throw new ResourceFileError("UNAUTHENTICATED");
  if (verified.kind === "forbidden") throw new ResourceFileError("FORBIDDEN");
  const parsedId = apiV1UuidSchema.safeParse(id);
  if (!parsedId.success) throw new ResourceFileError("NOT_FOUND");
  return openResourceAttachment(await findGuidebookFile(parsedId.data), signal);
}
