"use client";

import { ChevronDown, Phone } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type FaqItemData = {
  id: string;
  question: string;
  answer: string;
};

type FaqContentProps = {
  contactText: string;
  items: FaqItemData[];
};

export function FaqContent({ contactText, items }: FaqContentProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  /**
   * 담당자 연락처 툴팁 열림 상태.
   *
   * 기존에는 group-hover 로만 열렸는데, 터치 기기에는 hover 상태가 존재하지 않는다.
   * 그래서 모바일 사용자는 연락처를 아예 확인할 수 없었다.
   * 탭(클릭)으로도 열고 닫을 수 있도록 상태를 별도로 관리한다.
   */
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-12 text-center sm:py-20">
        <h1 className="text-[32px] font-bold leading-tight text-[#1a1a1a] sm:text-[40px]">FAQ</h1>
        <div className="mx-auto mt-3 mb-3 h-1 w-12 bg-[var(--brand)]" />
        <p className="mt-5 text-base leading-relaxed text-[#666666] sm:text-lg">HRA에 대해 궁금한 점을 확인하세요</p>
      </section>

      {/* 담당자 연락처 — 클릭·키보드로 열고 닫을 수 있는 툴팁 */}
      <div className="relative my-8 flex flex-col items-center">
        {/*
          바깥 영역 클릭 시 툴팁 닫기.
          탭으로 연 툴팁은 hover 처럼 저절로 사라지지 않으므로, 열려 있는 동안에만
          투명 오버레이를 깔아 다른 곳을 누르면 닫히게 한다.
          (헤더의 사용자 메뉴와 동일한 패턴)
        */}
        {contactOpen && (
          <div
            className="fixed inset-0 z-0"
            onClick={() => setContactOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="relative flex flex-col items-center">
          {/*
            툴팁 표시 조건
            - 버튼을 클릭하거나 키보드로 활성화하면 나타난다.

            툴팁 폭 처리
            - whitespace-nowrap 은 sm(640px) 이상에서만 적용한다.
              모바일에서 한 줄로 강제하면 연락처 문구가 화면 밖으로 삐져나간다.
            - max-w-[calc(100vw-2rem)] 로 어떤 화면에서도 좌우 여백 안쪽에 머물게 한다.
            - break-keep 은 한글 단어 중간에서 줄바꿈되지 않게 한다.
          */}
          <div
            id="faq-contact-tooltip"
            role="tooltip"
            aria-hidden={!contactOpen}
            className={cn(
              "absolute bottom-full left-1/2 mb-3 -translate-x-1/2 transition-all duration-300 ease-out",
              contactOpen
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0"
            )}
            style={{ zIndex: 10 }}
          >
            <div className="relative w-max max-w-[calc(100vw-2rem)] rounded-xl border border-[#D9D9D9] bg-white px-5 py-3 text-sm break-keep [overflow-wrap:anywhere] text-[#666666] shadow-[var(--shadow-soft)] sm:whitespace-nowrap sm:px-6 sm:py-4">
              {/* 아래를 가리키는 삼각형 화살표 */}
              <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-[#D9D9D9] bg-white" />
              <span className="relative z-10">{contactText}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setContactOpen((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setContactOpen(false);
            }}
            aria-expanded={contactOpen}
            aria-controls="faq-contact-tooltip"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-blue-700"
            aria-label="담당자 연락처"
          >
            <Phone className="h-6 w-6 text-white" />
          </button>
        </div>
        <span className="mt-2 text-sm text-[#666666]">담당자 연락처</span>
      </div>

      <section className="space-y-4">
        {items.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-[#D9D9D9] bg-white px-5 py-2 shadow-[var(--shadow-soft)] sm:px-7"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
                id={`faq-trigger-${index}`}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
              >
                {/* 질문 문구 — 모바일에서는 16px, sm 이상에서 18px. break-keep 으로 한글 단어 중간 줄바꿈 방지 */}
                <span className="text-base font-semibold break-keep sm:break-normal text-[#1a1a1a] sm:text-lg">{item.question}</span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-blue-600 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              {/*
                답변 패널.
                grid-rows-[0fr] 로 접기만 하면 높이만 0 이 될 뿐 DOM 에 그대로 남아,
                스크린리더가 접힌 답변을 읽고 답변 속 링크가 Tab 순서에 들어간다 (#411).
                inert 는 접힌 동안 하위 요소를 접근성 트리·포커스·클릭에서 모두 제외하면서
                grid 높이 전환 애니메이션은 그대로 유지한다.
                role="region" + aria-labelledby 로 열린 답변이 질문과 연결된 영역으로 읽히게 한다.
              */}
              <div
                id={`faq-panel-${index}`}
                role="region"
                aria-labelledby={`faq-trigger-${index}`}
                inert={!isOpen}
                className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-[#D9D9D9] pt-5">
                    <p className="whitespace-pre-line text-base leading-relaxed break-keep sm:break-normal [overflow-wrap:anywhere] text-[#666666] sm:text-lg">{item.answer}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
