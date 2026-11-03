/**
 * 공개 기수 Page의 카드 표시와 운영 중 기수 집계를 구성합니다.
 * 시작일 공개 조건과 PostgreSQL 정렬은 기수 Service/Repository에 맡깁니다.
 */
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import type { Metadata } from "next";
import { listVisibleCohorts, type PublicCohort } from "@/features/cohorts/public-list/service";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "기수 소개",
  description: "1기부터 현재까지 HRA의 모든 기수와 함께한 청년들의 발자취를 한눈에 확인하세요.",
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/cohorts" },
};

function formatPeriod(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return "";
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(startDate)} - ${fmt(endDate)}`;
}

export default async function CohortsPage() {
  let cohortData: PublicCohort[];

  try {
    cohortData = await listVisibleCohorts(new Date());
  } catch (error) {
    // DB 조회 실패 시: 빈 화면이 "데이터 없음"과 구분되도록 서버 로그에 명확히 기록한다.
    // 이렇게 해야 운영 중 실제 장애와 단순한 미시드(미입력) 상태를 구분할 수 있다.
    logServerError("public/cohorts", error);
    cohortData = [];
  }

  const totalCohorts = cohortData.length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
              기수 소개
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[#666666] md:text-base">
            HRA의 역대 기수를 소개합니다. 현재까지 총 {totalCohorts}기가 함께했습니다.
          </p>
        </div>
        
        <div className="flex items-stretch gap-3">
          <div className="flex flex-1 min-w-0 flex-col justify-center sm:flex-none sm:w-[120px] rounded-xl border border-[#D9D9D9] bg-white p-3 sm:p-4 shadow-[var(--shadow-soft)]">
            <span className="text-xs sm:text-sm font-medium text-[#666666] mb-1">총 기수</span>
            <span className="text-xl sm:text-2xl font-bold text-[#2563EB]">{totalCohorts}기</span>
          </div>
          <div className="flex flex-1 min-w-0 flex-col justify-center sm:flex-none sm:w-[120px] rounded-xl border border-[#D9D9D9] bg-white p-3 sm:p-4 shadow-[var(--shadow-soft)]">
            <span className="text-xs sm:text-sm font-medium text-[#666666] mb-1">총 수료생</span>
            <span className="text-xl sm:text-2xl font-bold text-[#2563EB]">406명</span>
          </div>
        </div>
      </section>

      {cohortData.length > 0 ? (
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-16 sm:pb-24 md:pb-32">
          {cohortData.map((cohort) => (
            <div
              key={cohort.name}
              className={`group relative flex flex-col justify-between rounded-2xl bg-white shadow-[var(--shadow-soft)] overflow-hidden transition-all hover:bg-gray-50 hover:border-blue-400 hover:-translate-y-1 ${
                cohort.isActive ? "border-blue-500 border-2" : "border border-[#D9D9D9]"
              }`}
            >
              <div className="h-40 sm:h-48 bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center relative">
                {cohort.imageUrl ? (
                  <Image
                    src={cohort.imageUrl}
                    alt={`${cohort.name} 사진`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <Users className="w-12 h-12 text-[#666666]" />
                )}
              </div>

              <div className="p-5 sm:p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
                    {cohort.name}
                  </h2>
                  {cohort.isActive ? (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 rounded-full px-3 py-1">
                      진행 중
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 rounded-full px-3 py-1">
                      수료
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 mb-6 flex-1">
                  {(cohort.startDate || cohort.endDate) ? (
                    <div className="flex items-center text-sm text-[#666666]">
                      <Calendar className="w-4 h-4 mr-2 text-[#666666]" />
                      <span>{formatPeriod(cohort.startDate, cohort.endDate)}</span>
                    </div>
                  ) : null}
                </div>

                {cohort.description ? (
                  <div className="pt-4 border-t border-[#D9D9D9] mt-auto">
                    <p className="text-[#666666] text-sm font-medium line-clamp-2">
                      &quot;{cohort.description}&quot;
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 py-12 text-center text-[#666666] shadow-[var(--shadow-soft)]">
          등록된 기수가 없습니다. 곧 업데이트될 예정입니다.
        </div>
      )}
    </div>
  );
}
