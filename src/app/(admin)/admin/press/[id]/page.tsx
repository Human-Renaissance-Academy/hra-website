/**
 * 관리자 언론보도 편집 화면의 웹 adapter입니다.
 * UUID를 조회 전에 검증하고 서비스 DTO를 기존 폼 기본값으로 변환합니다.
 */
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { PressForm } from "@/app/(admin)/admin/press/_components/press-form";
import { updatePressArticle } from "@/features/press/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminItem } from "@/features/press/admin/service";
import { toKstDateInput } from "@/lib/date-time";

export const dynamic = "force-dynamic";

type EditPressArticlePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPressArticlePage({ params }: EditPressArticlePageProps) {
  const session = await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const article = await getAdminItem({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!article) {
    notFound();
  }

  const updateAction = updatePressArticle.bind(null, parsedId.data);

  return (
    <PressForm
      title="언론보도 수정"
      description={`${article.source} 기사 정보를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      defaultValues={{
        title: article.title,
        source: article.source,
        url: article.url,
      publishedAt: toKstDateInput(article.publishedAt),
        description: article.description,
        imageUrl: article.imageUrl,
      }}
    />
  );
}
