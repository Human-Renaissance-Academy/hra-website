/**
 * 관리자 대시보드의 기존 SQL 투영·조회 순서와 렌더링 계약을 고정합니다.
 * 서비스는 실제로 호출하고 DB와 웹 세션만 격리하므로 경계 이동 전후에 같은 검사를 실행합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), requireAdmin: vi.fn(), logServerError: vi.fn(),
  counts: [2, 13, 3, 1014, 5, 6, 7, 8, 9], failureIndex: -1,
  error: new Error("합성 DB 실패"),
  queries: Array<{ keys: string[]; projection: unknown; table: string; where: unknown }>(),
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import AdminDashboardPage from "@/app/(admin)/admin/page";

const dialect = new PgDialect();
const queryCases = [
  ["application_submissions", '"application_submissions"."status" = $1', ["PENDING"]],
  ["application_submissions", null, []],
  ["users", '"users"."role" = $1', ["PENDING"]],
  ["users", null, []], ["cohorts", null, []], ["notices", null, []],
  ["press_articles", null, []], ["galleries", null, []], ["alumni_stories", null, []],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.counts = [2, 13, 3, 1014, 5, 6, 7, 8, 9];
  mocks.failureIndex = -1;
  mocks.queries = [];
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  // 체인별 순서·투영·필터를 기록하고 실제 Promise.all의 거부도 재현합니다.
  mocks.select.mockImplementation((projection: Record<string, SQL>) => {
    const index = mocks.queries.length;
    const query: { keys: string[]; projection: unknown; table: string; where: unknown } = {
      keys: Object.keys(projection), projection: dialect.sqlToQuery(projection.total), table: "", where: null,
    };
    mocks.queries.push(query);
    return { from: (table: Table) => {
      query.table = getTableName(table);
      const result = () => index === mocks.failureIndex
        ? Promise.reject(mocks.error) : Promise.resolve([{ total: mocks.counts[index] }]);
      return {
        then: (resolve: (rows: { total: number }[]) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
        where: (condition: SQL) => { query.where = dialect.sqlToQuery(condition); return result(); },
      };
    } };
  });
});

it.each(queryCases.map(([table, where, params], index) => ({ table, where, params, index })))(
  "조회 $index의 count 투영과 필터를 유지한다", async ({ table, where, params, index }) => {
    // 준비: 서로 다른 집계 값과 실제 SQL 표현식을 사용하는 체인이 있습니다.
    // 실행: 페이지가 아홉 조회를 모두 시작합니다.
    await AdminDashboardPage();
    // 검증: 순서·단일 total 키·count(*)·필터 유무와 값이 모두 일치합니다.
    expect(mocks.queries[index]).toEqual({ keys: ["total"], projection: { sql: "count(*)", params: [] }, table,
      where: where === null ? null : { sql: where, params: [...params], typings: ["none"] } });
  },
);

it("전체 현황의 값과 링크 순서를 유지한다", async () => {
  // 준비: 아홉 집계 값은 각 위치를 구분할 수 있습니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 실행·검증: 실제 카드의 링크·표시 값을 읽습니다.
  const cards = [...html.matchAll(/<a href="([^"]+)"><div[^>]*data-slot="card"[\s\S]*?<p[^>]*>([^<]+)<\/p><p[^>]*>([^<]+)<\/p>/g)]
    .map((match) => match.slice(1));
  expect(cards).toEqual([
    ["/admin/application-forms", "검토 대기 지원서", "2건"], ["/admin/users", "승인 대기 회원", "3명"],
    ["/admin/recruitment", "기수", "5"], ["/admin/users", "회원", "1,014"],
    ["/admin/application-forms", "지원서", "13"], ["/admin/notices", "공지사항", "6"],
    ["/admin/press", "언론보도", "7"], ["/admin/gallery", "갤러리", "8"], ["/admin/alumni", "수료생 이야기", "9"],
  ]);
});

it("주의 카드의 전체 지원서와 회원 수를 유지한다", async () => {
  // 준비·실행: 실제 페이지의 주의 카드를 렌더링합니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 검증: 두 분모도 서로 다른 값으로 고정합니다.
  expect([...html.matchAll(/전체 ([^<]+) 중/g)].map((match) => match[1])).toEqual(["13건", "1014명"]);
});

it("바로가기의 전체 링크와 표시 순서를 유지한다", async () => {
  // 준비·실행: 실제 페이지의 바로가기 링크를 렌더링합니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 검증: 아이콘 뒤 span이 있는 바로가기만 비교합니다.
  const container = document.createElement("div");
  container.innerHTML = html;
  expect([...container.querySelectorAll("a")].filter((link) => link.querySelector("span"))
    .map((link) => [link.getAttribute("href"), link.querySelector("span")?.textContent])).toEqual([
    ["/admin/faculty", "교수진"], ["/admin/recruitment", "기수 관리"], ["/admin/application-forms", "지원서 관리"],
    ["/admin/recruitment-settings", "모집 설정"], ["/admin/notices", "공지사항"], ["/admin/press", "언론보도"],
    ["/admin/gallery", "갤러리"], ["/admin/alumni", "수료생 이야기"], ["/admin/faq", "FAQ"],
    ["/admin/resources", "자료실"], ["/admin/users", "회원 관리"],
  ]);
});

it.each([[0, 0], [2, 0], [0, 3], [2, 3]])("대기 지원서 %i·회원 %i일 때만 해당 주의 항목을 표시한다", async (submissions, users) => {
  // 준비: 두 대기 집계의 모든 조합을 구분합니다.
  mocks.counts[0] = submissions; mocks.counts[2] = users;
  // 실행: 서버 페이지를 렌더링합니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 검증: 구역과 개별 카드 조건을 함께 비교합니다.
  expect([html.includes("확인 필요"), html.includes("검토 대기 지원서"), html.includes("승인 대기 회원")])
    .toEqual([submissions > 0 || users > 0, submissions > 0, users > 0]);
});

it.each(Array.from({ length: 9 }, (_, index) => index))("조회 %i 거부는 정확한 오류 카드를 반환한다", async (index) => {
  // 준비: Promise.all의 각 위치가 개별적으로 거부됩니다.
  mocks.failureIndex = index;
  // 실행: 오류를 처리한 페이지를 렌더링합니다.
  const html = renderToStaticMarkup(await AdminDashboardPage());
  // 검증: 정상 화면 없이 기존 오류 HTML 전체를 유지합니다.
  expect(html).toBe('<div class="space-y-4 p-2"><h1 class="text-xl font-semibold text-slate-900">대시보드</h1><div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center"><p class="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p><p class="mt-1 text-xs text-red-600">데이터베이스 연결을 확인해 주세요.</p></div></div>');
});

it.each(Array.from({ length: 9 }, (_, index) => index))("조회 %i 거부는 같은 경로와 오류 객체를 기록한다", async (index) => {
  // 준비: 각 DB 거부에 같은 합성 오류 객체를 사용합니다.
  mocks.failureIndex = index;
  // 실행: 페이지의 catch 경계를 통과합니다.
  await AdminDashboardPage();
  // 검증: 호출 수·인수 개수·오류 객체를 그대로 보존합니다.
  expect(mocks.logServerError.mock.calls).toEqual([["admin/dashboard", mocks.error]]);
});

it("웹 인가 거부는 페이지 catch 밖에서 전파하고 DB에 접근하지 않는다", async () => {
  // 준비: requireAdmin 자체가 거부합니다.
  mocks.requireAdmin.mockRejectedValue(mocks.error);
  // 실행·검증: 오류 카드로 삼키지 않고 거부를 전파합니다.
  await expect(AdminDashboardPage()).rejects.toBe(mocks.error);
  expect([mocks.select.mock.calls, mocks.logServerError.mock.calls]).toEqual([[], []]);
});
