/** 보고서 양식 편집의 경로 검증·404 처리·폼 액션 바인딩을 담당하는 Web 어댑터입니다. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { TemplateForm } from "@/app/(admin)/admin/resources/templates/_components/template-form";
import { Button } from "@/components/ui/button";
import { updateReportTemplate } from "@/features/report-templates/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminTemplate } from "@/features/report-templates/admin/service";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function EditResourceTemplatePage({ params }: Props) {
  const session = await requireAdmin();
  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const target = await getAdminTemplate({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!target) {
    notFound();
  }

  // 서버 액션 참조를 유지한 채 대상 ID를 바인딩해 클라이언트 폼으로 전달한다.
  const boundAction = updateReportTemplate.bind(null, target.id);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
          양식 편집
        </h1>
        <Button variant="outline" render={<Link href="/admin/resources/templates" />}>
          목록으로
        </Button>
      </div>
      <TemplateForm
        action={boundAction}
        defaultValues={{
          slug: target.slug,
          title: target.title,
          category: target.category,
          reportCategory: target.reportCategory as
            | "management-book"
            | "classic-book"
            | "business-practice"
            | null,
          description: target.description,
          version: target.version,
          body: target.body,
          published: target.published,
          order: target.order,
        }}
        submitLabel="변경 저장"
      />
    </section>
  );
}
