/**
 * #271 모집안내 Page의 상태·지원 링크·포스터·빈 기수 동작을 DB 경계 이동 전에 고정합니다.
 * 합성 설정/기수 행으로 실제 Page를 렌더링하며 관리자 기능이나 운영 DB는 호출하지 않습니다.
 * #412 접수 채널 영역은 공개 양식 목록 Service를 합성 값으로 대체해 채널 조합을 검증합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  markdown: vi.fn(),
  images: [] as { src: string; alt: string }[],
  setting: null as Record<string, unknown> | null,
  cohort: null as { id: string; name: string; description: string | null } | null,
  calls: 0,
  forms: [] as { id: string; title: string; description: string | null }[],
}));

vi.mock("@/features/applications/public-list/service", () => ({
  listPublishedApplicationForms: () => Promise.resolve(mocks.forms),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/components/markdown/markdown-viewer", () => ({
  MarkdownViewer: ({ body }: { body: string }) => {
    mocks.markdown(body);
    return <span>{body}</span>;
  },
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    mocks.images.push({ src, alt });
    return <span>합성 포스터 이미지</span>;
  },
}));
vi.mock("@/app/(public)/recruitment/_components/process-steps", () => ({
  ProcessSteps: () => <span>지원 절차</span>,
}));

import RecruitmentPage, { dynamic, metadata } from "@/app/(public)/recruitment/page";

const cohort = { id: "11111111-1111-4111-8111-111111111111", name: "합성 20기", description: "합성 기수 소개" };
const openSettings = {
  activeCohortId: cohort.id,
  recruitmentStartDate: new Date("2026-10-16T00:00:00Z"),
  deadlineDate: new Date("2026-10-30T00:00:00Z"),
  googleFormUrl: "https://forms.example.invalid/apply",
  posterImageUrl: "https://images.example.invalid/poster.jpg",
  posterLayout: "right",
  detailsMarkdown: "# 합성 모집 안내",
  recruitmentStatus: "CLOSED",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
  mocks.images.length = 0;
  mocks.calls = 0;
  mocks.setting = null;
  mocks.cohort = null;
  mocks.forms = [];
  mocks.select.mockImplementation(() => {
    const index = mocks.calls++;
    const rows = () => index === 0
      ? (mocks.setting ? [mocks.setting] : [])
      : (mocks.cohort ? [mocks.cohort] : []);
    return { from: () => ({
      limit: () => Promise.resolve(rows()),
      where: () => ({ limit: () => Promise.resolve(rows()) }),
    }) };
  });
});

afterEach(() => vi.useRealTimers());

it("설정이 없으면 공개 메타데이터와 빈 모집 배너·빈 접수 채널을 표시한다", async () => {
  expect(dynamic).toBe("force-dynamic");
  expect(metadata.title).toBe("모집안내");
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("현재 안내 중인 모집 기수가 없습니다.");
  expect(html).toContain("지원 절차");
  expect(html).toContain('id="apply-channels"');
  expect(html).toContain("현재 접수 중인 지원서가 없습니다.");
  expect(html).not.toContain("작성하기");
  expect(mocks.select).toHaveBeenCalledTimes(1);
});

it("모집 상태는 저장된 상태가 아닌 KST 날짜로 계산하고 외부 지원 링크를 표시한다", async () => {
  mocks.setting = openSettings;
  mocks.cohort = cohort;
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("합성 20기");
  expect(html).toContain("합성 기수 소개");
  expect(html).toContain("접수 중");
  expect(html).toContain('href="https://forms.example.invalid/apply"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("외부 지원서(구글폼) 채널로 접수하고 있습니다.");
  expect(html).not.toContain('href="/recruitment/apply"');
  expect(html).toMatch(/2026.*10.*16/);
  expect(html).toMatch(/2026.*10.*30/);
  expect(mocks.select).toHaveBeenCalledTimes(2);
  expect(mocks.markdown).toHaveBeenCalledExactlyOnceWith("# 합성 모집 안내");
  expect(mocks.images).toEqual([{ src: openSettings.posterImageUrl, alt: "모집 포스터" }]);
});

it("마감일이 지나면 저장된 URL이 있어도 지원 링크를 숨긴다", async () => {
  mocks.setting = openSettings;
  mocks.cohort = cohort;
  vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("마감");
  expect(html).not.toContain("forms.example.invalid");
  expect(html).toContain("현재 접수 중인 지원서가 없습니다.");
});

it("마감 후에도 공개된 홈페이지 지원서는 날짜와 무관하게 안내한다", async () => {
  mocks.setting = openSettings;
  mocks.cohort = cohort;
  mocks.forms = [{ id: "f1", title: "합성 추가모집 양식", description: null }];
  vi.setSystemTime(new Date("2026-10-31T00:00:00Z"));
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("현재 홈페이지 지원서로 접수하고 있습니다.");
  expect(html).toContain('href="/recruitment/apply"');
  expect(html).not.toContain("forms.example.invalid");
});

it("내부 양식과 외부 구글폼이 함께 열리면 두 이동 경로를 모두 표시한다", async () => {
  mocks.setting = openSettings;
  mocks.cohort = cohort;
  mocks.forms = [{ id: "f1", title: "합성 양식", description: null }];
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("두 채널로 함께 접수하고 있습니다.");
  expect(html).toContain('href="/recruitment/apply"');
  expect(html).toContain('href="https://forms.example.invalid/apply"');
});

it("활성 기수가 없어도 모집중이고 URL이 있으면 전역 설정의 외부 지원서 링크를 표시한다", async () => {
  // 고아(삭제된) 활성 기수 ID: 기수 조회 결과가 비어 배너는 빈 상태가 됩니다.
  mocks.setting = openSettings;
  const orphan = renderToStaticMarkup(await RecruitmentPage());
  expect(orphan).toContain("현재 안내 중인 모집 기수가 없습니다.");
  expect(orphan).toContain('href="https://forms.example.invalid/apply"');
  // 기수 미지정 설정에서도 같은 규칙을 따릅니다.
  mocks.calls = 0;
  mocks.setting = { ...openSettings, activeCohortId: null };
  const unassigned = renderToStaticMarkup(await RecruitmentPage());
  expect(unassigned).toContain("현재 안내 중인 모집 기수가 없습니다.");
  expect(unassigned).toContain('href="https://forms.example.invalid/apply"');
});

it("기수가 연결되지 않아도 공개 양식이 있으면 내부 접수 채널을 안내한다", async () => {
  mocks.forms = [{ id: "f1", title: "합성 양식", description: null }];
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("현재 안내 중인 모집 기수가 없습니다.");
  expect(html).toContain('href="/recruitment/apply"');
});

it.each(["left", "right", "none"] as const)("포스터 배치 %s에서 본문·이미지 표시를 유지한다", async (layout) => {
  mocks.setting = { ...openSettings, posterLayout: layout };
  mocks.cohort = cohort;
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("# 합성 모집 안내");
  if (layout === "none") expect(mocks.images).toHaveLength(0);
  else {
    expect(mocks.images).toHaveLength(1);
    expect(html.indexOf("합성 포스터 이미지") < html.indexOf("# 합성 모집 안내")).toBe(layout === "left");
  }
});

it("고아 활성 기수 ID에서는 배너를 비우되 설정의 안내 본문은 유지한다", async () => {
  mocks.setting = openSettings;
  const html = renderToStaticMarkup(await RecruitmentPage());
  expect(html).toContain("현재 안내 중인 모집 기수가 없습니다.");
  expect(html).toContain("# 합성 모집 안내");
});

it("DB 오류는 빈 모집 상태로 위장하지 않고 상위 오류 경계로 전달한다", async () => {
  const failure = new Error("합성 DB 오류");
  mocks.select.mockImplementationOnce(() => { throw failure; });
  await expect(RecruitmentPage()).rejects.toBe(failure);
});
