/**
 * 공개 공지 상세 화면과 검색 미리보기 메타데이터를 구성합니다.
 * 공지 조회·이웃 글·조회수 저장은 공용 Application Service를 통해 처리합니다.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { getPublishedNoticeById, getPublishedNoticeDetail, incrementPublishedNoticeViewCount } from "@/features/notices/detail/service";
import { formatKstDate } from "@/lib/date-time";
import { logServerError } from "@/lib/errors";
import { buildNoticeExcerpt } from "@/lib/notice-excerpt";

type NoticePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: NoticePageProps): Promise<Metadata> {
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const notice = parsedId.success ? await getPublishedNoticeById(parsedId.data) : null;

  // 없거나 게시되지 않은 공지는 404가 되므로 canonical을 선언하지 않습니다.
  if (!notice) {
    return { title: "공지사항" };
  }

  const description = buildNoticeExcerpt(notice.content);

  return {
    title: notice.title,
    description,
    // 게시된 공지만 자기 상세 경로를 대표 주소로 선언합니다.
    alternates: { canonical: `/notices/${notice.id}` },
    openGraph: {
      title: notice.title,
      description,
      type: "article",
      url: `/notices/${notice.id}`,
      publishedTime: notice.createdAt.toISOString(),
    },
    twitter: {
      title: notice.title,
      description,
    },
  };
}

export default async function NoticeDetailPage({ params }: NoticePageProps) {
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const detail = parsedId.success ? await getPublishedNoticeDetail(parsedId.data) : null;

  if (!detail) {
    notFound();
  }
  const { notice, prevNotice, nextNotice } = detail;

  // 응답을 막지 않되 플랫폼이 SQL 완료를 기다리도록 응답 후 수명주기에 등록한다.
  // 요청별 원자 갱신이며 방문자 중복 제거·정확히 한 번 집계는 보장하지 않는다.
  after(async () => {
    try {
      await incrementPublishedNoticeViewCount(notice.id);
    } catch (err: unknown) {
      logServerError("public/notices/viewCount", err, { id: notice.id });
    }
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/notices">
          <Button variant="ghost" className="text-[#666666] hover:bg-gray-50 hover:text-[#1a1a1a]">
            <ArrowLeft className="size-4" />
            공지사항으로 돌아가기
          </Button>
        </Link>
      </div>

      <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
        <CardHeader className="border-b border-[#D9D9D9] py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-8 bg-[#2563EB] rounded-full shrink-0" />
            <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#1a1a1a]">
              {notice.title}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666] md:text-sm">
            <span>작성자 : 관리자</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              작성일 : {formatKstDate(notice.createdAt)}
            </span>
            <span>조회수 : {notice.viewCount}</span>
          </div>
        </CardHeader>
        <CardContent className="py-6 sm:py-10">
          <MarkdownViewer body={notice.content} />
        </CardContent>
      </Card>

      <div className="mt-8 flex items-center justify-between gap-4">
        {prevNotice ? (
          <Link href={`/notices/${prevNotice.id}`} className="flex items-center gap-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="size-4" />
            <div>
              <div className="text-xs text-[#666666]">이전글</div>
              <div className="font-medium text-[#1a1a1a]">{prevNotice.title}</div>
            </div>
          </Link>
        ) : <div />}
        <Link href="/notices">
          <Button variant="outline" className="border-[#D9D9D9] text-[#666666] hover:bg-gray-50">목록</Button>
        </Link>
        {nextNotice ? (
          <Link href={`/notices/${nextNotice.id}`} className="flex items-center gap-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors text-right">
            <div>
              <div className="text-xs text-[#666666]">다음글</div>
              <div className="font-medium text-[#1a1a1a]">{nextNotice.title}</div>
            </div>
            <ArrowRight className="size-4" />
          </Link>
        ) : <div />}
      </div>
    </div>
  );
}
