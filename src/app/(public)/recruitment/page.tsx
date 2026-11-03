/**
 * 공개 모집안내 화면입니다.
 * 현재 기수·모집 상태는 Application Service에서 받고 Page는 날짜·링크·포스터를 표시합니다.
 * 접수 채널 영역(#412)은 홈페이지 지원서(공개 양식)와 외부 지원서(구글폼)의 상태를
 * `deriveIntakeChannels` 순수 함수로 계산해 함께 보여주며, 공통 헤더 `지원하기`의 목적지입니다.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { listPublishedApplicationForms } from "@/features/applications/public-list/service";
import {
  APPLY_CHANNELS_ANCHOR,
  deriveIntakeChannels,
  type IntakeChannelView,
} from "@/features/recruitment/intake-channels";
import { getPublicRecruitmentOverview } from "@/features/recruitment/public-overview/service";
import { formatKstDate } from "@/lib/date-time";
import { ProcessSteps } from "./_components/process-steps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모집안내",
  description: "HRA 신규 기수 모집 일정과 지원 절차를 안내합니다. 인간 르네상스를 함께 꿈꿀 청년들을 기다립니다.",
};

// 모집 상태 배지 스타일 맵
const statusMap = {
  UPCOMING: { label: "예정", className: "border-blue-300 bg-blue-50 text-blue-700" },
  OPEN: { label: "접수 중", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  CLOSED: { label: "마감", className: "border-gray-300 bg-gray-50 text-gray-600" },
} as const;

const formatDate = (value: Date | null) => {
  if (!value) return null;
  return formatKstDate(value);
};

/** 채널 카드 하나를 그립니다. 이용할 수 없는 채널도 상태·사유를 함께 표시합니다. */
function ChannelCard({ channel }: { channel: IntakeChannelView }) {
  return (
    <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
      <CardContent className="flex h-full flex-col gap-3 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-[#1a1a1a] md:text-lg">{channel.label}</h3>
          <Badge
            variant="outline"
            className={
              channel.available
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-300 bg-gray-50 text-gray-600"
            }
          >
            {channel.statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-[#666666]">{channel.description}</p>
        {channel.action ? (
          <div className="mt-auto pt-2">
            <Button
              className="w-full bg-[#2563EB] text-white hover:bg-[#1d4ed8] sm:w-auto"
              render={
                channel.action.external ? (
                  <Link href={channel.action.href} target="_blank" rel="noopener noreferrer" />
                ) : (
                  <Link href={channel.action.href} />
                )
              }
            >
              {channel.action.label}
              {channel.action.external ? (
                <ExternalLink className="ml-2 size-4" />
              ) : (
                <ChevronRight className="ml-2 size-4" />
              )}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function RecruitmentPage() {
  // Service가 관리자 저장값에서 공개 표시용 필드만 읽고 날짜 기반 상태를 계산합니다.
  const overview = await getPublicRecruitmentOverview();
  // 홈페이지 지원서는 공개 여부만으로 접수하므로 공개 양식 목록을 별도 Service로 조회합니다.
  const publishedForms = await listPublishedApplicationForms();
  const { activeCohort, recruitmentStatus } = overview;
  const status = statusMap[recruitmentStatus] ?? statusMap.UPCOMING;
  const startDate = formatDate(overview.recruitmentStartDate);
  const endDate = formatDate(overview.deadlineDate);
  // 두 채널의 상태·문구·이동 경로를 순수 함수로 계산합니다(날짜로 내부 양식을 막지 않음).
  const channels = deriveIntakeChannels({
    recruitmentStatus,
    startDateLabel: startDate,
    endDateLabel: endDate,
    googleFormUrl: overview.googleFormUrl,
    publishedInternalFormCount: publishedForms.length,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-16">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-6xl">
            모집안내
          </h1>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-[#666666] md:text-base">
          HRA는 배우고 성장하고 싶은 모두를 환영합니다.
        </p>
      </section>

      <section className="mb-10 sm:mb-16">
        <ProcessSteps />
      </section>

      {/* 현재 모집 기수 배너 */}
      <section className="space-y-4">
        {!activeCohort ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-[#666666]">
              현재 안내 중인 모집 기수가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
            <CardContent className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-[#1a1a1a] md:text-2xl">{activeCohort.name}</h2>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                {activeCohort.description ? (
                  <p className="text-sm text-[#666666] md:text-base">{activeCohort.description}</p>
                ) : null}
                <div className="inline-flex items-center gap-2 text-xs text-[#666666] md:text-sm">
                  <CalendarDays className="size-3.5" />
                  {startDate && endDate
                    ? `${startDate} ~ ${endDate}`
                    : startDate
                    ? `${startDate}부터`
                    : "모집 일정 추후 공지"}
                </div>
              </div>

            </CardContent>
          </Card>
        )}
      </section>

      {/* 접수 채널 — 공통 헤더 `지원하기`가 이 영역으로 이동합니다. 기수 연결 여부와 무관하게 항상 표시합니다. */}
      <section
        id={APPLY_CHANNELS_ANCHOR}
        aria-labelledby={`${APPLY_CHANNELS_ANCHOR}-title`}
        className="mt-10 scroll-mt-24 space-y-4 sm:mt-16"
      >
        <div className="space-y-2">
          <h2 id={`${APPLY_CHANNELS_ANCHOR}-title`} className="text-xl font-semibold text-[#1a1a1a] md:text-2xl">
            지원서 접수 채널
          </h2>
          <p className="text-sm text-[#666666] md:text-base">{channels.headline}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ChannelCard channel={channels.internal} />
          <ChannelCard channel={channels.external} />
        </div>
      </section>

      {/* 포스터 + 세부 안내 섹션 */}
      {(overview.posterImageUrl || overview.detailsMarkdown) && (() => {
        const layout = overview.posterLayout ?? "right";
        const posterUrl = overview.posterImageUrl;
        const showPoster = !!posterUrl && layout !== "none";

        const posterEl = showPoster && posterUrl ? (
          <div className="shrink-0 lg:w-80 xl:w-96">
            <Image
              src={posterUrl}
              alt="모집 포스터"
              width={600}
              height={840}
              className="w-full rounded-2xl shadow-[var(--shadow-soft)]"
            />
          </div>
        ) : null;

        const detailsEl = overview.detailsMarkdown ? (
          <div className="lg:flex-1">
            <MarkdownViewer body={overview.detailsMarkdown} />
          </div>
        ) : null;

        return (
          <section className="mt-16 sm:mt-24">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
              {layout === "left" ? <>{posterEl}{detailsEl}</> : <>{detailsEl}{posterEl}</>}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
