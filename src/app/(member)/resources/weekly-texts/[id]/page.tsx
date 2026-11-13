import type { Metadata } from "next";
import { formatKstDate as formatDate } from "@/lib/date-time";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Download, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { getWebWeeklyTextDetail, getWebWeeklyTextTitle } from "@/features/weekly-texts/web/service";

export const dynamic = "force-dynamic";

type WeeklyTextViewerPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: WeeklyTextViewerPageProps): Promise<Metadata> {
  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 Postgres cast 에러 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { title: "주차별 텍스트" };
  }

  const session = await auth();
  const title = await getWebWeeklyTextTitle(session?.user?.role, parsedId.data);
  return { title: title ?? "주차별 텍스트" };
}

export default async function WeeklyTextViewerPage({ params }: WeeklyTextViewerPageProps) {
  const session = await requireSharedResourceReader();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — 라우트 파라미터의 UUID 형식을 먼저 검증.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const text = await getWebWeeklyTextDetail(session.user.role, parsedId.data);

  if (!text) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/resources">
          <Button variant="ghost" className="text-[#666666] hover:bg-gray-50 hover:text-[#1a1a1a]">
            <ArrowLeft className="size-4" />
            목록으로
          </Button>
        </Link>
      </div>

      <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
        <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#D9D9D9] py-6 sm:py-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666] sm:text-sm">
              <Badge
                variant="secondary"
                className="border border-[#D9D9D9] bg-gray-50 text-[#666666]"
              >
                <CalendarDays className="size-3.5" />
                {formatDate(text.createdAt)}
              </Badge>
              {text.cohortName ? (
                <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
                  {text.cohortName}
                </Badge>
              ) : null}
              {text.textType ? (
                <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
                  {text.textType}
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-xl font-semibold text-[#1a1a1a] sm:text-2xl md:text-3xl">
              {text.title}
            </CardTitle>
          </div>
          <Link
            href={`/resources/weekly-texts/${text.id}/print`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#D9D9D9] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Printer className="size-4" />
            PDF 저장
          </Link>
        </CardHeader>

        <CardContent className="space-y-8 py-6 sm:py-10">
          {text.body ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#1a1a1a]">본문</h2>
              <MarkdownViewer body={text.body} />
            </section>
          ) : null}

          {text.hasFile ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#1a1a1a]">첨부 문서</h2>
              <a
                href={`/api/resources/weekly-texts/${text.id}/download`}
                download={text.fileName ?? undefined}
                className="inline-flex items-center gap-2 rounded-full border border-[#D9D9D9] bg-white px-4 py-2 text-sm font-medium text-[#2563EB] transition-colors hover:border-[#2563EB] hover:bg-blue-50"
              >
                <Download className="size-4" />
                {text.fileName ?? "첨부 파일 내려받기"}
              </a>
            </section>
          ) : null}

          {text.images.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#1a1a1a]">첨부 사진</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {text.images.map((image) => (
                  <div
                    key={image.id}
                    className="overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]"
                  >
                    {/* 사진은 최대 100장이고 각 요청이 사용자별 자료 조회 예산(#444)을 쓰므로 화면에 가까워질 때만 불러옵니다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/resources/weekly-text-images/${image.id}/download`}
                      alt={image.alt?.trim() || `${text.title} 사진`}
                      loading="lazy"
                      decoding="async"
                      className="h-44 w-full object-cover sm:h-52"
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
