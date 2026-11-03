/**
 * 홈 Hero 모션 감소 E2E
 *
 * 역할:
 * - prefers-reduced-motion: reduce 에서 전체 제목이 즉시 표시되는지 확인합니다.
 * - 일반 모션(모바일 viewport 포함)에서 서버 HTML 의 sr-only 전체 제목이 유지되고
 *   타이핑 완료 후 제목 아래 요소가 세로로 밀리지 않는지(CLS 완화) 확인합니다.
 */

import { expect, test } from "../support/expanded-public-test";

const fullTitle = "정답보다 중요한 것,\nHRA는 본질을 묻는 법을 배웁니다.";
// 시각 제목은 <br> 로 줄을 나누므로 textContent 에는 줄바꿈 공백이 없다.
const visibleTitle = /^정답보다 중요한 것,\s*HRA는 본질을 묻는 법을 배웁니다\.$/;

test("[PUBLIC:HOME] 모션 감소 설정에서는 전체 제목이 즉시 표시된다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const visible = page.locator('[data-testid="hero-heading"] [aria-hidden="true"]');
  // 타이핑이 끝나기(약 3초) 전에 이미 전체 문구가 있어야 한다.
  await expect(visible).toHaveText(visibleTitle, { timeout: 1000 });
});

test("[PUBLIC:HOME] 일반 모션에서 sr-only 전체 제목이 유지되고 모바일에서도 레이아웃이 밀리지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator('[data-testid="hero-heading"] .sr-only')).toHaveText(fullTitle);

  const cta = page.getByRole("link", { name: "모집안내 보기" });
  await expect(page.locator('[data-testid="hero-heading"] [aria-hidden="true"]')).toHaveText(visibleTitle, { timeout: 8000 });
  const before = (await cta.boundingBox())?.y ?? 0;
  // 크기 전환 transition(1초) 이후에도 CTA 위치가 유지되어야 한다.
  await page.waitForTimeout(1500);
  const after = (await cta.boundingBox())?.y ?? 0;
  expect(Math.abs(after - before)).toBeLessThan(2);
});
