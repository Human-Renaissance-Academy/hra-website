/**
 * 홈페이지 첫 화면의 히어로 섹션을 담당하는 클라이언트 컴포넌트입니다.
 * 타이핑 애니메이션과 완료 시점에 따른 제목 크기 전환처럼 브라우저 상태가 필요한 표현만 이 파일에서 처리합니다.
 */

"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";

const fullHeadingText = "정답보다 중요한 것,\nHRA는 본질을 묻는 법을 배웁니다.";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

// 제목 크기 클래스. Tailwind 가 정적으로 찾을 수 있도록 전체 문자열로 적는다.
// 모션 감소: 처음부터 최종 크기 / 일반 모션: 타이핑 중 큰 크기 → 완료 후 최종 크기
const reducedSizeClasses = "motion-reduce:text-[30px] motion-reduce:sm:text-[42px] motion-reduce:md:text-[56px] motion-reduce:lg:text-[66px]";
const safeTypingSizeClasses = "motion-safe:text-[30px] motion-safe:sm:text-[42px] motion-safe:md:text-[66px] motion-safe:lg:text-[80px]";
const safeFinalSizeClasses = "motion-safe:text-[30px] motion-safe:sm:text-[42px] motion-safe:md:text-[56px] motion-safe:lg:text-[66px]";

/** 모션 감소 설정 변경을 구독한다. 구독 해제 함수를 돌려주어 언마운트 시 리스너가 정리된다. */
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function HeroSection() {
  const [typedHeading, setTypedHeading] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  // OS 의 "동작 줄이기" 설정 여부. 서버 스냅샷은 false 이며,
  // 서버 HTML 에는 sr-only 전체 제목이 이미 있으므로 접근성에는 영향이 없다.
  // 사용 중 설정이 바뀌면 자동으로 다시 렌더링된다.
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );

  // 모션 감소 시 "무엇을 보여줄지"는 CSS(motion-reduce: 변형)가 서버 HTML 단계부터 결정한다.
  // 여기서는 JS 타이머만 막는다. (하이드레이션 이후 레이아웃 이동 방지)

  // 일반 모션일 때만 타이핑 연출을 실행한다.
  // 설정이 바뀌거나 언마운트되면 cleanup 에서 타이머를 정리하고 상태를 초기화한다.
  useEffect(() => {
    // 하이드레이션 첫 렌더는 서버 스냅샷(false)을 쓰므로, 실제 설정을 직접 한 번 더 확인해
    // 모션 감소 사용자에게 타이머가 잠깐이라도 생기지 않게 한다.
    if (reduceMotion || window.matchMedia(reducedMotionQuery).matches) return;

    let currentIndex = 0;
    const intervalId = setInterval(() => {
      if (currentIndex <= fullHeadingText.length) {
        setTypedHeading(fullHeadingText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(intervalId);
        setIsTypingComplete(true);
      }
    }, 70);

    return () => {
      clearInterval(intervalId);
      setTypedHeading("");
      setIsTypingComplete(false);
    };
  }, [reduceMotion]);

  // 주어진 문구를 줄바꿈과 "본질" 강조 색상까지 적용해 그린다.
  const renderHeading = (text: string) => {
    const parts = text.split("\n");

    return (
      <>
        {parts[0]}
        {parts.length > 1 && (
          <>
            <br />
            {parts[1].split("본질").map((chunk, index, array) => (
              <Fragment key={`chunk-${index}-${chunk}`}>
                {chunk}
                {index < array.length - 1 && (
                  // 다크 오버레이 위에서 색상만으로 강조.
                  // 주변 텍스트가 흰색이 되므로 blue-400(#60a5fa)으로 상향.
                  // blue-600(#2563EB)은 흰색 대비 밝기 차이가 작아 hue 포인트가 약해짐.
                  // blue-400은 채도가 충분해 흰 텍스트 사이에서 hue 차이로 시선을 분리하면서
                  // 다크 오버레이 위에서도 선명하게 유지됨 (WCAG AA ✓).
                  <span className="text-blue-400">본질</span>
                )}
              </Fragment>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    // min-h-[90svh] (모바일) / min-h-[90vh] (md 이상)
    //   모바일 브라우저는 스크롤에 따라 주소창이 접혔다 펴지면서 1vh 의 실제 높이가 계속 바뀐다.
    //   그 결과 90vh 로 잡으면 히어로 높이가 스크롤 도중 출렁인다.
    //   svh(small viewport height) 는 "주소창이 펼쳐진 상태" 기준으로 고정되므로 흔들림이 없다.
    //   데스크톱은 주소창 변화가 없으므로 기존 vh 를 그대로 유지한다.
    <section className="relative flex flex-col items-center justify-center min-h-[90svh] md:min-h-[90vh] px-4 overflow-hidden text-center bg-gray-900">
      <Image src="/images/hero-bg.jpeg" alt="HRA 수업 현장" fill className="object-cover z-0" priority />
      <div className="absolute inset-0 z-0 bg-black/60" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl gap-6 w-full mx-auto">
        <h2 className="text-sm font-semibold tracking-widest text-white/80 uppercase">
          HUMAN RENAISSANCE ACADEMY
        </h2>

        {/*
          제목 크기 — 모바일 기준값을 42px → 30px 으로 낮췄다.
          "HRA는 본질을 묻는 법을 배웁니다." 는 18자이고, 42px 한글은 글자당 약 42px 을 차지한다.
          390px 폭(iPhone 기준, 좌우 px-4 제외 시 358px)에서는 한 줄에 8자 남짓만 들어가
          제목 한 문장이 3줄로 쪼개지고 화면 대부분을 제목이 차지해 버린다.
          30px 로 낮추면 한 줄에 11자가 들어가 2줄로 정리된다.
        */}
        {/*
          CLS 완화 — 타이핑 중에는 큰 글자로 시작해 완료 시 작아지므로 그대로 두면 아래 문단/버튼이 위로 밀린다.
          줄 수를 계산하는 대신, 같은 grid 칸([grid-area:1/1])에 "전체 제목을 큰 크기로 그린 보이지 않는 복사본"을 겹쳐
          h1 상자가 실제 최대 높이(줄바꿈 포함)를 항상 차지하게 한다. 복사본은 글꼴 굵기·자간도 직접 지정한다
          (tracking 은 em 값이 h1 에서 px 로 계산되어 상속되므로 큰 크기에 맞게 다시 지정해야 한다).

          모션 감소 — 서버 HTML 부터 올바르게 보이도록 JS 가 아니라 CSS(motion-reduce:)로 처리한다.
          전체 제목을 처음부터 최종 크기로 표시하고, 타이핑 문구와 크기 예약 복사본은 숨긴다.
          (크기 클래스는 motion-safe / motion-reduce 가 서로 배타적이라 우선순위 충돌이 없다.)
        */}
        <h1
          data-testid="hero-heading"
          className={`grid font-extrabold tracking-tight text-white whitespace-pre-line leading-[1.15] sm:leading-[1.1]
            motion-safe:transition-all motion-safe:duration-1000
            ${reducedSizeClasses}
            ${isTypingComplete ? safeFinalSizeClasses : safeTypingSizeClasses}
          `}
        >
          {/* 서버 HTML과 스크린 리더에는 제목 전체를 제공하고, 아래 세 시각 표현은 모두 aria-hidden 입니다. */}
          <span className="sr-only">{fullHeadingText}</span>
          {/* 일반 모션: 타이핑 중인 문구 */}
          <span aria-hidden="true" className="[grid-area:1/1] motion-reduce:hidden">{renderHeading(typedHeading)}
            {/* 아직 치지 않은 나머지는 보이지 않게 두어, 가운데 정렬된 줄이 글자마다 좌우로 흔들리는(layout shift) 것을 막는다. */}
            <span className="invisible">{renderHeading(fullHeadingText.slice(typedHeading.length))}</span>
          </span>
          {/* 모션 감소: 전체 문구를 즉시 표시 */}
          <span aria-hidden="true" className="[grid-area:1/1] hidden motion-reduce:block">{renderHeading(fullHeadingText)}</span>
          {/* 일반 모션: 가장 큰 크기의 전체 문구로 높이만 예약(보이지 않음) */}
          <span aria-hidden="true" className={`[grid-area:1/1] invisible font-extrabold tracking-tight motion-reduce:hidden ${safeTypingSizeClasses}`}>
            {renderHeading(fullHeadingText)}
          </span>
        </h1>

        {/*
          whitespace-nowrap 을 sm(640px) → lg(1024px) 으로 늦췄다.
          이 문장은 18px 기준 실제 너비가 약 700px 이라, 640~1023px 구간에서 nowrap 을 걸면
          부모 section 의 overflow-hidden 에 걸려 문장 양끝이 잘려 보였다.
          한 줄로 붙이는 연출은 실제로 한 줄이 들어가는 lg 이상에서만 적용한다.
        */}
        <p className="max-w-4xl text-[16px] sm:text-[18px] text-white/75 font-light tracking-wide leading-relaxed mt-4 lg:whitespace-nowrap">
          고전 읽기와 토론, 케이스 스터디를 통해 사고력과 실천력을 기르는 1년 과정입니다.
        </p>

        <Link href="/recruitment" className="inline-flex items-center rounded-full bg-[#2563EB] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 mt-6">
          모집안내 보기
        </Link>
      </div>
    </section>
  );
}
