/** 관리자 강의자료 목록의 세션·표시·조회 오류 처리를 담당하는 Web 어댑터입니다. */
import Link from "next/link";
import { formatKstDate as formatDate } from "@/lib/date-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { ClassMaterialRowActions } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-row-actions";
import { requireAdmin } from "@/lib/admin";
import { listAdminMaterials } from "@/features/class-materials/admin/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";


const formatAudience = (audience: string) => (audience === "FACULTY" ? "교수용" : "학생용");

export default async function AdminClassMaterialsPage() {
  const session = await requireAdmin();

  const { rows, hasDbError } = await (async () => {
    try {
      const rows = await listAdminMaterials({ userId: session.user.id, role: session.user.role });

      return { rows, hasDbError: false };
    } catch (error) {
      logServerError("admin/resources/class-materials", error);
      return { rows: [], hasDbError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">자료실 관리</h1>
        <Button render={<Link href="/admin/resources/class-materials/new" />}>새 강의 자료 추가</Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 강의 자료 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasDbError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.
            </div>
          ) : null}

          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>주차</TableHead>
                  <TableHead>강의명</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>업로드자</TableHead>
                  <TableHead>날짜</TableHead>
                  <TableHead>삭제</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      등록된 강의 자료가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[260px] truncate font-medium text-slate-900">
                        {row.title}
                      </TableCell>
                      <TableCell className="text-slate-700">{row.weekNumber ?? "-"}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-slate-700">
                        {row.lectureTitle ?? "-"}
                      </TableCell>
                      <TableCell className="text-slate-700">{formatAudience(row.audience)}</TableCell>
                      <TableCell className="text-slate-700">{row.uploaderName ?? "-"}</TableCell>
                      <TableCell className="text-slate-700">{formatDate(row.createdAt)}</TableCell>
                      <TableCell>
                        <ClassMaterialRowActions id={row.id} />
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
