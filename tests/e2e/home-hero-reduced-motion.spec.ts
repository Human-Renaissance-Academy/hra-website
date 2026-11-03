/**
 * 홈 Hero 모션 감소·레이아웃 안정성 E2E
 *
 * 역할:
 * - prefers-reduced-motion: reduce 에서 전체 제목이 즉시(서버 HTML 단계부터, JS 없이도) 보이는지 확인합니다.
 * - 일반 모션에서 타이핑 완료 후 제목 크기가 줄어도 아래 요소(CTA)가 움직이지 않고
 *   layout-shift 합계(CLS)가 거의 0 인지 모바일·태블릿·데스크톱 viewport 에서 확인합니다.
 * - 서버 HTML 의 sr-only 전체 제목이 유지되는지 확인합니다.
 */

import { expect, test } from "../support/expanded-public-test";
import type { Page } from "../support/expanded-public-test";

const visibleTitle = /^정답보다 중요한 것,\s*HRA는 본질을 묻는 법을 배웁니다\.$/;
const srTitle = /정답보다 중요한 것,\s*HRA는 본질을 묻는 법을 배웁니다\./;

/** viewport 별 타이핑 완료 후(최종) 제목 글자 크기. hero-section.tsx 의 크기 클래스와 같아야 한다. */
const viewports = [
  { name: "390", width: 390, height: 844, finalFontSize: "30px" },
  { name: "768", width: 768, height: 1024, finalFontSize: "56px" },
  { name: "1024", width: 1024, height: 768, finalFontSize: "66px" },
  { name: "1280", width: 1280, height: 800, finalFontSize: "66px" },
] as const;

/** layout-shift 항목을 페이지 로드 전부터 누적하는 관측기를 설치한다. */
async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    const holder = window as unknown as { __cls: number };
    holder.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
        if (!entry.hadRecentInput) holder.__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

const readCls = (page: Page) => page.evaluate(() => (window as unknown as { __cls: number }).__cls);

test.describe("[HERO-MOTION] 일반 모션의 레이아웃 안정성", () => {
  test.use({ reducedMotion: "no-preference" });

  for (const viewport of viewports) {
    test(`[PUBLIC:HERO_CLS_${viewport.name}] 타이핑 완료 후에도 CTA 위치가 유지되고 CLS 가 거의 0 이다`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installLayoutShiftObserver(page);
      await page.goto("/");
      // 글꼴 로딩으로 인한 이동은 이 검증 대상이 아니므로 로딩 완료 후 기준 위치를 잡는다.
      await page.evaluate(() => document.fonts.ready);

      const heading = page.getByTestId("hero-heading");
      await expect(heading.locator(".sr-only")).toHaveText(srTitle);
      const cta = page.getByRole("link", { name: "모집안내 보기" });
      await expect(cta).toBeVisible();
      const baseline = (await cta.boundingBox())?.y ?? Number.NaN;
      const baselineHeight = (await heading.boundingBox())?.height ?? Number.NaN;
      const clsBefore = await readCls(page);

      // 타이핑 완료(전체 문구) → 크기 전환 완료(최종 글자 크기) 순서로 상태 기반 대기한다.
      // 타이핑 중 문구 안의 "아직 치지 않은 나머지(.invisible)"가 비면 타이핑이 끝난 것이다.
      const typedPhrase = heading.locator('[aria-hidden="true"]').first();
      await expect(typedPhrase.locator(".invisible")).toHaveText("", { timeout: 15_000 });
      await expect(typedPhrase).toHaveText(visibleTitle);
      const clsAfterTyping = await readCls(page);
      await expect(heading).toHaveCSS("font-size", viewport.finalFontSize, { timeout: 15_000 });

      const finalY = (await cta.boundingBox())?.y ?? Number.NaN;
      const finalHeight = (await heading.boundingBox())?.height ?? Number.NaN;
      const clsTyping = clsAfterTyping - clsBefore;
      const clsTransition = (await readCls(page)) - clsAfterTyping;
      // 측정값을 리포트에 남긴다.
      testInfo.annotations.push({
        type: "측정",
        description: `viewport=${viewport.name} cta-y ${baseline}→${finalY}, h1-height ${baselineHeight}→${finalHeight}, CLS 타이핑 +${clsTyping.toFixed(4)} / 크기 전환 +${clsTransition.toFixed(4)}`,
      });

      expect(Math.abs(finalY - baseline)).toBeLessThan(1);
      expect(Math.abs(finalHeight - baselineHeight)).toBeLessThan(1);
      // 크기 전환은 글자가 상자 안에서 줄어드는 의도된 연출이라 상자·CTA 는 움직이지 않지만 글자 이동이 일부 집계된다.
      // layout-shift 항목은 보고 시점이 늦어 타이핑/전환 구간 배분이 흔들리므로 합계만 Core Web Vitals "좋음"(0.1)보다
      // 엄격한 0.06 으로 제한한다. (측정값 최대 약 0.04 → 부하가 큰 CI 의 변동 여유 0.02)
      expect(clsTyping + clsTransition).toBeLessThan(0.06);
    });
  }
});

test.describe("[HERO-MOTION] 모션 감소 설정", () => {
  test.use({ reducedMotion: "reduce" });

  test("[PUBLIC:HERO_REDUCED] 로드 즉시 전체 제목이 최종 크기로 보이고 CTA 가 움직이지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installLayoutShiftObserver(page);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const heading = page.getByTestId("hero-heading");
    // 타이핑을 기다리지 않고 바로 확인한다. (재시도 대기 외 별도 시간 가정 없음)
    await expect(heading.locator('[aria-hidden="true"]:visible')).toHaveText(visibleTitle);
    await expect(heading).toHaveCSS("font-size", "66px");

    const cta = page.getByRole("link", { name: "모집안내 보기" });
    const first = (await cta.boundingBox())?.y ?? Number.NaN;
    const clsBefore = await readCls(page);
    // 타이핑 연출이 있었다면 끝났을 만큼 충분히 이벤트 루프를 돌려 본 뒤에도 위치가 같아야 한다.
    await expect
      .poll(async () => Math.abs(((await cta.boundingBox())?.y ?? Number.NaN) - first), { timeout: 5_000, intervals: [500, 1000] })
      .toBeLessThan(1);
    expect((await readCls(page)) - clsBefore).toBeLessThan(0.01);
  });
});

test.describe("[HERO-MOTION] 모션 감소 + JavaScript 비활성", () => {
  test.use({ reducedMotion: "reduce", javaScriptEnabled: false });

  test("[PUBLIC:HERO_SSR] 서버 HTML 만으로 전체 제목이 보이고 sr-only 제목이 있다", async ({ page }) => {
    await page.goto("/");
    const heading = page.getByTestId("hero-heading");
    await expect(heading.locator(".sr-only")).toHaveText(srTitle);
    await expect(heading.locator('[aria-hidden="true"]:visible')).toHaveText(visibleTitle);
  });
});
