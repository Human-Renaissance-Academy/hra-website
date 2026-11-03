/**
 * API v1의 비공개 업로드 토큰·서명 완료 영수증을 공통 SDK 프로토콜에 연결합니다.
 * 토큰 발급은 같은 출처·현재 학생 인가를 요구하고 완료 영수증만 SDK 서명으로 확인합니다.
 */
import { handleAssignmentUploadProtocol } from "@/features/academics/assignment-uploads/protocol";
import { recordUploadFailure } from "@/features/academics/assignment-uploads/observability";
import { assertUploadOrigin } from "@/features/academics/assignment-uploads/http";
import { revalidateMobilePrincipalOverride, withApiV1Principal } from "@/lib/api-v1-principal";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
  readAcademicApiProtocolJson,
} from "@/features/academics/api-v1/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 성공 SDK 본문은 재구성하지 않고 오류만 공통 v1 JSON 계약으로 변환합니다. */
export async function POST(request: Request): Promise<Response> {
  return handleAssignmentUploadProtocol(request, {
    readBody: readAcademicApiProtocolJson,
    responseHeaders: academicApiHeaders,
    tokenTransport: {
      run: (handler) => withApiV1Principal(request, handler, (code) =>
        academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID())),
      assertOrigin: async (input) => {
        const principal = await revalidateMobilePrincipalOverride();
        switch (principal.kind) {
          case "NO_OVERRIDE": return assertUploadOrigin(input);
          case "VALID": return;
          case "REVOKED": throw new AcademicApiHttpError("UNAUTHENTICATED");
          default: { const exhaustive: never = principal; throw exhaustive; }
        }
      },
    },
    errorResponse: (error, observation) => {
      recordUploadFailure(observation, error);
      return academicApiErrorResponse(error, observation.correlationId);
    },
  });
}
