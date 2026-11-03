/**
 * 관리자 가이드북 페이지의 조회 형태·오류 처리·폼 전달값을 기존 코드에서 고정합니다.
 * 실제 페이지를 합성 DB와 연결하므로 저장소 경계 이동 후에도 같은 검사를 사용합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), orderBy: vi.fn(), findFirst: vi.fn(),
  logServerError: vi.fn(), updateGuidebook: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, query: { guidebooks: { findFirst: mocks.findFirst } },
} }));
vi.mock("@/features/guidebooks/actions", () => ({ updateGuidebook: mocks.updateGuidebook }));
vi.mock("@/app/(admin)/admin/resources/_components/resources-tab-nav", () => ({ ResourcesTabNav: () => null }));
vi.mock("@/app/(admin)/admin/resources/guidebooks/_components/guidebook-row-actions", () => ({ GuidebookRowActions: () => null }));
vi.mock("@/app/(admin)/admin/resources/guidebooks/_components/guidebook-form", () => ({ GuidebookForm: () => null }));

import ListPage from "@/app/(admin)/admin/resources/guidebooks/page";
import EditPage from "@/app/(admin)/admin/resources/guidebooks/[id]/page";
import { GuidebookForm } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-form";

const id = "11111111-1111-4111-8111-111111111111";
const book = { id, title: "합성 안내", fileName: "안내.pdf", fileUrl: "https://fixture.invalid/old.pdf", createdAt: new Date(0) };
const props = { params: Promise.resolve({ id }) };

/** 클라이언트 폼 경계만 찾아 직렬화되는 전달값을 확인합니다. */
function findForm(node: ReactNode): ComponentProps<typeof GuidebookForm> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === GuidebookForm && isValidElement<ComponentProps<typeof GuidebookForm>>(node)) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const found = findForm(child);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ orderBy: mocks.orderBy }) });
  mocks.orderBy.mockResolvedValue([book]);
  mocks.findFirst.mockResolvedValue(book);
});

it("목록은 인가 후 정확한 다섯 컬럼과 생성일 내림차순을 사용한다", async () => {
  // 준비: 원본 파일 경로가 화면에 노출되지 않는 합성 행입니다.
  const html = renderToStaticMarkup(await ListPage());
  // 실행 결과: 조회·표시 계약을 함께 확인합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["id", "title", "fileUrl", "fileName", "createdAt"]);
  const order: SQL = mocks.orderBy.mock.calls[0][0];
  expect(new PgDialect().sqlToQuery(order)).toMatchObject({ sql: '"guidebooks"."created_at" desc', params: [] });
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  expect(html).toContain(`href="/api/resources/guidebooks/${id}/download"`);
  expect(html).toContain('download="안내.pdf"');
  expect(html).toContain("합성 안내");
  expect(html).not.toContain(book.fileUrl);
});

it("목록 DB 오류는 원래 로그와 빈 목록 안내로 처리한다", async () => {
  // 준비: DB 조회 예외입니다.
  const error = new Error("합성 DB 오류");
  mocks.orderBy.mockRejectedValue(error);
  // 실행: 실제 페이지를 렌더링합니다.
  const html = renderToStaticMarkup(await ListPage());
  // 검증: 장애 안내와 빈 결과를 유지합니다.
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("admin/resources/guidebooks", error);
  expect(html).toContain("데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.");
  expect(html).toContain("전체 가이드북 0건");
  expect(html).toContain("등록된 가이드북이 없습니다.");
});

it("잘못된 편집 UUID는 DB 접근 전에 404로 종료한다", async () => {
  // 준비·실행: 잘못된 라우트 입력입니다.
  await expect(EditPage({ params: Promise.resolve({ id: "bad-id" }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  // 검증: DB에는 도달하지 않습니다.
  expect(mocks.findFirst).not.toHaveBeenCalled();
});

it("편집 대상이 없으면 404로 종료한다", async () => {
  // 준비: 유효 UUID의 누락 행입니다.
  mocks.findFirst.mockResolvedValue(undefined);
  // 실행·검증: 기존 404를 유지합니다.
  await expect(EditPage(props)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

it("편집은 UUID 조건으로 조회하고 제목·파일명과 바인딩 액션만 폼에 전달한다", async () => {
  // 준비: 행에 불필요한 내부 필드도 포함합니다.
  mocks.findFirst.mockResolvedValue({ ...book, internal: "비공개" });
  // 실행: 폼 경계를 가져옵니다.
  const form = findForm(await EditPage(props));
  // 검증: findFirst 옵션·폼 필드·바인딩을 고정합니다.
  expect(Object.keys(mocks.findFirst.mock.calls[0][0])).toEqual(["where"]);
  const where: SQL = mocks.findFirst.mock.calls[0][0].where;
  expect(new PgDialect().sqlToQuery(where)).toEqual({ sql: '"guidebooks"."id" = $1', params: [id], typings: ["uuid"] });
  expect(form).toBeDefined();
  if (!form) throw new Error("합성 폼이 필요합니다.");
  expect(Object.keys(form)).toEqual(["action", "userId", "defaultValues"]);
  expect(form.userId).toBe("admin-1");
  expect(form.defaultValues).toEqual({ title: book.title, fileName: book.fileName });
  const data = new FormData();
  await form.action(data);
  expect(mocks.updateGuidebook).toHaveBeenCalledExactlyOnceWith(id, data);
});

it("편집 DB 오류는 404나 안내로 위장하지 않고 전파한다", async () => {
  // 준비: 상세 조회 예외입니다.
  const error = new Error("합성 상세 오류");
  mocks.findFirst.mockRejectedValue(error);
  // 실행·검증: 동일 예외가 전달됩니다.
  await expect(EditPage(props)).rejects.toBe(error);
});
