/** 보고서 양식 관리자 목록의 세션 확인과 표시를 담당하는 Web 어댑터입니다. */
import Link from "next/link";
import { formatKstDate as formatDate } from "@/lib/date-time";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { TemplateRowActions } from "@/app/(admin)/admin/resources/templates/_components/template-row-actions";
import { Badge } from "@/components/ui/badge";
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
import { requireAdmin } from "@/lib/admin";
import { listAdminTemplates } from "@/features/report-templates/admin/service";

export const dynamic = "force-dynamic";


const categoryLabel = (category: "template" | "guide") =>
  category === "template" ? "양식" : "가이드";

const reportCategoryLabel = (code: string | null) => {
  switch (code) {
    case "management-book":
      return "경영서";
    case "classic-book":
      return "고전명작";
    case "business-practice":
      return "기업실무·한국경제사";
    default:
      return "—";
  }
};

export default async function AdminResourceTemplatesPage() {
  const session = await requireAdmin();

  const rows = await listAdminTemplates({ userId: session.user.id, role: session.user.role });

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-[#1a1a1a] sm:text-2xl">
          자료실 관리
        </h1>
        <Button
          render={<Link href="/admin/resources/templates/new" />}
          className="bg-[#1a1a1a] text-white hover:bg-[#333333]"
        >
          새 양식/가이드
        </Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">
            전체 {rows.length}건
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>분야</TableHead>
                  <TableHead>버전</TableHead>
                  <TableHead>슬러그</TableHead>
                  <TableHead>공개</TableHead>
                  <TableHead>수정일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-[#666666]">
                      등록된 양식이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[280px] truncate font-medium text-[#1a1a1a]">
                        {row.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            row.category === "template"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }
                        >
                          {categoryLabel(row.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#1a1a1a]">
                        {reportCategoryLabel(row.reportCategory)}
                      </TableCell>
                      <TableCell className="text-[#666666]">{row.version}</TableCell>
                      <TableCell className="font-mono text-xs text-[#666666]">
                        {row.slug}
                      </TableCell>
                      <TableCell>
                        {row.published ? (
                          <Badge className="bg-emerald-100 text-emerald-800">공개</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            비공개
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[#666666]">
                        {formatDate(row.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <TemplateRowActions id={row.id} />
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
