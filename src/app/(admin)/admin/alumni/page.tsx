/** 관리자 수료생 목록은 세션을 확인하고 서비스의 표시용 목록을 전달합니다. */

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { listAdminItems } from "@/features/alumni/admin/service";
import { AlumniSortableList } from "./_components/alumni-sortable-list";

export const dynamic = "force-dynamic";

export default async function AdminAlumniPage() {
  const session = await requireAdmin();

  // 고정된 항목 먼저, 그 다음 작성일 최신순
  const stories = await listAdminItems({ userId: session.user.id, role: session.user.role });

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">수료생 이야기 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/alumni/new" />}>
          <Plus className="mr-1 size-4" />
          새 수료생 이야기 추가
        </Button>
      </div>

      <AlumniSortableList initialItems={stories} />
    </section>
  );
}
