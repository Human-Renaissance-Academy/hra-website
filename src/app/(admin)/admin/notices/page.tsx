/**
 * 관리자 공지 목록의 Web adapter입니다.
 * 세션 확인 뒤 서비스 목록을 기존 미리보기와 클라이언트 props로 표시합니다.
 */
import Link from "next/link";
import { NoticePinButton } from "@/app/(admin)/admin/notices/_components/notice-pin-button";
import { NoticeRowActions } from "@/app/(admin)/admin/notices/_components/notice-row-actions";
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
import { listAdminNotices } from "@/features/notices/admin/service";
import { formatKstDate } from "@/lib/date-time";

// 마크다운 기호를 제거해 본문 미리보기용 평문으로 변환
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const dynamic = "force-dynamic";

export default async function AdminNoticesPage() {
  const session = await requireAdmin();

  const noticeList = await listAdminNotices({ userId: session.user.id, role: session.user.role });

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">공지사항 관리</h1>
        <Button render={<Link href="/admin/notices/new" />}>새 공지 작성</Button>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 공지 {noticeList.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">고정</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-24">상태</TableHead>
                  <TableHead className="w-28">날짜</TableHead>
                  <TableHead className="w-28 text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noticeList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      등록된 공지사항이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  noticeList.map((notice) => (
                    <TableRow key={notice.id}>
                      <TableCell>
                        <NoticePinButton id={notice.id} pinned={notice.pinned} />
                      </TableCell>
                      <TableCell className="w-[20%] max-w-0 font-medium text-slate-900">
                        <span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">
                          {notice.title}
                        </span>
                      </TableCell>
                      <TableCell className="w-[40%] max-w-0 text-slate-500">
                        <span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_75%,transparent_100%)]">
                          {stripMarkdown(notice.content)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-600">
                        {notice.status === "PUBLISHED" ? "게시" : "임시저장"}
                      </TableCell>
                      <TableCell className="text-slate-600">{formatKstDate(notice.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <NoticeRowActions id={notice.id} />
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
