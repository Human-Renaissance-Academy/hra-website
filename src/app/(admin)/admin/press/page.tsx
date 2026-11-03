/**
 * 관리자 언론보도 목록의 웹 adapter입니다.
 * 드래그앤드롭으로 공개 페이지 표시 순서를 변경할 수 있습니다.
 * 세션을 서비스 주체로 전달하고 기존 정렬 목록의 클라이언트 props를 구성합니다.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { listAdminItems } from "@/features/press/admin/service";
import { PressSortableList } from "./_components/press-sortable-list";

export const dynamic = "force-dynamic";

export default async function AdminPressPage() {
  const session = await requireAdmin();

  // order 오름차순, 동일 order는 생성일 오름차순으로 초기 정렬 (목록 표시에 필요한 네 컬럼만 조회)
  const articles = await listAdminItems({ userId: session.user.id, role: session.user.role });

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">언론보도 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/press/new" />}>
          <Plus className="mr-1 size-4" />
          새 언론보도 추가
        </Button>
      </div>

      {/* key를 items.length에 연결해 항목 추가 후 서버 재렌더 시 상태 초기화 */}
      <PressSortableList
        key={articles.length}
        initialItems={articles.map((article) => ({
          id: article.id,
          title: article.title,
          source: article.source,
          publishedAt: article.publishedAt,
        }))}
      />
    </section>
  );
}
