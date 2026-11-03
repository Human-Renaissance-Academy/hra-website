/** 관리자 강의자료 화면의 기존 조회 순서와 클라이언트 표시 계약을 고정합니다. */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), select: vi.fn(), orderBy: vi.fn(), findFirst: vi.fn(),
  form: vi.fn(), logServerError: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, query: { classMaterials: { findFirst: mocks.findFirst } },
} }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/features/class-materials/actions", () => ({ updateClassMaterial: vi.fn() }));
vi.mock("@/app/(admin)/admin/resources/_components/resources-tab-nav", () => ({ ResourcesTabNav: () => null }));
vi.mock("@/app/(admin)/admin/resources/class-materials/_components/class-material-row-actions", () => ({ ClassMaterialRowActions: () => null }));
vi.mock("@/app/(admin)/admin/resources/class-materials/_components/class-material-form", () => ({
  ClassMaterialForm: (props: unknown) => { mocks.form(props); return null; },
}));
import ListPage from "@/app/(admin)/admin/resources/class-materials/page";
import EditPage from "@/app/(admin)/admin/resources/class-materials/[id]/page";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ leftJoin: () => ({ orderBy: mocks.orderBy }) }) });
  mocks.orderBy.mockResolvedValue([]);
});

it("목록 조회는 표시 필드 일곱 개와 생성 시각 내림차순을 유지한다", async () => {
  // 준비: 정렬 결과는 비어 있는 목록입니다.
  const page = await ListPage();
  // 검증: 필드를 빠뜨리거나 정렬 방향이 바뀌면 실패합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual([
    "id", "title", "weekNumber", "lectureTitle", "audience", "createdAt", "uploaderName",
  ]);
  expect(new PgDialect().sqlToQuery(mocks.orderBy.mock.calls[0][0]).sql).toBe('"class_materials"."created_at" desc');
  expect(renderToStaticMarkup(page)).toContain("등록된 강의 자료가 없습니다.");
});

it.each(["bad", id])("편집에서 유효하지 않거나 없는 자료 %s는 notFound다", async (value) => {
  // 준비: 유효 UUID도 존재하지 않습니다.
  mocks.findFirst.mockResolvedValue(undefined);
  // 실행·검증: UUID 검증은 DB 조회보다 먼저입니다.
  await expect(EditPage({ params: Promise.resolve({ id: value }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.findFirst).toHaveBeenCalledTimes(value === id ? 1 : 0);
});

it("편집 폼은 기존 다섯 필드만 전달한다", async () => {
  // 준비: 내부 URL이 섞인 행을 공급합니다.
  mocks.findFirst.mockResolvedValue({ id, title: "합성 강의", weekNumber: 2, lectureTitle: null,
    audience: "FACULTY", fileName: "합성.pdf", fileUrl: "https://fixture.invalid/secret.pdf" });
  // 실행: 실제 Page를 렌더합니다.
  renderToStaticMarkup(await EditPage({ params: Promise.resolve({ id }) }));
  // 검증: 내부 원본 URL은 폼에 전달되지 않습니다.
  expect(mocks.form.mock.calls[0][0]).toEqual({ action: expect.any(Function), userId: "admin-1",
    defaultValues: { title: "합성 강의", weekNumber: 2, lectureTitle: null, audience: "FACULTY", fileName: "합성.pdf" } });
});

it("목록 DB 장애는 동일 경로로 기록하고 안내를 표시한다", async () => {
  // 준비: 조회에서 장애가 발생합니다.
  const failure = new Error("합성 장애");
  mocks.orderBy.mockRejectedValue(failure);
  // 실행·검증: 페이지 경계에서 기존 안내와 로그를 유지합니다.
  expect(renderToStaticMarkup(await ListPage())).toContain("데이터를 불러오지 못했습니다.");
  expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith("admin/resources/class-materials", failure);
});
