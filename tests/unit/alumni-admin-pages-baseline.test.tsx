/**
 * 관리자 수료생 페이지의 기존 조회·정렬·폼 경계를 이동 전후에 고정합니다.
 * 클라이언트 컴포넌트는 실행하지 않고 실제 페이지가 만든 요소의 props를 확인합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQLWrapper } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), orderBy: vi.fn(), findFirst: vi.fn(),
  notFound: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, query: { alumniStories: { findFirst: mocks.findFirst } },
} }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/alumni/actions", () => ({ updateAlumniStory: mocks.update }));
vi.mock("@/app/(admin)/admin/alumni/_components/alumni-sortable-list", () => ({ AlumniSortableList: () => null }));
vi.mock("@/app/(admin)/admin/alumni/_components/alumni-story-form", () => ({ AlumniStoryForm: () => null }));

import AdminAlumniPage from "@/app/(admin)/admin/alumni/page";
import EditAlumniStoryPage from "@/app/(admin)/admin/alumni/[id]/page";
import { AlumniSortableList } from "@/app/(admin)/admin/alumni/_components/alumni-sortable-list";
import { AlumniStoryForm } from "@/app/(admin)/admin/alumni/_components/alumni-story-form";

const id = "10000000-0000-4000-8000-000000000001";
const item = { id, name: "합성 수료생", quote: "합성 문구", content: "합성 본문", pinned: true };
const defaults = { name: item.name, title: null, quote: item.quote, content: item.content, imageUrl: "https://alumni.invalid/photo.png", isFeatured: true };

/** 중첩된 JSX에서 지정한 클라이언트 경계만 찾습니다. */
function findBoundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findBoundary<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.notFound.mockImplementation(() => { throw new Error("QA_NOT_FOUND"); });
  mocks.select.mockReturnValue({ from: () => ({ orderBy: mocks.orderBy }) });
  mocks.orderBy.mockResolvedValue([item]);
  mocks.findFirst.mockResolvedValue({ ...defaults, id, pinned: true, viewCount: 99, createdAt: new Date(0) });
});

it("목록은 인가 후 다섯 열을 고정·작성일 역순으로 읽고 동일 props를 전달한다", async () => {
  // 준비: 위 fixture는 DB가 투영한 기존 목록 행입니다.
  const page = await AdminAlumniPage();
  // 검증: 열 누락·정렬 변경·인가 순서 변경은 각각 실패합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["id", "name", "quote", "content", "pinned"]);
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  const ordering: SQLWrapper[] = mocks.orderBy.mock.calls[0];
  expect(new PgDialect().sqlToQuery(sql`${sql.join(ordering, sql`, `)}`).sql)
    .toBe('"alumni_stories"."pinned" desc, "alumni_stories"."created_at" desc');
  expect(findBoundary<ComponentProps<typeof AlumniSortableList>>(page, AlumniSortableList)?.props)
    .toEqual({ initialItems: [item] });
});

it("편집은 UUID 조건과 여섯 기본값·세션 사용자·수정 액션 바인딩을 유지한다", async () => {
  // 실행: 합성 UUID의 편집 페이지를 생성합니다.
  const page = await EditAlumniStoryPage({ params: Promise.resolve({ id }) });
  // 검증: 내부 행 메타데이터는 폼에 보내지 않습니다.
  const query: { where: SQLWrapper; columns: Record<string, boolean> } = mocks.findFirst.mock.calls[0][0];
  expect(query.columns).toStrictEqual({
    name: true, title: true, quote: true, content: true, imageUrl: true, isFeatured: true,
  });
  expect(new PgDialect().sqlToQuery(query.where.getSQL())).toMatchObject({
    sql: '"alumni_stories"."id" = $1', params: [id],
  });
  const form = findBoundary<ComponentProps<typeof AlumniStoryForm>>(page, AlumniStoryForm);
  expect(form?.props).toEqual({ title: "수료생 이야기 수정", description: "합성 수료생 수료생 이야기를 수정합니다.",
    submitLabel: "변경사항 저장", action: expect.any(Function), userId: "admin-1", storyId: id, defaultValues: defaults });
  expect(form?.props.defaultValues?.imageUrl).toBe("https://alumni.invalid/photo.png");
  const data = new FormData();
  await form?.props.action(data);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, data);
});

it("잘못된 UUID는 DB 조회 전에 notFound로 종료한다", async () => {
  await expect(EditAlumniStoryPage({ params: Promise.resolve({ id: "bad-id" }) })).rejects.toThrow("QA_NOT_FOUND");
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it("없는 UUID 대상은 폼 대신 notFound로 종료한다", async () => {
  mocks.findFirst.mockResolvedValue(undefined);
  await expect(EditAlumniStoryPage({ params: Promise.resolve({ id }) })).rejects.toThrow("QA_NOT_FOUND");
  expect(mocks.findFirst).toHaveBeenCalledOnce();
});
