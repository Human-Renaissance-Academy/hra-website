/** 기수 관리자 페이지의 조회·오류 안내·클라이언트 전달값을 이동 전후 고정합니다. */
import { Children, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { cohorts } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ select: vi.fn(), orderBy: vi.fn(), where: vi.fn(), limit: vi.fn(), admin: vi.fn(), log: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("@/features/recruitment/actions", () => ({ updateCohort: mocks.update }));
vi.mock("@/app/(admin)/admin/recruitment/_components/cohort-form", () => ({ CohortForm: () => null }));
vi.mock("@/app/(admin)/admin/recruitment/_components/recruitment-row-actions", () => ({ RecruitmentRowActions: () => null }));
import Page from "@/app/(admin)/admin/recruitment/page";
import EditPage from "@/app/(admin)/admin/recruitment/[id]/edit/page";
import { CohortForm } from "@/app/(admin)/admin/recruitment/_components/cohort-form";
import { RecruitmentRowActions } from "@/app/(admin)/admin/recruitment/_components/recruitment-row-actions";

const id = "11111111-1111-4111-8111-111111111111";
const row = { id, name: "20기", description: "합성 설명", imageUrl: "https://fixture.invalid/cohort.png", isActive: true, startDate: new Date("2026-10-15T15:00:00Z"), endDate: null, order: 19, createdAt: new Date(0) };
/** 중첩 JSX에서 클라이언트 경계를 찾아 실제 props를 검사합니다. */
function findProps(node: ReactNode, component: unknown): unknown {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component) return node.props;
  for (const child of Children.toArray(node.props.children)) {
    const found = findProps(child, component);
    if (found) return found;
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ orderBy: mocks.orderBy, where: mocks.where }) });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.orderBy.mockResolvedValue([row]);
  mocks.limit.mockResolvedValue([row]);
});

it("목록은 정확한 투영·숫자 내림차순과 ID 전용 props 및 한국 날짜를 유지한다", async () => {
  // 준비: 실제 정렬 SQL과 합성 기수 행을 사용합니다.
  const dialect = new PgDialect();
  // 실행: 서버 페이지를 구성합니다.
  const page = await Page();
  // 확인: DB 투영과 클라이언트 경계의 계약을 각각 고정합니다.
  expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["id", "name", "description", "isActive", "startDate", "endDate"]);
  expect(dialect.sqlToQuery(mocks.orderBy.mock.calls[0][0])).toEqual(dialect.sqlToQuery(cohortNumberDesc(cohorts.name)));
  expect(findProps(page, RecruitmentRowActions)).toEqual({ id });
  expect(renderToStaticMarkup(page)).toContain("2026. 10. 16.");
  expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
});
it("목록 조회 오류는 빈 목록과 기존 DB 오류 안내를 함께 표시한다", async () => {
  const error = new Error("합성 DB 실패");
  mocks.orderBy.mockRejectedValue(error);
  const markup = renderToStaticMarkup(await Page());
  expect(markup).toContain("데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.");
  expect(markup).toContain("등록된 기수가 없습니다.");
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("admin/recruitment", error);
});
it("잘못된 편집 UUID는 DB 조회 없이 기존 안내 카드를 표시한다", async () => {
  const page = await EditPage({ params: Promise.resolve({ id: "invalid" }) });
  expect(renderToStaticMarkup(page)).toContain("잘못된 요청입니다.");
  expect(mocks.select).not.toHaveBeenCalled();
});
it("없는 편집 기수는 notFound 대신 기존 안내 카드를 표시한다", async () => {
  mocks.limit.mockResolvedValue([]);
  const page = await EditPage({ params: Promise.resolve({ id }) });
  expect(renderToStaticMarkup(page)).toContain("기수를 찾을 수 없습니다.");
  expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
});
it("편집 조회 오류는 검증된 ID만 기존 로그에 전달한다", async () => {
  const error = new Error("합성 편집 실패");
  mocks.limit.mockRejectedValue(error);
  const page = await EditPage({ params: Promise.resolve({ id }) });
  expect(renderToStaticMarkup(page)).toContain("데이터베이스 연결을 확인해 주세요.");
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("admin/recruitment/edit", error, { id });
});
it("편집 폼은 표시 필드만 전달하며 조회는 기존 전체 행 또는 정확한 최소 투영이다", async () => {
  const page = await EditPage({ params: Promise.resolve({ id }) });
  // 이동 전 select()의 전체 행 조회는 허용하지만 명시 투영에서는 필드 누락을 허용하지 않습니다.
  const projection = mocks.select.mock.calls[0][0];
  expect(projection === undefined ? undefined : Object.keys(projection)).toEqual(projection === undefined ? undefined : ["name", "description", "imageUrl", "startDate", "endDate", "isActive"]);
  const props = findProps(page, CohortForm);
  expect(props).toEqual({ title: "기수 수정", description: "20기 정보를 수정합니다.", submitLabel: "변경사항 저장", action: expect.any(Function), defaultValues: { name: row.name, description: row.description, imageUrl: row.imageUrl, startDate: "2026-10-16", endDate: "", isActive: true } } satisfies Partial<ComponentProps<typeof CohortForm>>);
  if (!isValidElement<ComponentProps<typeof CohortForm>>(page)) throw new Error("폼 경계 누락");
  const form = new FormData();
  await page.props.action(form);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(id, form);
});
