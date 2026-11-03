/** 교수진 편집 페이지는 UUID를 사전 검증하고 서비스 결과를 기존 폼 props로 전달합니다. */
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { FacultyForm } from "@/app/(admin)/admin/faculty/_components/faculty-form";
import { updateFaculty } from "@/features/faculty/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminFaculty } from "@/features/faculty/admin/service";

export const metadata = { title: "교수진 수정" };

export const dynamic = "force-dynamic";

type EditFacultyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFacultyPage({ params }: EditFacultyPageProps) {
  const session = await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const facultyMember = await getAdminFaculty({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!facultyMember) {
    notFound();
  }

  const updateAction = updateFaculty.bind(null, parsedId.data);

  return (
    <FacultyForm
      title="교수진 수정"
      description={`${facultyMember.name} 정보를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      userId={session.user.id}
      targetId={parsedId.data}
      defaultValues={{
        name: facultyMember.name,
        category: facultyMember.category,
        currentPosition: facultyMember.currentPosition,
        formerPosition: facultyMember.formerPosition,
        imageUrl: facultyMember.imageUrl,
        order: facultyMember.order,
      }}
    />
  );
}
