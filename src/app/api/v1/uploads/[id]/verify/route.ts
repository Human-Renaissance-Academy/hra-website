/**
 * API v1의 업로드 검증을 기존 비공개 PDF 검증 서비스에 연결합니다.
 * 실제 객체 크기·내용·해시와 현재 대상·기한·요청 예산을 재확인한 뒤 검증 상태만 반환합니다.
 */
import { z } from "zod/v4";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import { apiV1UploadSelectionInputSchema, apiV1UploadVerifiedResponseSchema } from "@hra/contracts/api-v1";
import { verifyAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { recordUploadFailure } from "@/features/academics/assignment-uploads/observability";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  readAcademicApiJson,
} from "@/features/academics/api-v1/http";
import { createAcademicObservation } from "@/lib/academic-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 식별자를 제외한 파일 메타·저장 위치는 신뢰하지 않고 서버 원장을 다시 읽습니다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApiV1Principal(request, () => handlePost(request, { params }), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handlePost(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const observation = createAcademicObservation("UPLOAD_VERIFY", "UPLOAD_INTENT");
  try {
    const input = apiV1UploadSelectionInputSchema.safeParse(await readAcademicApiJson(request));
    if (!input.success) throw new AcademicApiHttpError("INVALID_INPUT");
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new AcademicApiHttpError("NOT_FOUND");
    await verifyAssignmentUploadIntent({ assignmentId: input.data.assignmentId, uploadIntentId: id.data }, observation);
    return Response.json(apiV1UploadVerifiedResponseSchema.parse({ state: "VERIFIED" }), {
      headers: { ...academicApiHeaders, "X-Request-Id": observation.correlationId },
    });
  } catch (error) {
    recordUploadFailure(observation, error);
    return academicApiErrorResponse(error, observation.correlationId);
  }
}
