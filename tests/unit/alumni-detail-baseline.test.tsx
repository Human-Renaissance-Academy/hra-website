/**
 * #271 수료생 상세의 엄격 UUID·이웃 순서·사이드바·본문 표시를 DB 경계 이동 전에 고정합니다.
 * 실제 Page를 합성 행으로 렌더링하고 세 종류 SQL의 조건과 필드 투영을 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  sidebar: vi.fn(),
  markdown: vi.fn(),
  images: [] as { src: string; alt: string }[],
  projections: [] as Record<string, unknown>[],
  wheres: [] as unknown[],
  orders: [] as unknown[][],
  selectIndex: 0,
}));
vi.mock("@/lib/db", () => ({ db: {
  query: { alumniStories: { findFirst: mocks.findFirst } }, select: mocks.select,
} }));
vi.mock("@/app/(public)/alumni/[id]/_components/alumni-sidebar", () => ({
  AlumniSidebar: (props: unknown) => { mocks.sidebar(props); return null; },
}));
vi.mock("@/components/markdown/markdown-viewer", () => ({
  MarkdownViewer: ({ body }: { body: string }) => { mocks.markdown(body); return <span>{body}</span>; },
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    mocks.images.push({ src, alt });
    return null;
  },
}));

import AlumniDetailPage, { generateMetadata } from "@/app/(public)/alumni/[id]/page";

const dialect = new PgDialect();
const id = "11111111-1111-4111-8111-111111111111";
const beforeId = "22222222-2222-4222-8222-222222222222";
const afterId = "33333333-3333-4333-8333-333333333333";
const current = { id, name: "현재 수료생", title: "합성 직함", quote: "현재 인용",
  content: "# 공개 상세 본문", imageUrl: "https://public.invalid/alumni.jpg", order: 2,
  createdAt: new Date("2026-10-24T00:00:00Z") };
const sidebarStories = [{ id, name: "현재 수료생", title: "합성 직함", summary: "짧은 요약", imageUrl: null }];

/** 현재 Page의 이전·다음·사이드바 쿼리만 순서대로 합성 결과를 돌려줍니다. */
function queryBuilder(projection: Record<string, unknown>) {
  const index = mocks.selectIndex++;
  mocks.projections.push(projection);
  if (index === 2) return { from: () => ({ orderBy: (...conditions: unknown[]) => {
    mocks.orders.push(conditions);
    return Promise.resolve(sidebarStories);
  } }) };
  return { from: () => ({ where: (condition: unknown) => {
    mocks.wheres.push(condition);
    return { orderBy: (...conditions: unknown[]) => {
      mocks.orders.push(conditions);
      return { limit: () => Promise.resolve(index === 0
        ? [{ id: beforeId, name: "이전 수료생" }]
        : [{ id: afterId, name: "다음 수료생" }]) };
    } };
  } }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.images.length = 0;
  mocks.projections.length = 0;
  mocks.wheres.length = 0;
  mocks.orders.length = 0;
  mocks.selectIndex = 0;
  mocks.findFirst.mockResolvedValue(current);
  mocks.select.mockImplementation(queryBuilder);
});

it("기존 제목을 유지하고 존재하는 이야기에만 canonical을 선언한다", async () => {
  // #414: 제목은 그대로 두고 존재하는 상세에만 자기 경로를 대표 주소로 내보냅니다.
  await expect(generateMetadata({ params: Promise.resolve({ id }) })).resolves.toEqual({
    title: "수료생 이야기",
    alternates: { canonical: `/alumni/${id}` },
  });

  // 잘못된 ID와 없는 이야기는 404이므로 canonical 없이 제목만 반환합니다.
  await expect(generateMetadata({ params: Promise.resolve({ id: "invalid-id" }) }))
    .resolves.toEqual({ title: "수료생 이야기" });
  mocks.findFirst.mockResolvedValueOnce(null);
  await expect(generateMetadata({ params: Promise.resolve({ id }) }))
    .resolves.toEqual({ title: "수료생 이야기" });
});

it("본문·이웃 링크·사이드바 표시를 유지한다", async () => {
  const html = renderToStaticMarkup(await AlumniDetailPage({ params: Promise.resolve({ id }) }));
  expect(html).toContain("현재 수료생");
  expect(html).toContain("현재 인용");
  expect(html).toContain("공개 상세 본문");
  expect(html).toContain(`href="/alumni/${beforeId}"`);
  expect(html).toContain(`href="/alumni/${afterId}"`);
  expect(mocks.markdown).toHaveBeenCalledExactlyOnceWith("# 공개 상세 본문");
  expect(mocks.images).toEqual([{ src: "https://public.invalid/alumni.jpg", alt: "현재 수료생" }]);
  expect(mocks.sidebar).toHaveBeenCalledExactlyOnceWith({ stories: sidebarStories, currentStoryId: id });
  expect(mocks.projections.map((projection) => Object.keys(projection))).toEqual([
    ["id", "name"], ["id", "name"], ["id", "name", "title", "summary", "imageUrl"],
  ]);
  expect(dialect.sqlToQuery(mocks.orders[2][0] as SQL).sql).toBe('"alumni_stories"."order" asc');
  expect(dialect.sqlToQuery(mocks.projections[2].summary as SQL).sql).toContain("left(trim(regexp_replace");
});

it("이전·다음은 order와 작성 시각의 엄격한 비교·기존 정렬을 쓴다", async () => {
  await AlumniDetailPage({ params: Promise.resolve({ id }) });
  expect(mocks.wheres).toHaveLength(2);
  const previous = dialect.sqlToQuery(mocks.wheres[0] as SQL);
  const next = dialect.sqlToQuery(mocks.wheres[1] as SQL);
  expect(previous.sql).toContain('"alumni_stories"."order" <');
  expect(previous.sql).toContain('"alumni_stories"."created_at" <');
  expect(next.sql).toContain('"alumni_stories"."order" >');
  expect(next.sql).toContain('"alumni_stories"."created_at" >');
  expect(dialect.sqlToQuery(mocks.orders[0][0] as SQL).sql).toBe('"alumni_stories"."order" desc');
  expect(dialect.sqlToQuery(mocks.orders[1][0] as SQL).sql).toBe('"alumni_stories"."order" asc');
});

it("잘못된·없는 ID는 다른 자료 조회 전에 404로 끝난다", async () => {
  await expect(AlumniDetailPage({ params: Promise.resolve({ id: "invalid-id" }) }))
    .rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(mocks.findFirst).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();

  mocks.findFirst.mockResolvedValueOnce(null);
  await expect(AlumniDetailPage({ params: Promise.resolve({ id }) }))
    .rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(mocks.select).not.toHaveBeenCalled();
});
