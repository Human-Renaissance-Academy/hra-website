/** 관리자 가이드북 목록의 웹 인가·장애 안내·표시를 담당하며 조회는 서비스에 위임합니다. */
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
import { GuidebookRowActions } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-row-actions";
import { requireAdmin } from "@/lib/admin";
import { listAdminGuidebooks } from "@/features/guidebooks/admin/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";


export default async function AdminGuidebooksPage() {
  const session = await requireAdmin();

  const { rows, hasDbError } = await (async () => {
    try {
      const rows = await listAdminGuidebooks({ userId: session.user.id, role: session.user.role });

      return { rows, hasDbError: false };
    } catch (error) {
      logServerError("admin/resources/guidebooks", error);
      return { rows: [], hasDbError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">자료실 관리</h1>
        <Button render={<Link href="/admin/resources/guidebooks/new" />}>새 가이드북 추가</Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 가이드북 {rows.length}건</CardTitle>
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
                  <TableHead>파일명</TableHead>
                  <TableHead>다운로드</TableHead>
                  <TableHead>작성일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      등록된 가이드북이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[280px] truncate font-medium text-slate-900">
                        {row.title}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-slate-700">{row.fileName}</TableCell>
                      <TableCell>
                        <a
                          href={`/api/resources/guidebooks/${row.id}/download`}
                          download={row.fileName}
                          className="text-sm font-medium text-[#2563EB] hover:underline"
                        >
                          파일 받기
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-700">{formatDate(row.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <GuidebookRowActions id={row.id} />
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
