/**
 * 공개 수료생 이야기 Page의 카드·링크·이미지 대체색을 표시합니다.
 * 목록 건수와 짧은 평문 요약 조회는 Application Service/Repository에 맡깁니다.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listPublicAlumniStories } from "@/features/alumni/public-list/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수료생 이야기",
  description: "HRA를 수료한 동문들의 성장 이야기와 사회 진출 이후의 발걸음을 만나보세요.",
  // 검색·페이지 쿼리가 붙은 주소도 기본 목록을 대표 주소(canonical)로 사용합니다.
  alternates: { canonical: "/alumni" },
};

type AlumniStoryViewModel = {
  id: number | string;
  name: string;
  quote: string;
  story: string;
  title?: string | null;
  imageUrl?: string | null;
  gradient: string;
};

const gradients = [
  "from-amber-700 via-amber-800 to-stone-900",
  "from-blue-700 via-blue-800 to-slate-900",
  "from-emerald-700 via-emerald-800 to-slate-900",
] as const;

export default async function AlumniPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const { items: currentDbStories, totalCount, currentPage, totalPages, startIndex } =
    await listPublicAlumniStories(params.page);

  const stories: AlumniStoryViewModel[] = currentDbStories.map((story, index) => ({
    id: story.id,
    name: story.name,
    quote: story.quote,
    story: story.summary,
    title: story.title,
    imageUrl: story.imageUrl,
    gradient: gradients[(startIndex + index) % gradients.length],
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
  
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
            수료생 이야기
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA를 거쳐 간 수료생들이 각자의 자리에서 어떻게 성장했는지, 그 변화의 순간을 짧은 이야기로 전합니다.
        </p>
      </section>

      {totalCount === 0 ? (
        <section className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#D9D9D9] bg-white p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg font-semibold text-[#1a1a1a]">아직 등록된 수료생 이야기가 없습니다.</p>
          <p className="text-sm text-[#666666]">수료생 이야기가 등록되면 이곳에 표시됩니다.</p>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-16 md:gap-24">
            {stories.map((story) => (
              <article
                key={story.id}
                className="flex flex-col gap-8 md:grid md:grid-cols-[280px_1fr] md:items-start md:gap-12"
              >
                <div className="w-full">
                  <Link href={`/alumni/${story.id}`} className="group block">
                    {story.imageUrl ? (
                      <Image
                        src={story.imageUrl}
                        alt={`${story.name} 수료생 사진`}
                        width={600}
                        height={600}
                        className="aspect-square max-w-[280px] w-full rounded-2xl object-cover shadow-[var(--shadow-soft)] transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div
                        className={`flex aspect-square max-w-[280px] w-full items-center justify-center rounded-2xl bg-gradient-to-br ${story.gradient} shadow-[var(--shadow-soft)] transition-transform duration-300 group-hover:scale-[1.02]`}
                      >
                        <span className="text-sm font-medium text-white/40">수료생 사진</span>
                      </div>
                    )}
                  </Link>
                </div>

                <div className="flex flex-col h-full">
                  <Link href={`/alumni/${story.id}`} className="group">
                    <h2 className="text-2xl font-bold leading-snug text-[#1a1a1a] md:text-3xl group-hover:text-[#2563EB] transition-colors">
                      &quot;{story.quote}&quot;
                    </h2>
                  </Link>
                  
                  {story.story && (
                    <p className="mt-6 text-sm leading-relaxed text-[#666666] line-clamp-5">
                      {story.story}
                    </p>
                  )}

                  <div className="mt-6">
                    <Link
                      href={`/alumni/${story.id}`}
                      className="inline-flex items-center gap-1 text-[#2563EB] font-semibold hover:underline"
                    >
                      이야기 더 보기 <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>

                  <div className="mt-auto border-t border-gray-100 pt-6">
                    <p className="font-bold text-[#1a1a1a]">{story.name}</p>
                    {story.title ? <p className="mt-1 text-sm text-[#666666]">{story.title}</p> : null}
                  </div>
                </div>
              </article>
            ))}
          </section>

          {totalPages > 1 && (
            <div className="mt-20 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1;
                return (
                  <Link
                    key={page}
                    href={`/alumni?page=${page}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      currentPage === page
                        ? "bg-[#2563EB] text-white shadow-md"
                        : "border border-[#D9D9D9] bg-white text-[#666666] hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
