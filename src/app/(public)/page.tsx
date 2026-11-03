import type { Metadata } from "next";
import Image from "next/image";
import { Target, Briefcase, Heart } from "lucide-react";
import { HeroSection } from "./_components/hero-section";
import { StatsSection } from "./_components/stats-section";
import { CalendarSection } from "./_components/calendar-section";
import { AlumniCarousel } from "./_components/alumni-carousel";
import { parseCalendarMonth } from "@/lib/query-params";

export const metadata: Metadata = {
  title: "HRA - Human Renaissance Academy",
  openGraph: {
    url: "/",
  },
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/" },
};

type HomeProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  // 형식·범위가 잘못된 연월은 현재 달로 보정해 Invalid Date 렌더링을 막는다.
  const { year, month } = parseCalendarMonth(params.year, params.month);
  return (
    <div className="flex flex-col min-h-screen bg-[#FFFFFF] text-[#1a1a1a] font-sans selection:bg-blue-100 selection:text-blue-900">
      <HeroSection />

      {/* 관리자에게 메인 노출로 지정된 수료생 이야기만 표시합니다. */}
      <AlumniCarousel />

      <section className="py-24 px-4 max-w-7xl mx-auto w-full">
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            HRA가 지향하는 교육
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666666] mt-0 font-medium">
            깊이 사고하고 넓게 실천하는 교육
          </p>
          <p className="text-lg leading-8 text-[#666666] max-w-3xl mt-4 text-center">
            HRA는 청년들이 더 깊이 사고하고, 더 넓게 실천하며, <br />
            공동체 안에서 성장하도록 돕는 교육 프로그램입니다. <br />
            고전 읽기와 토론, 케이스 스터디를 통해 생각을 훈련하고, 배움을 삶과 사회로 연결합니다.<br />
            단순한 지식 습득을 넘어, 업무능력·성품·사명감을 함께 기르는 것을 목표로 합니다.
          </p>
        </div>

        <div className="flex flex-col items-center gap-1.5 my-16">
          <div className="w-1.5 h-1.5 rounded-full bg-[#D9D9D9]" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#D9D9D9]" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#D9D9D9]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)] aspect-square">
            <Image
              src="/images/faculty-classics.jpeg"
              alt="고전 읽기 수업"
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-all duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />

            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                고전<br />읽기
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  시대를 초월한 지혜를 담은 고전을 통해, 인간과 사회의 본질을 깊이 있게 탐구합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)] aspect-square">
            <Image
              src="/images/faculty-casestudy.jpeg"
              alt="케이스 스터디 수업"
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-all duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />

            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                케이스<br />스터디
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  실제 비즈니스 현장의 생생한 사례를 분석하며 문제 해결 능력과 전략적 사고를 기릅니다.
                </p>
              </div>
            </div>
          </div>

          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)] aspect-square">
            <Image
              src="/images/faculty-lecture.jpeg"
              alt="특강 수업"
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition-all duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />

            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                특강
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  각 분야 최고의 전문가들을 모시고 현장의 인사이트와 깊이 있는 지식을 배웁니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 w-full bg-[#EFF6FF]">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
              HRA 핵심 가치
            </h2>
            <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-4 mb-4" />
            <p className="text-lg text-[#666666] mt-0 font-medium">
              3C 인재를 향한 세 가지 핵심 가치
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-in-out z-0" />

              <div className="relative z-10 flex flex-col h-full">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-8 group-hover:bg-white/20 transition-colors duration-500">
                  <Target className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors duration-500" />
                </div>

                <h3 className="text-[24px] font-bold text-[#1a1a1a] group-hover:text-white transition-colors duration-500 mb-1">
                  사명감
                </h3>
                <h4 className="text-[18px] font-medium text-blue-600 group-hover:text-blue-200 transition-colors duration-500 mb-6 flex items-baseline">
                  <span className="text-[24px] font-black">C</span>ommitment
                </h4>

                <p className="text-lg leading-8 text-[#666666] group-hover:text-white transition-colors duration-500 mt-auto">
                  나를 넘어 사회를 향하는 마음.<br /> 주어진 일에 책임감을 가지고 끝까지 완수해내는 태도를 기릅니다.
                </p>
              </div>
            </div>

            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-in-out z-0" />

              <div className="relative z-10 flex flex-col h-full">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-8 group-hover:bg-white/20 transition-colors duration-500">
                  <Briefcase className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors duration-500" />
                </div>

                <h3 className="text-[24px] font-bold text-[#1a1a1a] group-hover:text-white transition-colors duration-500 mb-1">
                  업무능력
                </h3>
                <h4 className="text-[18px] font-medium text-blue-600 group-hover:text-blue-200 transition-colors duration-500 mb-6 flex items-baseline">
                  <span className="text-[24px] font-black">C</span>ompetence
                </h4>

                <p className="text-lg leading-8 text-[#666666] group-hover:text-white transition-colors duration-500 mt-auto">
                  배움을 실천으로 이어가는 힘.<br /> 비판적 사고와 탁월한 문제 해결 능력으로 현장에서 가치를 창출합니다.
                </p>
              </div>
            </div>

            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-in-out z-0" />

              <div className="relative z-10 flex flex-col h-full">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-8 group-hover:bg-white/20 transition-colors duration-500">
                  <Heart className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors duration-500" />
                </div>

                <h3 className="text-[24px] font-bold text-[#1a1a1a] group-hover:text-white transition-colors duration-500 mb-1">
                  성품
                </h3>
                <h4 className="text-[18px] font-medium text-blue-600 group-hover:text-blue-200 transition-colors duration-500 mb-6 flex items-baseline">
                  <span className="text-[24px] font-black">C</span>haracter
                </h4>

                <p className="text-lg leading-8 text-[#666666] group-hover:text-white transition-colors duration-500 mt-auto">
                  생각의 깊이와 마음의 넓이를 기르는 자세.<br /> 타인을 존중하고 공동체와 함께 성장하는 바른 인성을 갖춥니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full bg-[#FFFFFF]">
        <StatsSection />
      </div>

      <div className="w-full bg-[#FFFFFF]">
        <CalendarSection year={year} month={month} />
      </div>
    </div>
  );
}
