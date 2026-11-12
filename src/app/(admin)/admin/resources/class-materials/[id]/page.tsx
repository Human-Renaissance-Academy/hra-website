/**
 * 강의 자료 수정 페이지
 *
 * 역할: 기존 강의 자료의 텍스트 필드를 변경하거나 파일을 교체한다.
 *       파일 교체 없이 제목/주차/강의명/대상만 수정할 수도 있다.
 * 사용 위치: /admin/resources/class-materials/[id]
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { ClassMaterialForm } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-form";
import { updateClassMaterial } from "@/features/class-materials/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminMaterial } from "@/features/class-materials/admin/service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditClassMaterialPage({ params }: Props) {
  const session = await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const material = await getAdminMaterial({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!material) {
    notFound();
  }

  // id를 bind해서 action 시그니처를 (formData: FormData) => Promise<State>로 맞춤
  const boundAction = updateClassMaterial.bind(null, parsedId.data);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">강의 자료 수정</h1>
        <Button variant="outline" render={<Link href="/admin/resources/class-materials" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <ClassMaterialForm
        action={boundAction}
        userId={session.user.id}
        defaultValues={{
          title: material.title,
          weekNumber: material.weekNumber,
          lectureTitle: material.lectureTitle,
          audience: material.audience as "FACULTY" | "STUDENT",
          fileName: material.fileName,
        }}
      />
    </section>
  );
}
