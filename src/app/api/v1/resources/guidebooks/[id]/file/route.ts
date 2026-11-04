/**
 * API v1 가이드북 첨부 다운로드 어댑터입니다.
 * UUID/query 입력과 Web 세션 존재만 확인하고 현재 역할·Blob 읽기는 Application Service에 맡깁니다.
 * 응답은 서버가 읽은 첨부 스트림이며 원본 URL로 리다이렉트하지 않습니다.
 */
import { handleResourceFileRequest } from "@/features/resources/api-v1/http";
import { downloadGuidebookFile } from "@/features/guidebooks/file-download/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleResourceFileRequest(request, params, "api-v1/resources/guidebooks/file", downloadGuidebookFile);
}
