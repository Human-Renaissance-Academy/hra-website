/**
 * 공개 공지 목록의 검색 입력을 정규화하고 서비스가 조회한 발행 목록을 표시합니다.
 * 방문 기록으로 검색어가 바뀌면 검색 입력도 해당 목록의 검색어로 초기화합니다.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Pin } from "lucide-react";
import { NoticeSearch } from "./_components/notice-search";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { listPublishedNotices } from "@/features/notices/public-list/service";
import { formatKstDate } from "@/lib/date-time";

export const metadata: Metadata = {
  title: "공지사항",
  description: "HRA의 학사 일정, 행사, 모집 등 주요 소식을 확인할 수 있는 공지사항입니다.",
  // 검색·페이지 쿼리가 붙은 주소도 기본 목록을 대표 주소(canonical)로 사용합니다.
  alternates: { canonical: "/notices" },
};

export const dynamic = "force-dynamic";

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  // 중복 키는 배열이므로 자료실의 단일 쿼리 처리처럼 무시하고 기본 목록을 표시한다.
  const query = typeof params.q === "string" ? params.q.trim() : "";
  // 목록 서비스가 공개 상태·검색·페이지 보정과 표시 필드 조회를 담당합니다.
  const { items: currentNotices, totalCount, currentPage, totalPages, startIndex } =
    await listPublishedNotices({ query, page: params.page });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
              공지사항
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[#666666] md:text-base">
            HRA의 최신 소식과 중요 공지를 확인하세요.
          </p>
        </div>

        {/* 검색어가 바뀐 방문 기록에서는 입력 상태를 새 검색어로 초기화합니다. */}
        <NoticeSearch key={query} defaultValue={query} />
      </section>

      {totalCount === 0 ? (
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">
            {query ? "검색 결과가 없습니다" : "공지사항이 없습니다"}
          </CardContent>
        </Card>
      ) : (
        <div className="w-full rounded-xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] overflow-hidden">
          <div className="flex items-center bg-gray-50 border-b border-[#D9D9D9] py-3.5 px-4 text-sm font-medium text-[#666666]">
            <div className="w-16 text-center shrink-0">번호</div>
            <div className="flex-1 text-center">제목</div>
            <div className="w-24 text-center shrink-0 hidden md:block">작성자</div>
            <div className="w-28 text-center shrink-0">작성일</div>
            <div className="w-16 text-center shrink-0 hidden md:block">조회수</div>
          </div>

          <div className="flex flex-col">
            {currentNotices.map((notice, index) => {
              const num = totalCount - startIndex - index;

              return (
                <Link
                  key={notice.id}
                  href={`/notices/${notice.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center border-b border-[#D9D9D9] last:border-b-0 py-3.5 px-4 transition-colors hover:bg-gray-50 text-sm"
                >
                  <div className="hidden sm:block w-16 text-center text-[#666666] shrink-0">
                    {num}
                  </div>

                  <div className="flex-1 text-left sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 overflow-hidden mb-2 sm:mb-0">
                    <div className="flex items-center gap-2 max-w-full">
                      {notice.pinned ? (
                        <Badge className="border border-blue-300 bg-blue-50 text-blue-700 shrink-0 px-1.5 py-0 text-[10px] h-5 hover:bg-blue-50">
                          <Pin className="size-3 mr-1" />
                          고정
                        </Badge>
                      ) : null}
                      <span className="truncate text-[#1a1a1a] font-medium group-hover:text-blue-600 transition-colors">
                        {notice.title}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center text-xs sm:text-sm text-[#666666] sm:text-[#666666]">
                    <div className="w-24 text-center shrink-0 hidden md:block">
                      관리자
                    </div>
                    <div className="w-auto sm:w-28 text-left sm:text-center shrink-0">
                      {formatKstDate(notice.createdAt)}
                    </div>
                    <div className="w-16 text-center shrink-0 hidden md:block">
                      {notice.viewCount}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;

            const href = query
              ? `/notices?q=${encodeURIComponent(query)}&page=${page}`
              : `/notices?page=${page}`;

            return (
              <Link
                key={page}
                href={href}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  currentPage === page
                    ? "bg-[#2563EB] text-white"
                    : "border border-[#D9D9D9] bg-white text-[#666666] hover:bg-[#F5F5F5]"
                }`}
              >
                {page}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
