/**
 * 현재 학생의 과제 지침·본인 제출 메타데이터를 제공하는 API v1 어댑터입니다.
 * 다른 학생의 대상·초안·파일 저장 위치는 기존 상세 조회 서비스와 명시 DTO로 차단합니다.
 */
import { z } from "zod/v4";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import { apiV1AssignmentDetailResponseSchema } from "@hra/contracts/api-v1";
import { getMyAssignment } from "@/features/academics/student-assignments/queries";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  assertNoAcademicApiQuery,
} from "@/features/academics/api-v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 잘못된 식별자도 없는 과제와 같은 고정 404를 사용합니다. */
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
    const body = apiV1AssignmentDetailResponseSchema.parse({
      assignment: {
        assignmentId: item.assignmentId,
        targetId: item.targetId,
        title: item.title,
        status: item.status,
        dueAt: item.dueAt,
        publishedAt: item.publishedAt,
        instructions: item.instructions,
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
      },
    });
    return Response.json(body, { headers: { ...academicApiHeaders, "X-Request-Id": requestId } });
  } catch (error) {
    return academicApiErrorResponse(error, requestId);
  }
}
