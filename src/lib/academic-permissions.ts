/**
 * G1 학생 과제의 서버 공통 권한 경계다.
 * 실제 auth 세션 → MEMBER 확인 → 기능 활성화 → DB 본인 대상 조인 순서로 판단한다.
 * 홈페이지 ADMIN과 FACULTY는 이 학생 경로를 사용하지 않으며 개별 관리 정책을 따른다.
 */
import "server-only";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { freshMobilePrincipalIdentity } from "@/lib/api-v1-principal";
import { db } from "@/lib/db";
import { isValidUuid, UUID_PATTERN } from "@/lib/auth-session";
import { buildAssignmentTargetLookup } from "@/features/academics/student-assignments/data";
import type { AssignmentTargetSelector, AuthorizedAssignmentTarget } from "@/features/academics/student-assignments/contracts";

// 외부에 DB 오류·식별자·정책 판별 근거를 노출하지 않는 고정 오류 계약이다.
const accessErrors = {
  UNAUTHENTICATED: { status: 401, message: "로그인이 필요합니다." },
  FORBIDDEN: { status: 403, message: "학생 과제에 접근할 수 없습니다." },
  DISABLED: { status: 404, message: "과제를 찾을 수 없습니다." },
  NOT_FOUND: { status: 404, message: "과제를 찾을 수 없습니다." },
  INVALID_INPUT: { status: 422, message: "조회 조건이 올바르지 않습니다." },
  UNAVAILABLE: { status: 503, message: "과제를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요." },
} as const;
export type AcademicAccessErrorCode = keyof typeof accessErrors;

export class AcademicAccessError extends Error {
  readonly status: number;
  constructor(readonly code: AcademicAccessErrorCode) {
    super(accessErrors[code].message);
    this.name = "AcademicAccessError";
    this.status = accessErrors[code].status;
  }
}

// 잘못된 UUID·타인의 대상·비공개 과제를 모두 동일한 404로 처리한다.
const uuid = z.string().regex(UUID_PATTERN);
const targetSelector = z.union([z.object({ assignmentId: uuid }).strict(), z.object({ targetId: uuid }).strict()]);

// 호출마다 auth가 반환한 세션을 확인한다. 클라이언트의 사용자·역할 인수를 받지 않는다.
export async function requireAcademicStudent(): Promise<{ userId: string }> {
  let user;
  try {
    const mobile = await freshMobilePrincipalIdentity();
    user = mobile === undefined ? (await auth())?.user : mobile;
  } catch { throw new AcademicAccessError("UNAVAILABLE"); }
  if (!user || !isValidUuid(user.id)) throw new AcademicAccessError("UNAUTHENTICATED");
  if (user.role !== "MEMBER") throw new AcademicAccessError("FORBIDDEN");
  // 인증을 먼저 마친다. 비활성 환경에서는 신규 학사 테이블에 접속하지 않는다.
  if (process.env.ACADEMIC_ENABLED !== "true") throw new AcademicAccessError("DISABLED");
  return { userId: user.id };
}

// DB 장애를 한국어 고정 오류로 변환한다. DB 원문이나 개인 식별자를 응답·로그에 복사하지 않는다.
export async function withAcademicQueryErrors<T>(query: () => PromiseLike<T>): Promise<T> {
  try { return await query(); } catch (error) {
    if (error instanceof AcademicAccessError) throw error;
    throw new AcademicAccessError("UNAVAILABLE");
  }
}

// #151/#152/#154는 요청마다 이 함수를 다시 호출하며 과거 조회 결과를 권한 토큰처럼 사용하지 않는다.
export async function requireAssignmentTarget(selector: AssignmentTargetSelector): Promise<AuthorizedAssignmentTarget> {
  const { userId } = await requireAcademicStudent();
  const parsed = targetSelector.safeParse(selector);
  if (!parsed.success) throw new AcademicAccessError("NOT_FOUND");
  const [target] = await withAcademicQueryErrors(() => buildAssignmentTargetLookup(db, userId, parsed.data));
  if (!target || target.status === "DRAFT" || !target.dueAt || !target.publishedAt) throw new AcademicAccessError("NOT_FOUND");
  if (!Number.isFinite(target.dueAt.getTime()) || !Number.isFinite(target.publishedAt.getTime())) throw new AcademicAccessError("UNAVAILABLE");
  return { userId, assignmentId: target.assignmentId, targetId: target.targetId,
    status: target.status, dueAt: target.dueAt, publishedAt: target.publishedAt };
}

// UI 안내를 위한 boolean 조회다. 실제 쓰기·파일 전달은 반드시 requireAssignmentTarget으로 재검사한다.
export async function canViewAssignment(assignmentId: string): Promise<boolean> {
  try { await requireAssignmentTarget({ assignmentId }); return true; } catch (error) {
    if (error instanceof AcademicAccessError && error.status !== 503) return false;
    throw error;
  }
}
