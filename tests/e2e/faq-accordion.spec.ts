/**
 * 공개 FAQ 아코디언의 접근성 회귀 테스트입니다 (#411).
 *
 * 답변 패널은 grid-rows-[0fr] 로 시각적으로만 접히므로, inert 가 없으면
 * 접힌 답변이 접근성 트리에 남고 답변 속 링크가 Tab 순서에 들어갑니다.
 * 이 파일은 질문 목록 내용에 의존하지 않고 첫 번째 질문(index 0)만 사용하며,
 * 최소 1개 이상의 FAQ 항목이 등록된 격리 DB(fixture)를 전제로 합니다.
 */
import { expect, test } from "@playwright/test";

const trigger = "#faq-trigger-0";
const panel = "#faq-panel-0";

test.beforeEach(async ({ page }) => {
  await page.goto("/faq");
  await expect(page.locator(trigger)).toBeVisible();
});

test("[PUBLIC:FAQ_COLLAPSED] 접힌 답변은 inert 이며 접근성 트리에서 제외된다", async ({ page }) => {
  const button = page.locator(trigger);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toHaveAttribute("aria-controls", "faq-panel-0");
  await expect(page.locator(panel)).toHaveJSProperty("inert", true);
  // Playwright ariaSnapshot 은 DOM 기반이라 inert 를 반영하지 않으므로,
  // 브라우저가 실제로 계산한 접근성 트리(CDP)에서 패널이 무시(ignored)되는지 확인한다.
  const client = await page.context().newCDPSession(page);
  const { nodes } = await client.send("Accessibility.getFullAXTree");
  const question = (await button.innerText()).trim();
  const exposed = nodes.filter(
    (node) => !node.ignored && node.role?.value === "region" && node.name?.value === question,
  );
  expect(exposed).toHaveLength(0);
});

test("[PUBLIC:FAQ_COLLAPSED] 접힌 답변 속 링크는 Tab 순서에 들어가지 않는다", async ({ page }) => {
  // 하이드레이션이 끝나야 심은 링크가 재렌더로 사라지지 않으므로, 한 번 열고 닫아 상호작용 가능 상태를 확인한다.
  const button = page.locator(trigger);
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // 운영 데이터에 링크가 없을 수 있으므로 접힌 패널 안에 링크를 직접 심어 포커스 가능 여부를 확인한다.
  await page.evaluate((selector) => {
    const link = document.createElement("a");
    link.href = "/login";
    link.textContent = "회귀 확인용 링크";
    link.id = "faq-probe-link";
    document.querySelector(`${selector} .border-t`)?.appendChild(link);
  }, panel);

  await button.focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#faq-probe-link")).not.toBeFocused();

  // 열면 같은 링크가 Tab 으로 도달 가능해진다.
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator("#faq-probe-link")).toBeFocused();
});

test("[PUBLIC:FAQ_OPEN] 열린 답변은 질문과 연결된 영역으로 노출되고 다시 닫힌다", async ({ page }) => {
  const button = page.locator(trigger);
  await button.focus();
  await page.keyboard.press("Enter");

  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(panel)).toHaveJSProperty("inert", false);
  const region = page.getByRole("region", { name: (await button.innerText()).trim() });
  await expect(region).toHaveCount(1);
  await expect(region).toHaveAttribute("id", "faq-panel-0");

  await page.keyboard.press("Space");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(panel)).toHaveJSProperty("inert", true);
});

test("[PUBLIC:FAQ_CONTACT] 연락처 툴팁은 클릭으로 열고 Escape 로 닫는다", async ({ page }) => {
  const contact = page.getByRole("button", { name: "담당자 연락처" });
  await contact.click();
  await expect(contact).toHaveAttribute("aria-expanded", "true");
  await contact.press("Escape");
  await expect(contact).toHaveAttribute("aria-expanded", "false");
});
