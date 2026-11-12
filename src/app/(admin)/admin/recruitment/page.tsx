/**
 * 기수 관리 페이지 (목록)
 *
 * 역할: 관리자가 등록된 모든 기수를 테이블 형태로 볼 수 있는 페이지
 * - 기수 목록 조회 (기수명, 활성 여부, 기간, 설명)
 * - 각 기수별 수정/삭제 액션
 * - "새 기수 추가" 버튼으로 새 항목 생성 가능
 *
 * 데이터 흐름: DB에서 모든 기수 조회
 * 모집 관련 설정(모집 기수, 상태, 구글폼)은 모집 설정 페이지에서 관리
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecruitmentRowActions } from "@/app/(admin)/admin/recruitment/_components/recruitment-row-actions";
import { requireAdmin } from "@/lib/admin";
import { listAdminCohorts } from "@/features/recruitment/admin/service";
import { logServerError } from "@/lib/errors";
import { formatKstDate } from "@/lib/date-time";

export const dynamic = "force-dynamic";

const formatDate = (value: Date | null) => {
  if (!value) return "-";
  return formatKstDate(value);
};


export default async function AdminRecruitmentPage() {
  // 관리자 권한 확인
  const session = await requireAdmin();

  // 모든 기수 조회 (기수명에서 숫자만 추출해 내림차순 정렬: 20기 → 19기 → ... → 1기)
  const { rows, hasDbError } = await (async () => {
    try {
      const rows = await listAdminCohorts({ userId: session.user.id, role: session.user.role });

      return { rows, hasDbError: false };
    } catch (error) {
      logServerError("admin/recruitment", error);
      return { rows: [], hasDbError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">기수 관리</h1>
        <Link
          href="/admin/recruitment/new"
          className={buttonVariants({ className: "bg-slate-900 hover:bg-slate-700" })}
        >
          <Plus className="mr-1 size-4" />새 기수 추가
        </Link>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 기수 {rows.length}건</CardTitle>
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
                 <TableHead>기수명</TableHead>
                 <TableHead>활성</TableHead>
                 <TableHead>기간</TableHead>
                 <TableHead>설명</TableHead>
                 <TableHead className="text-right">관리</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    등록된 기수가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((cohort) => {
                  return (
                    <TableRow key={cohort.id}>
                      <TableCell className="font-medium text-slate-900">{cohort.name}</TableCell>
                      <TableCell>
                        {cohort.isActive ? (
                          <span className="text-emerald-600">활성</span>
                        ) : (
                          <span className="text-slate-400">비활성</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
                      </TableCell>
                      <TableCell className="w-[30%] max-w-0 text-slate-500">
                        <span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">
                          {cohort.description || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <RecruitmentRowActions id={cohort.id} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
