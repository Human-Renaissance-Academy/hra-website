/**
 * 개인 최종 제출 파일을 API v1에서 제공하는 HTTP 어댑터입니다.
 * 기존 서비스의 현재 인가·감사·보호 스트림을 재사용하고 실패만 공통 JSON 계약으로 변환합니다.
 */
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  assertNoAcademicApiQuery,
} from "@/features/academics/api-v1/http";
import { downloadSubmissionFile, type SubmissionFileParams } from "@/features/academics/submission-files/service";
import { withApiV1Principal } from "@/lib/api-v1-principal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 경로 ID는 서비스가 인증 뒤 평가하며 파일 내용·보안 헤더·취소 전파를 그대로 보존합니다. */
export async function GET(request: Request, { params }: { params: Promise<SubmissionFileParams> }): Promise<Response> {
  return withApiV1Principal(request, () => handleGet(request, { params }), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handleGet(request: Request, { params }: { params: Promise<SubmissionFileParams> }): Promise<Response> {
  try {
    assertNoAcademicApiQuery(request);
    const response = await downloadSubmissionFile(params, (error, observation) =>
      academicApiErrorResponse(error, observation.correlationId));
    return response;
  } catch (error) {
    return academicApiErrorResponse(error, crypto.randomUUID());
  }
}
