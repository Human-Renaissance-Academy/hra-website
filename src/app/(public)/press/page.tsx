/**
 * 공개 언론보도 페이지입니다.
 * 카드 형태가 아니라 단순 게시판(목록) 형태로 표시합니다.
 * - 데스크톱: 번호 / 제목 / 매체 / 날짜 4열 테이블
 * - 모바일: 제목과 매체·날짜를 세로로 적층
 * 행 전체가 외부 기사 링크로 동작하며 새 탭에서 열립니다.
 */

import type { Metadata } from "next";
import { listPublicPressArticles } from "@/features/press/public-list/service";
import { formatKstDate } from "@/lib/date-time";
import { PressLink } from "./_components/press-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "언론보도",
  description: "HRA의 활동과 비전이 다양한 언론 매체를 통해 어떻게 소개되었는지 확인해보세요.",
  // 검색·페이지 쿼리가 붙은 주소도 기본 목록을 대표 주소(canonical)로 사용합니다.
  alternates: { canonical: "/press" },
};

// 게시판에 표시할 날짜 형식 (예: 2025.04.26)
const formatDate = (value: Date) =>
  formatKstDate(value)
    .replace(/\.\s?$/, "")
    .replace(/\.\s/g, ".");

export default async function PressPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  // 전체 건수·페이지 보정·표시 열 조회는 같은 Application Service에 맡깁니다.
  const { currentArticles, totalCount, currentPage, totalPages, startIndex } =
    await listPublicPressArticles(params.page);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
  
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
            언론보도
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA가 소개된 언론보도를 모아보았습니다. 다양한 매체에서 전한 HRA의 이야기와 주요 소식을 확인해보세요.
        </p>
      </section>

      {totalCount === 0 ? (
        <div className="rounded-lg border border-[#D9D9D9] bg-white px-6 py-16 text-center text-base text-[#666666]">
          등록된 언론보도가 없습니다
        </div>
      ) : (
        <section
          aria-label="언론보도 목록"
          className="overflow-hidden rounded-lg border border-[#D9D9D9] bg-white"
        >
          {/* 데스크톱용 헤더 행 (모바일에서는 숨김) */}
          <div className="hidden border-b border-[#D9D9D9] bg-[#F5F5F5] md:grid md:grid-cols-[80px_1fr_180px_100px_140px] md:items-center md:gap-4 md:px-6 md:py-3">
            <span className="text-center text-sm font-semibold text-[#666666]">번호</span>
            <span className="text-center text-sm font-semibold text-[#666666]">제목</span>
            <span className="text-center text-sm font-semibold text-[#666666]">매체</span>
            <span className="text-center text-sm font-semibold text-[#666666]">조회</span>
            <span className="text-center text-sm font-semibold text-[#666666]">날짜</span>
          </div>

          <ul className="divide-y divide-[#D9D9D9]">
            {currentArticles.map((article, index) => {
              // 최신 항목이 가장 큰 번호를 갖도록 (게시판 일반 규칙)
              const number = totalCount - startIndex - index;
              return (
                <li key={article.id}>
                  <PressLink
                    articleId={article.id}
                    href={article.url}
                    className="block px-4 py-4 transition-colors hover:bg-[#F5F5F5] md:grid md:grid-cols-[80px_1fr_180px_100px_140px] md:items-center md:gap-4 md:px-6 md:py-4"
                  >
                    {/* 번호 (모바일 숨김) */}
                    <span className="hidden text-center text-sm text-[#666666] md:block">{number}</span>

                    {/* 제목 */}
                    <span className="block text-left text-base font-medium text-[#1a1a1a] hover:text-[#2563EB] md:truncate">
                      {article.title}
                    </span>

                    {/* 매체와 날짜 — 모바일에서는 한 줄로, 데스크톱에서는 별도 컬럼으로 */}
                    <span className="mt-1 block text-sm text-[#666666] md:mt-0 md:hidden">
                      {article.source} · {formatDate(article.publishedAt)}
                    </span>
                    <span className="hidden text-center text-sm text-[#666666] md:block md:truncate">
                      {article.source}
                    </span>
                    <span className="hidden text-center text-sm text-[#666666] md:block">
                      {article.viewCount}
                    </span>
                    <span className="hidden text-center text-sm text-[#666666] md:block">
                      {formatDate(article.publishedAt)}
                    </span>
                  </PressLink>
                </li>
              );
            })}
          </ul>

        </section>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;
            return (
              <a
                key={page}
                href={`/press?page=${page}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  currentPage === page
                    ? "bg-[#2563EB] text-white"
                    : "border border-[#D9D9D9] bg-white text-[#666666] hover:bg-[#F5F5F5]"
                }`}
              >
                {page}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
