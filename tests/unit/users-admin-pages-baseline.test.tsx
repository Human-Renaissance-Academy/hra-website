// @vitest-environment node
/** 회원 관리자 페이지의 원본 투영·병렬 조회·오류 처리 비대칭을 검증합니다. */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";
import { users, cohorts } from "@/lib/db/schema";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), select: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/app/(admin)/admin/users/_components/user-role-button", () => ({ UserGroupButton: () => null, UserRoleButton: () => null }));
import ListPage from "@/app/(admin)/admin/users/page";
import DetailPage from "@/app/(admin)/admin/users/[id]/page";
import { UserGroupButton, UserRoleButton } from "@/app/(admin)/admin/users/_components/user-role-button";

const id = "10000000-0000-4000-8000-000000000002";
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const row = { id, name: "합성 회원", email: "member@qa.invalid", role: "MEMBER", cohortId: cohort, image: null,
  createdAt: new Date(0), updatedAt: new Date(1), hasPassword: true };
const cohortList = [{ id: cohort, name: "20기" }];
const dialect = new PgDialect();
const listKeys = ["id", "name", "email", "role", "cohortId", "image", "createdAt"];

/** 클라이언트 경계를 실행하지 않고 React 트리에서 전달한 props를 확인합니다. */
function boundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = boundary<Props>(child, component);
    if (found) return found;
  }
}

/** 조회 순서와 SQL을 실제 Drizzle 표현식으로 비교하며 완료는 합성 promise로 제어합니다. */
function queries(detail: boolean, userRows: Promise<unknown[]> = Promise.resolve([row]), cohortRows = Promise.resolve(cohortList)) {
  let started: () => void = () => { throw new Error("신호 준비 전"); };
  const entered = new Promise<void>(resolve => { started = resolve; });
  mocks.select.mockImplementationOnce((projection) => {
    expect(Object.keys(projection)).toEqual(detail ? [...listKeys, "updatedAt", "hasPassword"] : listKeys);
    for (const key of listKeys) expect(projection[key]).toBe(Reflect.get(users, key));
    if (detail) expect(dialect.sqlToQuery(projection.hasPassword).sql).toBe('"users"."password_hash" is not null');
    return { from: (table: unknown) => {
      expect(table).toBe(users);
      return detail ? { where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        expect(dialect.sqlToQuery(condition).params).toEqual([id]);
        return { limit: (limit: number) => { expect(limit).toBe(1); return userRows; } };
      } } : { orderBy: (order: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        expect(dialect.sqlToQuery(order).sql).toBe('"users"."created_at" desc');
        return userRows;
      } };
    } };
  }).mockImplementationOnce((projection) => {
    expect(Object.keys(projection)).toEqual(["id", "name"]);
    expect(projection).toEqual({ id: cohorts.id, name: cohorts.name });
    return { from: (table: unknown) => {
      expect(table).toBe(cohorts);
      return { orderBy: (order: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        expect(dialect.sqlToQuery(order)).toEqual(dialect.sqlToQuery(cohortNumberDesc(cohorts.name)));
        started();
        return cohortRows;
      } };
    } };
  });
  return entered;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
});

it.each([false, true])("상세 여부 %s: 정확한 조회 열과 클라이언트 props만 전달한다", async detail => {
  // 준비: 내부 인증 열이 존재하더라도 클라이언트 props로 전달하지 않습니다.
  queries(detail, Promise.resolve([{ ...row, passwordHash: "비공개", sessionVersion: 7, tokens: "비공개" }]));
  // 실행: 두 페이지의 실제 반환 트리를 검사합니다.
  const page = await (detail ? DetailPage({ params: Promise.resolve({ id }) }) : ListPage());
  // 검증: 인가가 조회보다 먼저이며 경계 props에는 행 전체가 없습니다.
  expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  const component = detail ? UserRoleButton : UserGroupButton;
  const button = boundary<ComponentProps<typeof UserGroupButton>>(page, component);
  expect(button?.props).toEqual({ userId: id, currentRole: "MEMBER", currentCohortId: cohort, cohorts: cohortList });
  expect(Object.keys(button?.props ?? {})).toEqual(["userId", "currentRole", "currentCohortId", "cohorts"]);
  expect(Object.keys(button?.props.cohorts[0] ?? {})).toEqual(["id", "name"]);
  expect(renderToStaticMarkup(page)).not.toMatch(/비공개|passwordHash|sessionVersion|tokens/);
});

it.each([false, true])("상세 여부 %s: 사용자 조회가 미완료여도 기수 조회를 시작한다", async detail => {
  // 준비: 사용자 조회만 완료를 보류합니다.
  let finish: (value: unknown[]) => void = () => { throw new Error("준비 전"); };
  const pendingRows = new Promise<unknown[]>(resolve => { finish = resolve; });
  const entered = queries(detail, pendingRows);
  // 실행: 사용자 완료 전 두 select가 모두 시작되어야 합니다.
  const pending = detail ? DetailPage({ params: Promise.resolve({ id }) }) : ListPage();
  await entered;
  expect(mocks.select).toHaveBeenCalledTimes(2);
  finish([row]);
  // 검증: 병렬 조회를 마치면 페이지가 완성됩니다.
  expect(await pending).toBeTruthy();
});

it("목록의 사용자 조회 실패만 안내와 정해진 로그로 처리한다", async () => {
  // 준비: 사용자 조회만 실패하며 기수는 정상입니다.
  const error = new Error("합성 조회 실패");
  queries(false, Promise.reject(error));
  // 실행·검증: 사용자 오류는 페이지에서 처리합니다.
  const html = renderToStaticMarkup(await ListPage());
  expect(html).toContain("데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.");
  expect(mocks.log.mock.calls).toEqual([["admin/users", error]]);
});

it("목록의 기수 조회 실패는 사용자 조회 catch 밖에서 전파한다", async () => {
  // 준비: 기수 조회만 실패합니다.
  queries(false, Promise.resolve([row]), Promise.reject(new Error("기수 오류")));
  // 실행·검증: 사용자 오류 안내나 로그로 변환하지 않습니다.
  await expect(ListPage()).rejects.toThrow("기수 오류");
  expect(mocks.log).not.toHaveBeenCalled();
});

it("상세의 잘못된 UUID는 어떤 조회보다 먼저 notFound로 종료한다", async () => {
  // 준비·실행: DB 캐스팅에 도달하지 않는 입력입니다.
  await expect(DetailPage({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("NOT_FOUND");
  // 검증: 조회는 한 번도 시작하지 않습니다.
  expect(mocks.select).not.toHaveBeenCalled();
});

it("상세의 없는 사용자는 기수와 함께 조회한 뒤 notFound로 종료한다", async () => {
  // 준비: 사용자 행만 없습니다.
  queries(true, Promise.resolve([]));
  // 실행·검증: 두 조회 뒤 누락 결과를 고정합니다.
  await expect(DetailPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NOT_FOUND");
  expect(mocks.select).toHaveBeenCalledTimes(2);
});
