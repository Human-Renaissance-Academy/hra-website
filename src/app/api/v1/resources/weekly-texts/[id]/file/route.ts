/**
 * API v1 주차별 텍스트 첨부 다운로드 어댑터입니다.
 * UUID/query 입력과 Web 세션 존재만 확인하고 현재 역할·Blob 읽기는 Application Service에 맡깁니다.
 * 본문만 있는 텍스트는 404이며, 응답은 서버가 읽은 첨부 스트림으로 원본 URL을 노출하지 않습니다.
 */
import { handleResourceFileRequest } from "@/features/resources/api-v1/http";
import { downloadWeeklyTextFile } from "@/features/weekly-texts/member/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return handleResourceFileRequest(request, params, "api-v1/resources/weekly-texts/file", downloadWeeklyTextFile);
}
