/**
 * API v1의 본인 과제 업로드 의도를 취소하는 HTTP 연결 계층입니다.
 * 서비스가 현재 소유권과 대상 원장을 잠가 취소하며 아직 유효한 비공개 객체를 즉시 삭제하지 않습니다.
 */
import { z } from "zod/v4";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import { apiV1UploadCancelledResponseSchema, apiV1UploadSelectionInputSchema } from "@hra/contracts/api-v1";
import { cancelAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
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

/** 경로 ID와 본문 과제 ID 이외의 저장키·역할·소유자 입력은 허용하지 않습니다. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return withApiV1Principal(request, () => handleDelete(request, { params }), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handleDelete(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const observation = createAcademicObservation("UPLOAD_CANCEL", "UPLOAD_INTENT");
  try {
    const input = apiV1UploadSelectionInputSchema.safeParse(await readAcademicApiJson(request));
    if (!input.success) throw new AcademicApiHttpError("INVALID_INPUT");
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new AcademicApiHttpError("NOT_FOUND");
    await cancelAssignmentUploadIntent({ assignmentId: input.data.assignmentId, uploadIntentId: id.data }, observation);
    return Response.json(apiV1UploadCancelledResponseSchema.parse({ state: "CANCELLED" }), {
      headers: { ...academicApiHeaders, "X-Request-Id": observation.correlationId },
    });
  } catch (error) {
    recordUploadFailure(observation, error);
    return academicApiErrorResponse(error, observation.correlationId);
  }
}
