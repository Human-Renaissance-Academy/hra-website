/**
 * 현재 학생 본인의 공개 과제 목록을 제공하는 API v1 어댑터입니다.
 * 세션·활성 학적·과제 대상 검증은 기존 조회 서비스가 맡고, 응답은 표시 DTO로 제한합니다.
 */
import {
  apiV1AssignmentListQuerySchema,
  apiV1AssignmentListResponseSchema,
} from "@hra/contracts/api-v1";
import { getMyAssignments } from "@/features/academics/student-assignments/queries";
import { withApiV1Principal } from "@/lib/api-v1-principal";
import {
  AcademicApiHttpError,
  academicApiErrorResponse,
  academicApiHeaders,
} from "@/features/academics/api-v1/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 중복·미등록 query가 객체 변환으로 사라지기 전에 거부합니다. */
function parseQuery(request: Request) {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if ((key !== "page" && key !== "pageSize") || Object.hasOwn(values, key)) {
      throw new AcademicApiHttpError("INVALID_INPUT");
    }
    values[key] = value;
  }
  const parsed = apiV1AssignmentListQuerySchema.safeParse(values);
  if (!parsed.success) throw new AcademicApiHttpError("INVALID_INPUT");
  return parsed.data;
}

/** 서비스의 다음 페이지 표식을 유지하고, 제공하지 않는 전체 개수를 추정하지 않습니다. */
export async function GET(request: Request): Promise<Response> {
  return withApiV1Principal(request, () => handleGet(request), (code) => academicApiErrorResponse(new AcademicApiHttpError(code), crypto.randomUUID()));
}

async function handleGet(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const result = await getMyAssignments(parseQuery(request));
    const body = apiV1AssignmentListResponseSchema.parse({
      assignments: result.items.map((item) => ({
        assignmentId: item.assignmentId,
        targetId: item.targetId,
        title: item.title,
        status: item.status,
        dueAt: item.dueAt,
        publishedAt: item.publishedAt,
        submission: item.submission ? {
          submissionId: item.submission.submissionId,
          submittedAt: item.submission.submittedAt,
        } : null,
      })),
      page: { page: result.page, pageSize: result.pageSize, hasNextPage: result.hasNextPage },
    });
    return Response.json(body, { headers: { ...academicApiHeaders, "X-Request-Id": requestId } });
  } catch (error) {
    return academicApiErrorResponse(error, requestId);
  }
}
