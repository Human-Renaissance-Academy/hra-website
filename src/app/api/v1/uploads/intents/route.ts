/**
 * API v1 과제 업로드 의도를 발급하는 HTTP 연결 계층입니다.
 * 같은 출처의 작은 JSON만 받고 현재 대상·기한·예산·원장 검사는 기존 서비스에 맡깁니다.
 */
import { apiV1UploadIntentInputSchema, apiV1UploadIntentResponseSchema } from "@hra/contracts/api-v1";
import { createAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { recordUploadFailure } from "@/features/academics/assignment-uploads/observability";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  readAcademicApiJson,
} from "@/features/academics/api-v1/http";
import { createAcademicObservation } from "@/lib/academic-observability";
import { withApiV1Principal } from "@/lib/api-v1-principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 요청의 식별자를 인증 정보로 사용하지 않으며 서비스가 확인한 의도 결과만 반환합니다. */
export async function POST(request: Request): Promise<Response> {
  return withApiV1Principal(request, () => handlePost(request), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handlePost(request: Request): Promise<Response> {
  const observation = createAcademicObservation("UPLOAD_INTENT", "UPLOAD_INTENT");
  try {
    const input = apiV1UploadIntentInputSchema.safeParse(await readAcademicApiJson(request));
    if (!input.success) throw new AcademicApiHttpError("INVALID_INPUT");
    const result = await createAssignmentUploadIntent(input.data, observation);
    const body = apiV1UploadIntentResponseSchema.parse({
      uploadIntentId: result.uploadIntentId,
      pathname: result.pathname,
      expiresAt: result.expiresAt,
    });
    return Response.json(body, { headers: { ...academicApiHeaders, "X-Request-Id": observation.correlationId } });
  } catch (error) {
    recordUploadFailure(observation, error);
    return academicApiErrorResponse(error, observation.correlationId);
  }
}
