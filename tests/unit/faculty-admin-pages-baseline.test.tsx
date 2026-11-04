/**
 * 교수진 관리자 페이지의 표시·정렬·편집 props를 경계 이동 전에 고정합니다.
 * 합성 DB 응답으로 UUID 사전 차단과 실제 페이지 렌더링을 검증합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn<(projection: Readonly<Record<string, unknown>>) => unknown>(),
  from: vi.fn(), orderBy: vi.fn(), where: vi.fn(), limit: vi.fn(),
  update: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/features/faculty/actions", () => ({ updateFaculty: mocks.update, deleteFaculty: vi.fn() }));
vi.mock("@/app/(admin)/admin/faculty/_components/faculty-form", () => ({ FacultyForm: () => null }));

import AdminFacultyPage from "@/app/(admin)/admin/faculty/page";
import EditFacultyPage from "@/app/(admin)/admin/faculty/[id]/page";
import { FacultyForm } from "@/app/(admin)/admin/faculty/_components/faculty-form";
import { faculty } from "@/lib/db/schema";

const id = "81000000-0000-4000-8000-000000000001";
const row = { id, name: "합성 교수", category: "CLASSICS", currentPosition: "현직",
  formerPosition: null, imageUrl: "https://fixture.invalid/image.png", order: 2,
  createdAt: new Date(0), updatedAt: new Date(1), internalMemo: "내부 메모" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.orderBy.mockResolvedValue([row]);
  mocks.limit.mockResolvedValue([row]);
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.from.mockReturnValue({ orderBy: mocks.orderBy, where: mocks.where });
  mocks.select.mockReturnValue({ from: mocks.from });
});

it("관리자 목록은 분류·표시 필드·수정 경로를 유지한다", async () => {
  // 준비: 내부 메타데이터가 섞인 합성 교수 행입니다.
  // 실행: 실제 관리자 페이지를 렌더링합니다.
  const html = renderToStaticMarkup(await AdminFacultyPage());
  // 확인: 표시 정보만 노출하고 관리자 확인 뒤 조회합니다.
  expect(html).toContain("전체 교수진 1명");
  expect(html).toContain("합성 교수");
  expect(html).toContain("현직");
  expect(html).toContain(`/admin/faculty/${id}`);
  expect(html).toContain("고전읽기");
  expect(html).toContain("기업실무");
  expect(html).toContain("특강");
  expect(html).not.toContain("내부 메모");
  expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
});

it("목록 SQL은 순서 뒤 이름 오름차순을 적용한다", async () => {
  // 준비: SQL 표현식을 기록하는 실제 Drizzle 경계입니다.
  await AdminFacultyPage();
  // 확인: 두 조건을 바꾸거나 없애면 실패합니다.
  const conditions: SQL[] = mocks.orderBy.mock.calls[0];
  expect(conditions.map(condition => new PgDialect().sqlToQuery(condition))).toEqual([
    { sql: '"faculty"."order" asc', params: [] },
    { sql: '"faculty"."name" asc', params: [] },
  ]);
});

it("관리자 목록 조회는 다섯 열의 순서·컬럼 참조·테이블을 유지한다", async () => {
  // 준비: 목록 화면에 필요한 열의 순서를 저장소와 독립적으로 지정합니다.
  const keys = ["id", "name", "category", "currentPosition", "formerPosition"] as const;
  // 실행: 서비스와 저장소를 거쳐 실제 페이지의 조회 인자를 기록합니다.
  await AdminFacultyPage();
  // 확인: 전체 행이나 누락·추가·재정렬된 열 및 다른 컬럼 참조를 허용하지 않습니다.
  expect(mocks.select.mock.calls.map(([projection]) => Object.keys(projection))).toEqual([keys]);
  for (const [projection] of mocks.select.mock.calls) {
    for (const key of keys) {
      expect(projection[key]).toBe(faculty[key]);
    }
  }
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith(faculty);
});

it("관리자 편집 조회는 일곱 열의 순서·컬럼 참조·테이블·단건 제한을 유지한다", async () => {
  // 준비: 편집 폼에 필요한 사진과 표시 순서를 포함한 일곱 열입니다.
  const keys = ["id", "name", "category", "currentPosition", "formerPosition", "imageUrl", "order"] as const;
  // 실행: 유효한 UUID로 실제 편집 페이지의 조회를 수행합니다.
  await EditFacultyPage({ params: Promise.resolve({ id }) });
  // 확인: 합성 응답이 동일해도 조회 열 누락과 컬럼 교체 및 단건 제한 변경은 실패합니다.
  expect(mocks.select.mock.calls.map(([projection]) => Object.keys(projection))).toEqual([keys]);
  for (const [projection] of mocks.select.mock.calls) {
    for (const key of keys) {
      expect(projection[key]).toBe(faculty[key]);
    }
  }
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith(faculty);
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
});

it("잘못된 UUID는 DB 조회 전에 notFound로 차단한다", async () => {
  // 준비·실행: 잘못된 경로 식별자를 전달합니다.
  await expect(EditFacultyPage({ params: Promise.resolve({ id: "잘못된-ID" }) })).rejects.toThrow("NOT_FOUND");
  // 확인: 원문 식별자가 DB까지 도달하지 않습니다.
  expect(mocks.select).not.toHaveBeenCalled();
});

it("없는 교수는 편집 폼 대신 notFound를 반환한다", async () => {
  // 준비: 조회 결과가 없습니다.
  mocks.limit.mockResolvedValueOnce([]);
  // 실행·확인: 누락 행을 표시하지 않습니다.
  await expect(EditFacultyPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NOT_FOUND");
});

it("편집 폼은 기존 props와 ID에 바인딩한 액션만 전달한다", async () => {
  // 준비·실행: 실제 편집 페이지의 최상위 폼을 얻습니다.
  const page = await EditFacultyPage({ params: Promise.resolve({ id }) });
  const props: ComponentProps<typeof FacultyForm> = page.props;
  // 확인: 감사 시각과 미래 필드는 클라이언트로 전달하지 않습니다.
  expect(page.type).toBe(FacultyForm);
  expect(props).toEqual({ title: "교수진 수정", description: "합성 교수 정보를 수정합니다.",
    submitLabel: "변경사항 저장", action: expect.any(Function), userId: "admin-1", targetId: id,
    defaultValues: { name: row.name, category: row.category, currentPosition: row.currentPosition,
      formerPosition: null, imageUrl: row.imageUrl, order: 2 } });
  const data = new FormData();
  await props.action(data);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, data);
  const [condition]: SQL[] = mocks.where.mock.calls[0];
  expect(new PgDialect().sqlToQuery(condition)).toEqual({ sql: '"faculty"."id" = $1', params: [id], typings: ["uuid"] });
});
