/**
 * 현재 학생이 선택한 과제의 최종 제출·파일 메타데이터만 제공하는 API v1 어댑터입니다.
 * 본인 과제 상세와 같은 실시간 인가를 재사용하고 원본 파일 전달은 보호 다운로드에 맡깁니다.
 */
import { z } from "zod/v4";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import { apiV1AssignmentSubmissionResponseSchema } from "@hra/contracts/api-v1";
import { getMyAssignment } from "@/features/academics/student-assignments/queries";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  assertNoAcademicApiQuery,
} from "@/features/academics/api-v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 아직 제출하지 않은 본인 과제는 null 두 필드로 표시하며 제출물 존재를 타인에게 공개하지 않습니다. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApiV1Principal(request, () => handleGet(request, { params }), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handleGet(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    assertNoAcademicApiQuery(request);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AcademicApiHttpError("NOT_FOUND");
    const item = await getMyAssignment(id);
    const body = apiV1AssignmentSubmissionResponseSchema.parse({
      submission: item.submission ? {
        submissionId: item.submission.submissionId,
        submittedAt: item.submission.submittedAt,
      } : null,
      file: item.file ? {
        fileId: item.file.fileId,
        originalName: item.file.originalName,
        mimeType: item.file.mimeType,
        sizeBytes: item.file.sizeBytes,
      } : null,
    });
    return Response.json(body, { headers: { ...academicApiHeaders, "X-Request-Id": requestId } });
  } catch (error) {
    return academicApiErrorResponse(error, requestId);
  }
}
