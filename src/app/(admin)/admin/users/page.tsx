/**
 * 관리자 회원 관리 페이지
 *
 * 전체 회원 목록을 표시하고 그룹(관리자/교수/기수/승인대기)을 변경하거나 삭제할 수 있습니다.
 * 기수 목록을 함께 조회하여 드롭다운에 동적으로 표시합니다.
 */
import { formatKstDate as formatDate } from "@/lib/date-time";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { listAdminUsers, listAdminCohorts } from "@/features/users/admin/service";
import { logServerError } from "@/lib/errors";
import { UserGroupButton } from "./_components/user-role-button";

export const dynamic = "force-dynamic";

// 역할별 뱃지 스타일 및 레이블 정의
const roleBadgeMap = {
  ADMIN: {
    label: "관리자",
    className: "bg-blue-100 text-blue-700",
    variant: "default" as const,
  },
  FACULTY: {
    label: "교수",
    className: "bg-purple-100 text-purple-700",
    variant: "default" as const,
  },
  MEMBER: {
    label: "멤버",
    className: "bg-slate-100 text-slate-700",
    variant: "secondary" as const,
  },
  PENDING: {
    label: "승인 대기",
    className: "bg-amber-100 text-amber-700",
    variant: "secondary" as const,
  },
};


export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const actor = { userId: session.user.id, role: session.user.role };

  // 회원 목록과 기수 목록을 병렬로 조회
  const [{ rows, hasDbError }, cohortList] = await Promise.all([
    (async () => {
      try {
        const rows = await listAdminUsers(actor);
        return { rows, hasDbError: false };
      } catch (error) {
        logServerError("admin/users", error);
        return { rows: [], hasDbError: true };
      }
    })(),
    listAdminCohorts(actor),
  ]);

  // cohortId → cohort name 빠른 조회를 위한 맵
  const cohortMap = new Map(cohortList.map((c) => [c.id, c.name]));

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">회원 관리</h1>
        <p className="mt-1 text-sm text-slate-500">전체 회원 목록을 확인하고 역할을 변경하거나 삭제할 수 있습니다.</p>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 회원 {rows.length}명</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasDbError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.
            </div>
          ) : null}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>소속 기수</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      등록된 회원이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">
                        <Link href={`/admin/users/${row.id}`} className="hover:text-[#2563EB] hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-slate-600">{row.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={roleBadgeMap[row.role].variant}
                          className={roleBadgeMap[row.role].className}
                        >
                          {roleBadgeMap[row.role].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 text-sm">
                        {row.cohortId ? (cohortMap.get(row.cohortId) ?? "-") : "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {row.id === session.user?.id ? (
                          <span className="text-xs text-slate-400">본인</span>
                        ) : (
                          <UserGroupButton
                            userId={row.id}
                            currentRole={row.role}
                            currentCohortId={row.cohortId ?? null}
                            cohorts={cohortList}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
