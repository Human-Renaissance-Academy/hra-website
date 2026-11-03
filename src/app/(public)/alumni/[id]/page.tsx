/**
 * 공개 수료생 상세의 본문·이웃 링크·사이드바를 렌더링합니다.
 * UUID 검사와 조회 순서·표시 열은 수료생 Application Service/Repository에 맡깁니다.
 */
import { cache } from "react";
import { getPublicAlumniDetail } from "@/features/alumni/detail/service";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { AlumniSidebar } from "./_components/alumni-sidebar";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

// 메타데이터와 본문이 같은 요청에서 상세를 한 번만 조회하도록 요청 단위로 캐시합니다.
const loadAlumniDetail = cache(getPublicAlumniDetail);

/**
 * 기존 제목("수료생 이야기")을 유지하고, 실제로 존재하는 이야기에만 canonical을 선언합니다.
 * 잘못된 ID·없는 이야기는 404가 되므로 대표 주소를 내보내지 않습니다.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const detail = await loadAlumniDetail(id);
  if (!detail) return { title: "수료생 이야기" };
  return {
    title: "수료생 이야기",
    alternates: { canonical: `/alumni/${detail.story.id}` },
  };
}

export default async function AlumniDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await loadAlumniDetail(id);
  if (!detail) notFound();
  const { story, prevStory, nextStory, sidebarStories } = detail;

  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      <h1 className="text-3xl md:text-4xl font-bold text-center text-[#1a1a1a] mb-4">
        수료생 이야기
      </h1>
      <div className="w-16 h-1 bg-[#2563EB] mx-auto mb-2 rounded-full" />
      <p className="text-center text-[#666666] mb-2">{story.name}의 이야기</p>
      <div className="mb-12" />

      <div className="max-w-3xl mx-auto">
        {story.imageUrl && (
          <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-8 border border-[#D9D9D9]">
            <Image
              src={story.imageUrl}
              alt={story.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 800px"
            />
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">{story.name}</h2>
          {story.title && (
            <p className="text-[#666666] font-medium">{story.title}</p>
          )}
        </div>

        {story.quote && (
          <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-[#D9D9D9]">
            <p className="text-xl font-bold text-[#1a1a1a] italic leading-relaxed">
              &quot;{story.quote}&quot;
            </p>
          </div>
        )}
        <div className="mb-24">
          <MarkdownViewer body={story.content} />
        </div>

        <div className="pt-16 border-t border-[#D9D9D9]">
          <AlumniSidebar stories={sidebarStories} currentStoryId={story.id} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-16 pt-8 border-t border-[#D9D9D9]">
        {prevStory ? (
          <Link
            href={`/alumni/${prevStory.id}`}
            className="flex items-center gap-2 text-[#666666] hover:text-[#2563EB] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <div className="hidden sm:block">
              <div className="text-xs text-gray-500 mb-0.5">이전글</div>
              <div className="text-sm font-medium">{prevStory.name}의 이야기</div>
            </div>
          </Link>
        ) : (
          <div className="w-24" />
        )}

        <Link
          href="/alumni"
          className="px-8 py-2.5 border border-[#D9D9D9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-gray-50 transition-colors"
        >
          목록
        </Link>

        {nextStory ? (
          <Link
            href={`/alumni/${nextStory.id}`}
            className="flex items-center gap-2 text-[#666666] hover:text-[#2563EB] transition-colors text-right"
          >
            <div className="hidden sm:block text-right">
              <div className="text-xs text-gray-500 mb-0.5">다음글</div>
              <div className="text-sm font-medium">{nextStory.name}의 이야기</div>
            </div>
            <ChevronRight className="w-5 h-5" />
          </Link>
        ) : (
          <div className="w-24" />
        )}
      </div>
    </div>
  );
}
