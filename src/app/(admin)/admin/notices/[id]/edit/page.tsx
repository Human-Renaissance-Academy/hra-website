/**
 * 관리자 공지 편집의 Web adapter입니다.
 * UUID 사전 검증과 기존 누락 안내·폼 props를 유지하며 조회는 서비스에 위임합니다.
 */
import Link from "next/link";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { updateNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminNotice } from "@/features/notices/admin/service";

type NoticeEditPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function NoticeEditPage({ params }: NoticeEditPageProps) {
  const session = await requireAdmin();

  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const noticeId = parsedId.success ? parsedId.data : null;

  if (!noticeId) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">공지사항을 찾을 수 없습니다.</CardContent>
        </Card>
      </section>
    );
  }

  const notice = await getAdminNotice({ userId: session.user.id, role: session.user.role }, noticeId);

  if (!notice) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">공지사항을 찾을 수 없습니다.</CardContent>
        </Card>
      </section>
    );
  }

  const action = updateNotice.bind(null, noticeId);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지 수정</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      <NoticeForm
        action={action}
        defaultValues={{
          title: notice.title,
          content: notice.content,
          status: notice.status,
          pinned: notice.pinned,
        }}
        submitLabel="수정 저장"
        successMessage="공지사항이 수정되었습니다."
      />
    </section>
  );
}
