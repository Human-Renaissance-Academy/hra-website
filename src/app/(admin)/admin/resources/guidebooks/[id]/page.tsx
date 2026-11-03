/**
 * 가이드북 수정 페이지
 *
 * 역할: 기존 가이드북의 제목을 변경하거나 파일을 교체한다.
 *       파일 교체 없이 제목만 수정할 수도 있다.
 * 사용 위치: /admin/resources/guidebooks/[id]
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { GuidebookForm } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-form";
import { updateGuidebook } from "@/features/guidebooks/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminGuidebook } from "@/features/guidebooks/admin/service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditGuidebookPage({ params }: Props) {
  const session = await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const guidebook = await getAdminGuidebook({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!guidebook) {
    notFound();
  }

  // id를 bind해서 action 시그니처를 (formData: FormData) => Promise<State>로 맞춤
  const boundAction = updateGuidebook.bind(null, parsedId.data);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">가이드북 수정</h1>
        <Button variant="outline" render={<Link href="/admin/resources/guidebooks" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <GuidebookForm
        action={boundAction}
        userId={session.user.id}
        defaultValues={{ title: guidebook.title, fileName: guidebook.fileName }}
      />
    </section>
  );
}
