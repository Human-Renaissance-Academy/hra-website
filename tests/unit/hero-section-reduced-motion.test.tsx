/**
 * 홈 Hero 타이핑 애니메이션의 모션 감소(prefers-reduced-motion) 동작 테스트
 *
 * 검증 범위:
 * - 모션 감소: JS 타이핑 타이머(setInterval)를 만들지 않는다.
 *   (무엇을 보여줄지는 CSS motion-reduce: 변형이 결정하며, jsdom 은 CSS 를 적용하지 않으므로
 *    여기서는 모션 감소용 전체 문구 요소와 클래스가 서버 HTML 단계부터 존재하는지만 확인한다.)
 * - 일반 모션: 타이핑이 점진적으로 진행되고 완료 후 전체 제목이 된다.
 * - 설정 변경: 타이핑 도중 모션 감소로 바뀌면 타이머를 정리한다.
 * - 언마운트: 타이머와 미디어 쿼리 리스너를 정리한다.
 * - 서버 HTML → hydrateRoot 경로: 하이드레이션 경고 없이 모션 감소 시 타이머를 만들지 않는다.
 * - sr-only 전체 제목과 aria-hidden 시각 제목의 구분을 유지한다.
 */

import { act } from "react";
import { renderToString } from "react-dom/server";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroSection } from "@/app/(public)/_components/hero-section";

// React 19 act 환경 표식
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fullTitle = "정답보다 중요한 것,\nHRA는 본질을 묻는 법을 배웁니다.";
// 시각 제목은 <br> 로 줄을 나누므로 textContent 에 줄바꿈이 남지 않는다. 줄바꿈을 제거한 값으로 비교한다.
const visibleTitle = fullTitle.replace("\n", "");

/** matchMedia 목업 — change 이벤트를 수동으로 발생시킬 수 있다. */
function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.delete(fn),
  }));
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

describe("HeroSection 모션 감소", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mounted: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mounted = true;
  });

  afterEach(() => {
    if (mounted) act(() => root.unmount());
    container.remove();
    // setInterval 스파이 등 테스트가 만든 목업을 복원한다.
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** 타이핑으로 실제 보이는 문구(일반 모션용 첫 번째 aria-hidden 요소에서 보이지 않는 나머지를 뺀 부분) */
  const typedText = () => {
    const phrase = container.querySelector('h1 [aria-hidden="true"]');
    const hidden = phrase?.querySelector(".invisible")?.textContent ?? "";
    return (phrase?.textContent ?? "").slice(0, (phrase?.textContent ?? "").length - hidden.length);
  };

  it("모션 감소면 타이핑 타이머를 만들지 않고 전체 문구 요소를 모션 감소용으로 제공한다", () => {
    mockMatchMedia(true);
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    act(() => root.render(<HeroSection />));
    // 타이핑용 setInterval 이 한 번도 만들어지지 않아야 한다.
    expect(intervalSpy).not.toHaveBeenCalled();
    // 모션 감소에서만 보이는 전체 문구 요소가 항상 DOM 에 있다.
    const reducedVisible = container.querySelector('h1 [aria-hidden="true"].motion-reduce\\:block');
    expect(reducedVisible?.textContent).toBe(visibleTitle);
    expect(container.querySelector("h1 .sr-only")?.textContent).toBe(fullTitle);
  });

  it("일반 모션이면 점진적으로 타이핑한 뒤 전체 제목이 된다", () => {
    mockMatchMedia(false);
    act(() => root.render(<HeroSection />));
    expect(typedText().length).toBeLessThan(visibleTitle.length);
    act(() => {
      vi.advanceTimersByTime(70 * (fullTitle.length + 3));
    });
    expect(typedText()).toBe(visibleTitle);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector("h1 .sr-only")?.textContent).toBe(fullTitle);
  });

  it("타이핑 도중 모션 감소로 바뀌면 타이머를 정리한다", () => {
    const media = mockMatchMedia(false);
    act(() => root.render(<HeroSection />));
    act(() => {
      vi.advanceTimersByTime(70 * 3);
    });
    expect(typedText()).not.toBe(visibleTitle);
    act(() => media.set(true));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("언마운트하면 타이머와 미디어 쿼리 리스너를 정리한다", () => {
    const media = mockMatchMedia(false);
    act(() => root.render(<HeroSection />));
    // 렌더 직후 타이머가 1개 이상 대기 중이어야 하고, 언마운트하면 모두 정리되어야 한다.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(media.listenerCount()).toBe(1);
    act(() => root.unmount());
    mounted = false;
    expect(vi.getTimerCount()).toBe(0);
    expect(media.listenerCount()).toBe(0);
  });

  it("서버 HTML 을 hydrateRoot 로 이어받아도 경고가 없고 모션 감소면 타이머를 만들지 않는다", () => {
    mockMatchMedia(true);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    // beforeEach 의 root 는 쓰지 않으므로 먼저 정리한다. (unmount 는 컨테이너를 비운다.)
    act(() => root.unmount());
    // 서버 렌더 결과에 sr-only 전체 제목이 이미 들어 있어야 한다.
    container.innerHTML = renderToString(<HeroSection />);
    expect(container.querySelector("h1 .sr-only")?.textContent).toBe(fullTitle);
    act(() => {
      root = hydrateRoot(container, <HeroSection />);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(intervalSpy).not.toHaveBeenCalled();
  });
});
