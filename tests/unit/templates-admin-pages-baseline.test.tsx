/**
 * 보고서 양식 관리자 화면의 이동 전 계약을 고정합니다.
 * 실제 페이지 트리와 SQL 조건으로 투영·날짜·폼 바인딩·누락 처리를 확인합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), orderBy: vi.fn(), findFirst: vi.fn(),
  notFound: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, query: { reportTemplates: { findFirst: mocks.findFirst } },
} }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/report-templates/actions", () => ({ updateReportTemplate: mocks.update }));
vi.mock("@/app/(admin)/admin/resources/_components/resources-tab-nav", () => ({ ResourcesTabNav: () => null }));
vi.mock("@/app/(admin)/admin/resources/templates/_components/template-row-actions", () => ({ TemplateRowActions: () => null }));
vi.mock("@/app/(admin)/admin/resources/templates/_components/template-form", () => ({ TemplateForm: () => null }));

import ListPage from "@/app/(admin)/admin/resources/templates/page";
import EditPage from "@/app/(admin)/admin/resources/templates/[id]/edit/page";
import { TemplateForm } from "@/app/(admin)/admin/resources/templates/_components/template-form";
import { TemplateRowActions } from "@/app/(admin)/admin/resources/templates/_components/template-row-actions";

const id = "11111111-1111-4111-8111-111111111111";
const target = { id, slug: "sample", title: "합성 양식", category: "template", reportCategory: "classic-book",
  description: null, version: "2.0", body: "본문", published: false, order: 3,
  updatedAt: new Date("2026-10-01T16:00:00Z"), createdAt: new Date(0), futureField: "내부 정보" };

/** 클라이언트 경계를 실행하지 않고 전달된 props를 찾습니다. */
function boundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = boundary<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ orderBy: mocks.orderBy }) });
  mocks.orderBy.mockResolvedValue([target]);
  mocks.findFirst.mockResolvedValue(target);
  mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
});

it("목록은 인가 후 정확한 투영과 순서 SQL·KST 날짜·행 props를 유지한다", async () => {
  // 준비: UTC 날짜가 한국 날짜와 다른 합성 행입니다.
  // 실행: 실제 관리자 목록을 구성합니다.
  const page = await ListPage();
  // 검증: 정렬 키와 클라이언트에 전달되는 ID만 고정합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
    "id", "slug", "title", "category", "reportCategory", "version", "published", "order", "updatedAt",
  ]);
  expect(mocks.orderBy.mock.calls[0].map(value => new PgDialect().sqlToQuery(value).sql)).toEqual([
    '"report_templates"."order" asc', '"report_templates"."updated_at" desc',
  ]);
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  expect(boundary<ComponentProps<typeof TemplateRowActions>>(page, TemplateRowActions)?.props).toEqual({ id });
  expect(renderToStaticMarkup(page)).toContain("2026. 10. 02.");
});

it("편집은 정확한 초기값과 대상 ID가 바인딩된 액션을 전달한다", async () => {
  // 준비: 불필요한 메타데이터가 포함된 합성 행입니다.
  // 실행: 실제 편집 페이지를 구성합니다.
  const page = await EditPage({ params: Promise.resolve({ id }) });
  const form = boundary<ComponentProps<typeof TemplateForm>>(page, TemplateForm);
  // 검증: 저장용 필드만 폼에 전달되고 액션은 원래 ID를 사용합니다.
  expect(form?.props.defaultValues).toEqual({ slug: "sample", title: "합성 양식", category: "template",
    reportCategory: "classic-book", description: null, version: "2.0", body: "본문", published: false, order: 3 });
  expect(form?.props.submitLabel).toBe("변경 저장");
  const data = new FormData();
  await form?.props.action(data);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, data);
  expect(new PgDialect().sqlToQuery(mocks.findFirst.mock.calls[0][0].where).params).toEqual([id]);
});

it("잘못된 UUID는 DB 전에 notFound로 종료한다", async () => {
  // 준비: UUID가 아닌 경로입니다.
  // 실행·검증: 조회 없이 404 제어 흐름으로 종료합니다.
  await expect(EditPage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it("누락 대상은 notFound로 종료하고 DB 장애는 그대로 전파한다", async () => {
  // 준비: 유효 UUID지만 행이 없습니다.
  mocks.findFirst.mockResolvedValue(undefined);
  // 실행·검증: HEAD의 누락 대상 처리입니다.
  await expect(EditPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NOT_FOUND");
});

it("목록 DB 장애를 빈 목록으로 위장하지 않는다", async () => {
  // 준비: 저장소가 거부합니다.
  const error = new Error("DB_FAILURE");
  mocks.orderBy.mockRejectedValue(error);
  // 실행·검증: HEAD처럼 호출자에게 전파합니다.
  await expect(ListPage()).rejects.toBe(error);
});

it("편집 페이지 DB 조회 장애는 notFound 없이 그대로 전파한다", async () => {
  // 준비: 유효 UUID지만 DB 쿼리가 실패합니다.
  const error = new Error("PG_CONNECTION_ERROR");
  mocks.findFirst.mockRejectedValue(error);
  // 실행·검증: HEAD처럼 예외를 그대로 호출자에게 전파하고 notFound()를 호출하지 않습니다.
  await expect(EditPage({ params: Promise.resolve({ id }) })).rejects.toBe(error);
  expect(mocks.notFound).not.toHaveBeenCalled();
});
