/**
 * 관리자 언론보도 화면의 조회 순서·인가·편집 props를 경계 이동 전에 고정합니다.
 * 실제 페이지의 요소 트리를 검사하고 합성 저장소 응답만 제공합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), orderBy: vi.fn(), where: vi.fn(), limit: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("QA_NOT_FOUND"); }), update: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/press/actions", () => ({ updatePressArticle: mocks.update }));
vi.mock("@/app/(admin)/admin/press/_components/press-sortable-list", () => ({ PressSortableList: () => null }));
vi.mock("@/app/(admin)/admin/press/_components/press-form", () => ({ PressForm: () => null }));

import AdminPressPage from "@/app/(admin)/admin/press/page";
import EditPressArticlePage from "@/app/(admin)/admin/press/[id]/page";
import { PressSortableList } from "@/app/(admin)/admin/press/_components/press-sortable-list";
import { PressForm } from "@/app/(admin)/admin/press/_components/press-form";

const id = "81000000-0000-4000-8000-000000000001";
const article = {
  id, title: "합성 기사", source: "합성 매체", url: "https://press.invalid/article",
  publishedAt: new Date("2026-10-23T18:00:00Z"), description: null, imageUrl: null,
  order: 3, viewCount: 9, createdAt: new Date(0), futureField: "내부 전용",
};
const dialect = new PgDialect();

/** 클라이언트 컴포넌트에 실제로 전달되는 경계를 찾습니다. */
function findBoundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findBoundary<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.orderBy.mockResolvedValue([article]);
  mocks.limit.mockResolvedValue([article]);
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.select.mockReturnValue({ from: () => ({ orderBy: mocks.orderBy, where: mocks.where }) });
});

it("관리자 목록은 인가 뒤 네 열을 기존 두 조건으로 정렬해 전달한다", async () => {
  // 준비: 비표시 열을 포함한 합성 행을 제공합니다.
  // 실행: 실제 관리자 목록 페이지를 구성합니다.
  const page = await AdminPressPage();
  // 검증: SQL 투영·정렬과 클라이언트 props를 함께 확인합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["id", "title", "source", "publishedAt"]);
  expect(mocks.orderBy.mock.calls[0].map((condition: SQL) => dialect.sqlToQuery(condition).sql))
    .toEqual(['"press_articles"."order" asc', '"press_articles"."created_at" asc']);
  const list = findBoundary<ComponentProps<typeof PressSortableList>>(page, PressSortableList);
  expect(list?.key).toBe(".$1");
  expect(list?.props).toStrictEqual({ initialItems: [{ id, title: article.title, source: article.source, publishedAt: article.publishedAt }] });
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
});

it("편집 화면은 ID 조건과 한 행 제한으로 조회하고 KST 날짜 및 여섯 기본값을 전달한다", async () => {
  // 준비: 실제 바인딩 대상 액션은 관찰 가능한 mock입니다.
  const form = new FormData();
  // 실행: 실제 편집 화면을 구성합니다.
  const page = await EditPressArticlePage({ params: Promise.resolve({ id }) });
  // 검증: 표시 필드 이외에는 폼 props로 전달하지 않습니다.
  const boundary = findBoundary<ComponentProps<typeof PressForm>>(page, PressForm);
  expect(boundary?.props).toStrictEqual({
    title: "언론보도 수정", description: "합성 매체 기사 정보를 수정합니다.", submitLabel: "변경사항 저장",
    action: expect.any(Function), defaultValues: {
      title: article.title, source: article.source, url: article.url,
      publishedAt: "2026-10-24", description: null, imageUrl: null,
    },
  });
  expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0])).toMatchObject({ sql: '"press_articles"."id" = $1', params: [id] });
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
  await boundary?.props.action(form);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, form);
});

it("잘못된 UUID는 DB 조회 전에 notFound로 종료한다", async () => {
  // 준비: 잘못된 경로 입력입니다.
  // 실행: 편집 화면 호출입니다.
  await expect(EditPressArticlePage({ params: Promise.resolve({ id: "잘못됨" }) })).rejects.toThrow("QA_NOT_FOUND");
  // 검증: DB 접근은 발생하지 않습니다.
  expect(mocks.select).not.toHaveBeenCalled();
});

it("유효한 UUID라도 행이 없으면 notFound로 종료한다", async () => {
  // 준비: 조회 결과가 비어 있습니다.
  mocks.limit.mockResolvedValueOnce([]);
  // 실행 및 검증: 누락 행은 폼 대신 404입니다.
  await expect(EditPressArticlePage({ params: Promise.resolve({ id }) })).rejects.toThrow("QA_NOT_FOUND");
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
});
