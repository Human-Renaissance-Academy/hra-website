/**
 * 관리자 갤러리의 기존 관계 조회·정렬·편집 props를 경계 이동 전에 고정합니다.
 * 잘못된 UUID는 기존 안내 화면으로 끝나며 DB에 전달되지 않아야 합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { query: { galleries: {
  findMany: mocks.findMany, findFirst: mocks.findFirst,
} } } }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/gallery/actions", () => ({ updateGallery: vi.fn(), addGalleryImages: vi.fn() }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-form", () => ({ GalleryForm: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-image-form", () => ({ GalleryImageForm: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid", () => ({ GalleryImageSortableGrid: () => null }));
vi.mock("@/app/(admin)/admin/gallery/_components/gallery-delete-button", () => ({ GalleryDeleteButton: () => null }));

import AdminGalleryPage from "@/app/(admin)/admin/gallery/page";
import EditGalleryPage from "@/app/(admin)/admin/gallery/[id]/edit/page";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/_components/gallery-image-form";
import { GalleryImageSortableGrid } from "@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid";
import { GalleryDeleteButton } from "@/app/(admin)/admin/gallery/_components/gallery-delete-button";

const id = "10000000-0000-4000-8000-000000000001";
const dialect = new PgDialect();
const gallery = { id, title: "합성 앨범", description: "합성 설명", coverImageUrl: null,
  createdAt: new Date("2026-10-01T00:00:00Z"), viewCount: 7,
  images: [{ id: "20000000-0000-4000-8000-000000000001", url: "https://gallery.invalid/a.png", alt: null, order: 2 }] };

/** 렌더링 전 서버 요소에서 클라이언트 경계의 실제 props를 찾습니다. */
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
  mocks.findMany.mockResolvedValue([gallery]);
  mocks.findFirst.mockResolvedValue(gallery);
});

it("관리자 목록은 작성일 역순·사진 ID 관계·삭제 props와 사진 수를 유지한다", async () => {
  // 준비: 합성 앨범을 기존 관계 조회에 공급합니다.
  const page = await AdminGalleryPage();
  // 실행: 서버 페이지의 실제 표시 결과를 렌더링합니다.
  const html = renderToStaticMarkup(page);
  // 확인: 목록 정렬과 최소 클라이언트 props를 함께 고정합니다.
  const options: { orderBy: SQL[]; with: { images: { columns: object } } } = mocks.findMany.mock.calls[0][0];
  expect(dialect.sqlToQuery(options.orderBy[0])).toEqual({ sql: '"galleries"."created_at" desc', params: [] });
  expect(options.with.images.columns).toEqual({ id: true });
  expect(html).toContain("이미지 1장");
  expect(html).toContain(`/admin/gallery/${id}/edit`);
  expect(findBoundary<ComponentProps<typeof GalleryDeleteButton>>(page, GalleryDeleteButton)?.props).toEqual({ id });
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.findMany.mock.invocationCallOrder[0]);
});

it("편집 화면은 기존 열과 이미지 동점 정렬 및 폼 props를 유지한다", async () => {
  // 준비: 유효 UUID와 합성 관계 행을 사용합니다.
  const page = await EditGalleryPage({ params: Promise.resolve({ id }) });
  // 실행: 관계 조회 옵션과 클라이언트 경계를 읽습니다.
  const options: { columns: object; where: SQL; with: { images: { columns: object; orderBy: SQL[] } } } = mocks.findFirst.mock.calls[0][0];
  // 확인: 조회 대상·열·순서와 폼의 실제 계약을 고정합니다.
  expect(options.columns).toEqual({ id: true, title: true, description: true, coverImageUrl: true });
  expect(dialect.sqlToQuery(options.where)).toEqual({ sql: '"galleries"."id" = $1', params: [id], typings: ["uuid"] });
  expect(options.with.images.columns).toEqual({ id: true, url: true, alt: true, order: true });
  expect(options.with.images.orderBy.map(value => dialect.sqlToQuery(value).sql)).toEqual([
    '"gallery_images"."order" asc', '"gallery_images"."created_at" asc',
  ]);
  expect(findBoundary<ComponentProps<typeof GalleryForm>>(page, GalleryForm)?.props).toEqual({
    action: expect.any(Function), submitLabel: "변경사항 저장", defaultValues: { title: gallery.title, description: gallery.description },
  });
  expect(findBoundary<ComponentProps<typeof GalleryImageForm>>(page, GalleryImageForm)?.props).toEqual({
    action: expect.any(Function), galleryId: id, userId: "admin-1",
  });
  expect(findBoundary<ComponentProps<typeof GalleryImageSortableGrid>>(page, GalleryImageSortableGrid)?.props).toEqual({
    galleryId: id, coverImageUrl: null, initialImages: gallery.images,
  });
});

it("잘못된 UUID는 DB 조회 없이 기존 안내 화면을 반환한다", async () => {
  // 준비: PostgreSQL UUID 변환이 불가능한 입력입니다.
  const page = await EditGalleryPage({ params: Promise.resolve({ id: "invalid" }) });
  // 실행: 기존 누락 앨범 안내 화면을 렌더링합니다.
  const html = renderToStaticMarkup(page);
  // 확인: 조회 없이 같은 사용자 안내와 복귀 링크를 유지합니다.
  expect(mocks.findFirst).not.toHaveBeenCalled();
  expect(html).toContain("앨범을 찾을 수 없습니다.");
  expect(html).toContain('href="/admin/gallery"');
});
