/**
 * 관리자 공지 페이지의 기존 조회 모양과 클라이언트 props를 고정합니다.
 * UUID 오류는 DB 조회 전에 기존 누락 안내 카드를 반환해야 합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), from: vi.fn(), orderBy: vi.fn(),
  findFirst: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, query: { notices: { findFirst: mocks.findFirst } },
} }));
vi.mock("@/features/notices/actions", () => ({ updateNotice: mocks.update }));
vi.mock("@/app/(admin)/admin/notices/_components/notice-form", () => ({ NoticeForm: () => null }));
vi.mock("@/app/(admin)/admin/notices/_components/notice-pin-button", () => ({ NoticePinButton: () => null }));
vi.mock("@/app/(admin)/admin/notices/_components/notice-row-actions", () => ({ NoticeRowActions: () => null }));

import Page from "@/app/(admin)/admin/notices/page";
import EditPage from "@/app/(admin)/admin/notices/[id]/edit/page";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { NoticePinButton } from "@/app/(admin)/admin/notices/_components/notice-pin-button";
import { NoticeRowActions } from "@/app/(admin)/admin/notices/_components/notice-row-actions";
import { notices } from "@/lib/db/schema";

const id = "10000000-0000-4000-8000-000000000001";
const values = { title: "합성 공지", content: "**합성 본문**", status: "DRAFT", pinned: true } as const;
const dialect = new PgDialect();

/** 실제 서버 요소 트리에서 클라이언트 경계를 찾아 props만 관찰합니다. */
function findProps<Props>(node: ReactNode, component: unknown): Props | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const found = findProps<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ orderBy: mocks.orderBy });
  mocks.orderBy.mockResolvedValue([{ id, ...values, createdAt: new Date(0), authorId: "내부" }]);
});

it("목록은 인가 후 여섯 열을 작성일 내림차순으로 제한 없이 조회한다", async () => {
  // 준비: 초안과 고정 여부가 있는 합성 행을 사용합니다.
  // 실행: 실제 목록 페이지의 조회와 요소 생성을 수행합니다.
  const page = await Page();
  // 확인: projection, 조건 없는 체인, 정렬과 클라이언트 전달값을 고정합니다.
  expect(mocks.select).toHaveBeenCalledExactlyOnceWith({
    id: notices.id, title: notices.title, content: notices.content,
    status: notices.status, pinned: notices.pinned, createdAt: notices.createdAt,
  });
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith(notices);
  expect(mocks.orderBy).toHaveBeenCalledOnce();
  expect(dialect.sqlToQuery(mocks.orderBy.mock.calls[0][0])).toEqual({
    sql: '"notices"."created_at" desc', params: [],
  });
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  expect(findProps<ComponentProps<typeof NoticePinButton>>(page, NoticePinButton)).toEqual({ id, pinned: true });
  expect(findProps<ComponentProps<typeof NoticeRowActions>>(page, NoticeRowActions)).toEqual({ id });
  expect(renderToStaticMarkup(page)).toContain("합성 본문");
});

it("잘못된 UUID는 DB 접근 없이 기존 누락 카드를 표시한다", async () => {
  // 준비: PostgreSQL UUID 캐스트가 불가능한 경로값입니다.
  // 실행: 기존 Web 사전 검증을 통과하지 못하는 편집 페이지입니다.
  const page = await EditPage({ params: Promise.resolve({ id: "bad-id" }) });
  // 확인: notFound로 바꾸지 않고 기존 카드 표시를 유지합니다.
  expect(renderToStaticMarkup(page)).toContain("공지사항을 찾을 수 없습니다.");
  expect(mocks.findFirst).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
});

it("없는 유효 UUID도 기존 누락 카드를 표시한다", async () => {
  // 준비: 유효 ID지만 조회 결과가 없습니다.
  mocks.findFirst.mockResolvedValue(undefined);
  // 실행: 편집 페이지를 생성합니다.
  const page = await EditPage({ params: Promise.resolve({ id }) });
  // 확인: 폼 대신 동일한 누락 안내입니다.
  expect(renderToStaticMarkup(page)).toContain("공지사항을 찾을 수 없습니다.");
  expect(findProps(page, NoticeForm)).toBeUndefined();
});

it("편집은 ID 조건과 네 열만 조회하고 기존 폼 props와 바인딩 ID를 유지한다", async () => {
  // 준비: 내부 필드가 추가된 합성 행도 폼에는 전달하지 않습니다.
  mocks.findFirst.mockResolvedValue({ ...values, authorId: "내부", viewCount: 10 });
  // 실행: 실제 편집 페이지를 생성합니다.
  const page = await EditPage({ params: Promise.resolve({ id }) });
  // 확인: 조건과 열 순서 및 폼의 함수 바인딩을 관찰합니다.
  const query = mocks.findFirst.mock.calls[0][0];
  expect(Object.keys(query.columns)).toEqual(["title", "status", "pinned", "content"]);
  expect(dialect.sqlToQuery(query.where)).toEqual({ sql: '"notices"."id" = $1', params: [id], typings: ["uuid"] });
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]);
  const props = findProps<ComponentProps<typeof NoticeForm>>(page, NoticeForm);
  expect(props).toEqual({ action: expect.any(Function), defaultValues: values,
    submitLabel: "수정 저장", successMessage: "공지사항이 수정되었습니다." });
  const form = new FormData();
  await props?.action(form);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, form);
});
