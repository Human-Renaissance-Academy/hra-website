/**
 * 학생의 업로드 검증·원자 제출·멱등 결과 복구를 연결하는 API v1 어댑터입니다.
 * 세션·대상·마감·파일 검증은 기존 서비스가 수행하고 HTTP 입력·관측·Web 캐시만 처리합니다.
 */
import { revalidatePath } from "next/cache";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import {
  apiV1FinalizeSubmissionInputSchema,
  apiV1FinalizedSubmissionResponseSchema,
} from "@hra/contracts/api-v1";
import { finalizeAssignmentSubmission } from "@/features/academics/submissions/service";
import { SubmissionFinalizationError } from "@/features/academics/submissions/validation";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  readAcademicApiJson,
} from "@/features/academics/api-v1/http";
import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";
import { AcademicAccessError } from "@/lib/academic-permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** 성공 재시도에서도 같은 submissionKey를 서비스에 전달하여 저장된 최종 결과를 복구합니다. */
export async function POST(request: Request): Promise<Response> {
  return withApiV1Principal(request, () => handlePost(request), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handlePost(request: Request): Promise<Response> {
  const observation = createAcademicObservation("SUBMISSION_FINALIZE", "SUBMISSION");
  try {
    const parsed = apiV1FinalizeSubmissionInputSchema.safeParse(await readAcademicApiJson(request));
    if (!parsed.success) throw new AcademicApiHttpError("INVALID_INPUT");
    const result = await finalizeAssignmentSubmission(parsed.data, observation);
    const body = apiV1FinalizedSubmissionResponseSchema.parse({
      submission: {
        assignmentId: result.assignmentId,
        submissionId: result.submissionId,
        // PostgreSQL 결과의 마이크로초·오프셋을 API 공통 UTC 밀리초 계약으로 변환합니다.
        submittedAt: new Date(result.submittedAt).toISOString(),
        replayed: result.replayed,
        file: {
          fileId: result.file.fileId,
          originalName: result.file.originalName,
          mimeType: result.file.mimeType,
          sizeBytes: result.file.sizeBytes,
        },
      },
    });
    observation.emit(result.replayed ? "REPLAYED" : "COMPLETED", { resourceId: result.submissionId });
    revalidatePath("/member/assignments");
    revalidatePath(`/member/assignments/${result.assignmentId}`);
    revalidatePath("/admin/academics/assignments");
    revalidatePath(`/admin/academics/assignments/${result.assignmentId}/submissions`);
    return Response.json(body, {
      headers: { ...academicApiHeaders, "X-Request-Id": observation.correlationId },
    });
  } catch (error) {
    const known = error instanceof AcademicAccessError || error instanceof AcademicUploadError ||
      error instanceof SubmissionFinalizationError || error instanceof AcademicApiHttpError;
    const code = known ? error.code : null;
    const denied = code !== null && ["UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND"].includes(code);
    // 기존 Server Action과 같은 실패 분류를 남기고 오류 원문·파일명은 전달하지 않습니다.
    observation.emit(denied ? "DENIED" : "FAILED", {
      failureCode: denied ? "AUTHORIZATION"
        : code === "INVALID_INPUT" || code === "INVALID_FILE" || code === "TOO_LARGE" ? "INPUT"
          : code === "DISABLED" ? "GATE"
            : code !== null && ["CONFLICT", "EXPIRED", "DEADLINE", "RATE_LIMITED"].includes(code) ? "CONFLICT"
              : code === "NOT_READY" ? "NOT_READY" : "STORAGE",
      sqlState: academicSqlState(error),
    });
    return academicApiErrorResponse(error, observation.correlationId);
  }
}
