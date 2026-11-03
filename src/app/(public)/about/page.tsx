import type { Metadata } from "next";
import Image from "next/image";
import { BenefitsSection } from "./_components/benefits-section";

export const metadata: Metadata = {
  title: "소개",
  description: "HRA(Human Renaissance Academy)의 비전, 목표, 그리고 인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램을 소개합니다.",
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/about" },
};

/**
 * "수업 운영 방식" 섹션에 표시할 항목 목록.
 *
 * 기존에는 JSX 안에 <tr> 을 직접 4번 반복해서 적었지만,
 * 반응형 레이아웃(모바일 세로 스택 / 데스크톱 2단)을 한 곳에서 관리하기 위해
 * 데이터를 배열로 분리하고 마크업은 map 으로 한 번만 작성한다.
 *
 * highlight: 수업료 "무료" 처럼 브랜드 색으로 강조할 항목에 true 를 준다.
 */
const CLASS_OPERATION_ROWS: { label: string; value: string; highlight?: boolean }[] = [
  {
    label: "교육 기간",
    value: "52주 (매년 9월~다음 해 8월까지 교실수업 40주, 합숙 캠프 7박 8일 포함)",
  },
  { label: "교육 일시", value: "매주 토요일 09:00~18:00" },
  { label: "교육 장소", value: "제주대학교" },
  { label: "수업료", value: "무료", highlight: true },
];

// HRA 소개 페이지
// 프로젝트의 전체적인 비전과 핵심 가치를 소개합니다.
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      {/* 1. 타이틀 섹션 */}
      <section className="mb-16">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a1a1a]">HRA 소개</h1>
        </div>
        <p className="text-[#666666] text-base md:text-lg max-w-2xl">
          정답보다 중요한 것, HRA는 본질을 묻는 법을 배웁니다.
        </p>
      </section>

      {/* 2. 소개 섹션 (2단 레이아웃) */}
      <section className="mb-16 sm:mb-24 md:mb-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* 기존 자리표시 문구 대신 저장소의 실제 HRA 단체 사진을 표시합니다. */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-[var(--shadow-soft)]">
            <Image
              src="/images/cohort-17.jpeg"
              alt="HRA 17기 구성원 단체 사진"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          {/* 오른쪽: 텍스트 설명 */}
          <div className="space-y-6">
            <p className="text-base sm:text-lg md:text-xl text-[#666666] leading-relaxed font-medium whitespace-pre-line">
              {`사회에 나가기 전, 무엇이 필요할까요?

              HRA는 고전 읽기, 토론, 케이스 스터디, 겨울 합숙을
              통해 생각하고 성찰하고 실천하는 힘을 기릅니다.

              1년의 과정이 끝날 때,
              취업할 준비가 된 사람이 아니라
              스스로 삶을 이끄는 사람이 됩니다.`}
            </p>
          </div>
        </div>
      </section>

      {/* 3. 주요 목적 및 비전 섹션 */}
      <section className="mb-16 sm:mb-24 md:mb-32">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-8">주요 목적 및 비전</h2>
          <p className="text-[#666666] text-base sm:text-lg leading-relaxed break-keep sm:break-normal max-w-2xl mx-auto">
            HRA는 단순한 지식 전달을 넘어, <br className="hidden sm:inline" />
            업무능력과 성품, 사명감을 고루 갖춘 3C 인재를 양성합니다.<br className="hidden sm:inline" />
            비영리 기반으로 수익이 아닌 청년의 성장을 중심에 두며, <br className="hidden sm:inline" />
            사고력과 표현력, 실천력을 기르는 학습자 주도형 교육을 지향합니다.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-blue-50 dark:bg-blue-950/20 rounded-2xl p-6 sm:p-8 md:p-12">
          {/*
            mobile  : flex-col + items-center  → 수직 스택, 각 항목을 수평 중앙 정렬
            desktop : md:flex-row + md:items-start → 수평 배치, 모든 항목을 상단 기준 정렬

            핵심: md:items-start 사용 이유
              items-center 는 각 flex 항목의 수직 중앙을 맞춤.
              wrapper(원+텍스트) 높이가 서로 다르면(텍스트 줄수 차이) 중앙이 어긋나
              결과적으로 원(circle) 위치가 달라진다.
              items-start 는 wrapper 상단을 동일 y=0 기준에 맞추므로
              두 원의 center y 가 모두 y=48px(원 높이 96px의 절반)으로 정확히 일치한다.
          */}
          <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-0 md:justify-center">

            {/* 목적 원형 + 설명 */}
            <div className="flex flex-col items-center text-center w-full max-w-[280px] md:w-64">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6">
                <span className="text-xl font-bold text-[#1a1a1a]">목적</span>
              </div>
              <p className="text-[#666666] leading-relaxed">
                AI 활용 능력과 인간 중심 가치를<br className="hidden sm:inline" />
                겸비한 차세대 리더를 육성한다.
              </p>
            </div>

            {/*
              연결선 — flex item 으로 배치 (absolute 위치 제거)
              mobile : 세로선 (w-[1px] h-12)
              desktop: 가로선 (w-16 lg:w-24 h-[1px])
                self-start : items-start 와 동일, 상단 기준
                mt-12(48px): 원 높이 h-24(96px) ÷ 2 = 원 center y 와 정확히 일치
            */}
            <div aria-hidden="true" className="w-[1px] h-12 bg-blue-200 flex-none md:hidden" />
            <div aria-hidden="true" className="hidden md:block w-16 lg:w-24 flex-none h-[1px] bg-blue-200 self-start mt-12" />

            {/* 미션 원형 + 설명 */}
            <div className="flex flex-col items-center text-center w-full max-w-[280px] md:w-64">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6">
                <span className="text-xl font-bold text-[#1a1a1a]">미션</span>
              </div>
              <p className="text-[#666666] leading-relaxed">
                매주 고전 읽기와 케이스 스터디로<br className="hidden sm:inline" />
                청년의 사고력·실무력·인성을<br className="hidden sm:inline" />
                1년간 체계적으로 성장시킨다.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 4. 핵심 가치 (3C) 섹션 */}
      <section className="mb-16 sm:mb-24 md:mb-32">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1a1a1a]">핵심가치: 3C 인재상</h2>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card 1: 사명감 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute bottom-0 right-4 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-6 sm:p-8 md:p-10 rounded-2xl">
              <div className="flex items-baseline gap-3 mb-6">
                <h3 className="text-2xl font-bold text-[#1a1a1a]">사명감</h3>
                <p className="text-xl font-medium text-[#2563EB]">Commitment</p>
              </div>
              <p className="text-[#666666] leading-relaxed">
                사명감은 맡은 일을 끝까지 해내는 책임감에서 시작해, 나아가 공동체와 사회를 향한 의식으로 확장됩니다. HRA는 배움을 삶 속에서 실천하는 사람을 길러 내고자 합니다.
              </p>
            </div>
          </div>

          {/* Card 2: 업무능력 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute bottom-0 right-4 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-6 sm:p-8 md:p-10 rounded-2xl">
              <div className="flex items-baseline gap-3 mb-6">
                <h3 className="text-2xl font-bold text-[#1a1a1a]">업무능력</h3>
                <p className="text-xl font-medium text-[#2563EB]">Competence</p>
              </div>
              <p className="text-[#666666] leading-relaxed">
                단순히 지식을 많이 아는 것이 아니라, 배운 내용을 실제 문제 해결과 실행으로 연결할 수 있는 힘입니다. 스스로 생각하고 판단하며 끝까지 해내는 능력을 기릅니다.
              </p>
            </div>
          </div>

          {/* Card 3: 성품 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute bottom-0 right-4 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-6 sm:p-8 md:p-10 rounded-2xl">
              <div className="flex items-baseline gap-3 mb-6">
                <h3 className="text-2xl font-bold text-[#1a1a1a]">성품</h3>
                <p className="text-xl font-medium text-[#2563EB]">Character</p>
              </div>
              <p className="text-[#666666] leading-relaxed">
                성품은 지식이나 성과만으로 드러나지 않습니다. HRA는 사람을 이해하는 마음, 함께 배우고 협력하는 자세, 그리고 바른 가치관 위에 서는 태도를 중요하게 여깁니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 수업 운영 방식 섹션 */}
      <section className="mb-16 sm:mb-24 md:mb-32">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-8 text-center">수업 운영 방식</h2>
        <div className="max-w-4xl mx-auto">
          {/*
            표(table) → 정의 목록(dl) 로 교체한 이유

            기존에는 <table> 의 2단 구조(항목 칸 1/3 + 값 칸 오른쪽 정렬)를 모바일에서도 그대로 썼다.
            390px 화면에서는 값 칸에 실제로 남는 폭이 약 180px 뿐이라
            "52주 (매년 9월~다음 해 8월까지 교실수업 40주, 합숙 캠프 7박 8일 포함)" 같은 긴 문장이
            6~7줄로 쪼개지면서 표가 무너져 보였다.

            그래서 dl + grid 로 바꾸고 화면 크기에 따라 분기한다.
            - 모바일: 1단 세로 스택 (항목 위, 값 아래 / 둘 다 왼쪽 정렬)
            - sm 이상: 기존과 동일한 2단 좌우 배치 (항목 왼쪽, 값 오른쪽 정렬)
            데스크톱에서 보이는 모양은 기존과 동일하다.
          */}
          <dl className="divide-y divide-[#D9D9D9] border-t border-[#D9D9D9]">
            {CLASS_OPERATION_ROWS.map((row) => (
              <div
                key={row.label}
                className="grid gap-1 bg-white px-1 py-5 sm:grid-cols-[1fr_2fr] sm:items-baseline sm:gap-4 sm:px-4 sm:py-6 md:px-6"
              >
                <dt className="text-sm font-medium text-[#666666] sm:text-base">{row.label}</dt>
                <dd
                  className={`text-base leading-relaxed break-keep sm:break-normal sm:text-right ${
                    row.highlight ? "font-bold text-[#2563EB]" : "text-[#1a1a1a]"
                  }`}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 6. 수료 후 혜택 섹션 */}
      <section>
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-8 text-center">수료 후 혜택</h2>
        <BenefitsSection />
      </section>
    </div>
  );
}
