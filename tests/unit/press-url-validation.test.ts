/**
 * 언론보도 관리자 액션의 URL 검증 회귀 테스트입니다.
 * 기사 링크와 썸네일 링크 모두 HTTP(S)만 저장되도록 확인합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  from: vi.fn(),
  values: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: mocks.from }),
    insert: () => ({ values: mocks.values }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createPressArticle } from "@/features/press/actions";

function pressForm(url: string, imageUrl = "") {
  const form = new FormData();
  form.set("title", "기사 제목");
  form.set("source", "언론사");
  form.set("url", url);
  form.set("publishedAt", "2026-10-14");
  form.set("imageUrl", imageUrl);
  return form;
}

describe("언론보도 URL 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.from.mockResolvedValue([{ maxOrder: null }]);
  });

  it.each(["data:text/html,test", "mailto:test@example.com", "javascript:alert(1)"])(
    "기사 링크의 비 HTTP(S) 스킴 %s를 거부한다",
    async (url) => {
      const result = await createPressArticle(pressForm(url));
      expect(result.fieldErrors?.url).toBe("올바른 기사 링크를 입력해주세요.");
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it("썸네일 링크의 비 HTTP(S) 스킴을 거부한다", async () => {
    const result = await createPressArticle(pressForm("https://example.com/article", "data:image/png,abc"));
    expect(result.fieldErrors?.imageUrl).toBe("올바른 썸네일 URL을 입력해주세요.");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["http://example.com/article", "https://example.com/article"])(
    "정상 기사 링크 %s를 허용한다",
    async (url) => {
      await createPressArticle(pressForm(url));
      expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ url }));
      expect(mocks.redirect).toHaveBeenCalledWith("/admin/press");
    },
  );
});
