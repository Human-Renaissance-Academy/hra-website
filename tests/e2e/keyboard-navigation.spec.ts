/** #128 공개 페이지의 주요 탐색 요소를 키보드로 조작할 수 있는지 검증합니다. */
import { expect, test } from "../support/expanded-public-test";

test("[PUBLIC:KEYBOARD_HEADER] 헤더 하위 메뉴를 Tab과 Enter로 이동한다", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  const intro = header.getByRole("button", { name: "소개" });
  await intro.focus();
  await expect(intro).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(intro).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(intro).toHaveAttribute("aria-expanded", "true");
  // aria 상태와 별도로 전환 중인 하위 링크가 실제 탐색 가능해졌는지 확인한다.
  await expect(header.getByRole("link", { name: "커리큘럼" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(header.locator('a[href="/about"]')).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "커리큘럼" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/curriculum$/);
});

test("[PUBLIC:KEYBOARD_CONTENT] 월별 커리큘럼과 FAQ 연락처를 키보드로 연다", async ({ page }) => {
  await page.goto("/curriculum");
  const month = page.getByRole("button", { name: "10월 커리큘럼 상세 보기" });
  await month.focus();
  await expect(page.getByText("전반기 (9월~12월)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(month).toHaveAttribute("aria-pressed", "false");

  await page.goto("/faq");
  const contact = page.getByRole("button", { name: "담당자 연락처" });
  await contact.focus();
  await page.keyboard.press("Enter");
  await expect(contact).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(contact).toHaveAttribute("aria-expanded", "false");
});

test("[PUBLIC:KEYBOARD_CALENDAR] 달력 버튼에 이름이 있고 홈 제목이 서버 HTML에 포함된다", async ({ page }) => {
  const response = await page.goto("/");
  expect(await response?.text()).toContain("정답보다 중요한 것");
  await expect(page.getByRole("button", { name: "이전 달 보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 달 보기" })).toBeVisible();
});

/** #410 390px 모바일 헤더 메뉴의 확장 상태 노출과 Escape 닫기·포커스 복귀를 검증한다. */
test("[PUBLIC:KEYBOARD_MOBILE_HEADER] 390px 모바일 메뉴가 확장 상태를 노출하고 Escape로 닫힌다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/about");
  const toggle = page.getByRole("button", { name: "메뉴 열기/닫기" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panelId = await toggle.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toBeVisible();

  // 하위 메뉴 버튼도 상태와 제어 대상을 노출한다.
  const intro = panel.getByRole("button", { name: "소개" });
  await expect(intro).toHaveAttribute("aria-expanded", "false");
  await intro.focus();
  await page.keyboard.press("Enter");
  await expect(intro).toHaveAttribute("aria-expanded", "true");
  const subId = await intro.getAttribute("aria-controls");
  await expect(page.locator(`[id="${subId}"]`).getByRole("link", { name: "커리큘럼" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(intro).toHaveAttribute("aria-expanded", "false");

  // Escape 는 메뉴를 닫고 포커스를 토글 버튼으로 돌려준다.
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();

  // 메뉴를 다시 연 뒤 포커스가 헤더 밖으로 나가면 메뉴가 닫힌다.
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.evaluate(() => {
    const outside = document.createElement("button");
    outside.id = "focus-out-probe";
    document.body.appendChild(outside);
    outside.focus();
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

/** #410 767px→768px 경계에서 열린 모바일 메뉴가 닫히고 스크롤 잠금이 풀리는지 검증한다. */
test("[PUBLIC:KEYBOARD_MOBILE_HEADER_768] 768px 이상으로 넓어지면 모바일 메뉴가 닫힌다", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await page.goto("/about");
  const toggle = page.getByRole("button", { name: "메뉴 열기/닫기" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(toggle).toBeHidden();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator("header").getByRole("button", { name: "소개" })).toBeVisible();
});
