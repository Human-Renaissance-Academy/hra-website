/**
 * 홈 Hero 타이핑 애니메이션의 모션 감소(prefers-reduced-motion) 동작 테스트
 *
 * 검증 범위:
 * - 모션 감소: 타이머 없이 전체 제목을 즉시 표시한다.
 * - 일반 모션: 타이핑이 점진적으로 진행되고 완료 후 전체 제목이 된다.
 * - 설정 변경: 타이핑 도중 모션 감소로 바뀌면 즉시 전체 제목을 표시하고 타이머를 정리한다.
 * - 언마운트: 타이머와 미디어 쿼리 리스너를 정리한다.
 * - sr-only 전체 제목과 aria-hidden 시각 제목의 구분을 유지한다.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
    vi.useRealTimers();
  });

  const visibleText = () => container.querySelector('h1 [aria-hidden="true"]')?.textContent ?? "";

  it("모션 감소면 타이머 없이 전체 제목을 즉시 표시한다", () => {
    mockMatchMedia(true);
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    act(() => root.render(<HeroSection />));
    expect(visibleText()).toBe(visibleTitle);
    // 타이핑용 setInterval 이 한 번도 만들어지지 않아야 한다.
    expect(intervalSpy).not.toHaveBeenCalled();
    expect(container.querySelector("h1 .sr-only")?.textContent).toBe(fullTitle);
  });

  it("일반 모션이면 점진적으로 타이핑한 뒤 전체 제목이 된다", () => {
    mockMatchMedia(false);
    act(() => root.render(<HeroSection />));
    expect(visibleText().length).toBeLessThan(visibleTitle.length);
    act(() => {
      vi.advanceTimersByTime(70 * (fullTitle.length + 3));
    });
    expect(visibleText()).toBe(visibleTitle);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector("h1 .sr-only")?.textContent).toBe(fullTitle);
  });

  it("타이핑 도중 모션 감소로 바뀌면 즉시 전체 제목을 표시하고 타이머를 정리한다", () => {
    const media = mockMatchMedia(false);
    act(() => root.render(<HeroSection />));
    act(() => {
      vi.advanceTimersByTime(70 * 3);
    });
    expect(visibleText()).not.toBe(visibleTitle);
    act(() => media.set(true));
    expect(visibleText()).toBe(visibleTitle);
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
});
