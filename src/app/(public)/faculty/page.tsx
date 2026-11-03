/**
 * 공개 교수진 Page의 카테고리 표시와 메타데이터를 구성합니다.
 * 조회·정렬은 교수진 Application Service/Repository에 맡깁니다.
 */
import type { Metadata } from "next";
import { listPublicFaculty, type PublicFaculty } from "@/features/faculty/public-list/service";
import { FacultyTabs } from "./_components/faculty-tabs";

export const metadata: Metadata = {
  title: "교수진 소개",
  description: "HRA의 교육을 이끄는 다양한 분야의 교수진과 그들의 전문성을 소개합니다.",
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/faculty" },
};

export const dynamic = "force-dynamic";

type FacultyCategory = PublicFaculty["category"];

export default async function FacultyPage() {
  const allFaculty = await listPublicFaculty();

  const displayFacultyByCategory: Record<FacultyCategory, PublicFaculty[]> = {
    CLASSICS: allFaculty.filter((m) => m.category === "CLASSICS"),
    BUSINESS: allFaculty.filter((m) => m.category === "BUSINESS"),
    LECTURE: allFaculty.filter((m) => m.category === "LECTURE"),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 text-center sm:mb-14 sm:text-left">
        <div className="flex items-center gap-3 justify-center sm:justify-start">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl md:text-5xl">
            교수진 소개
          </h1>
        </div>
        <p className="mx-auto max-w-2xl text-sm text-[#666666] sm:mx-0 md:text-base">
          HRA의 교육을 이끄는 교수진을 소개합니다.
        </p>
      </section>

      <FacultyTabs displayFacultyByCategory={displayFacultyByCategory} />
    </div>
  );
}
