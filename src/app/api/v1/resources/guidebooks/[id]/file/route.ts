/**
 * API v1 가이드북 첨부 다운로드 어댑터입니다.
 * Web 쿠키 또는 모바일 Bearer 주체와 UUID/query 입력만 확인하고 현재 역할·Blob 읽기는 Application Service에 맡깁니다.
 * 응답은 서버가 읽은 첨부 스트림이며 원본 URL로 리다이렉트하지 않습니다.
 */
import { resolveResourcePrincipal, withResourcePrincipal } from "@/app/api/v1/resources/_lib/principal";
import { handleResourceFileRequest } from "@/features/resources/api-v1/http";
import { downloadGuidebookFile } from "@/features/guidebooks/file-download/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return withResourcePrincipal(request, true, () =>
    handleResourceFileRequest(request, params, "api-v1/resources/guidebooks/file", resolveResourcePrincipal, downloadGuidebookFile));
}
