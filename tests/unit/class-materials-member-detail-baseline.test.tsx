/** 변경하지 않은 회원 상세의 SQL 대상 필터·인가·원본 URL 비노출을 고정합니다. */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireMember: vi.fn(), select: vi.fn(), where: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/member", () => ({ requireMember: mocks.requireMember }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page, { generateMetadata } from "@/app/(member)/resources/class-materials/[id]/page";
const id = "11111111-1111-4111-8111-111111111111";
const params = Promise.resolve({ id });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireMember.mockResolvedValue({ user: { id: "member-1", role: "MEMBER" } });
  mocks.select.mockReturnValue({ from: () => ({ where: mocks.where }) });
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.limit.mockResolvedValue([{ id, title: "합성 강의", audience: "STUDENT", fileName: "합성.pdf",
    weekNumber: 2, lectureTitle: null, fileUrl: "https://fixture.invalid/secret.pdf" }]);
});
it.each([
  { role: "MEMBER", audiences: ["STUDENT"] },
  { role: "FACULTY", audiences: ["STUDENT", "FACULTY"] },
  { role: "ADMIN", audiences: ["STUDENT", "FACULTY"] },
])("$role의 상세와 메타데이터는 SQL 대상 조건을 유지한다", async ({ role, audiences }) => {
  // 준비: 검증된 세션 역할입니다.
  mocks.requireMember.mockResolvedValue({ user: { id: "member-1", role } });
  // 실행: 상세와 메타데이터는 각각 인가합니다.
  const html = renderToStaticMarkup(await Page({ params }));
  expect(await generateMetadata({ params })).toEqual({ title: "합성 강의 — 강의 자료" });
  // 검증: 원본 URL 대신 인증 다운로드 경로만 표시됩니다.
  expect(mocks.requireMember).toHaveBeenCalledTimes(2);
  for (const [condition] of mocks.where.mock.calls) {
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"class_materials"."audience" in');
    expect(query.params).toEqual([id, ...audiences]);
  }
  expect(html).toContain(`/api/resources/class-materials/${id}/download`);
  expect(html).not.toContain("fixture.invalid");
});
it("승인 대기는 DB 접근 전 기존 회원 인가에서 차단된다", async () => {
  // 준비: 실제 requireMember의 승인 대기 이동을 재현합니다.
  mocks.requireMember.mockRejectedValue(new Error("REDIRECT:/pending"));
  // 실행·검증: Page와 메타데이터 모두 DB를 열지 않습니다.
  await expect(Page({ params })).rejects.toThrow("REDIRECT:/pending");
  await expect(generateMetadata({ params })).rejects.toThrow("REDIRECT:/pending");
  expect(mocks.select).not.toHaveBeenCalled();
});
it("없는 자료는 notFound와 기본 메타데이터를 유지한다", async () => {
  // 준비: SQL 조회 결과가 없습니다.
  mocks.limit.mockResolvedValue([]);
  // 실행·검증: 교수 자료를 못 읽는 회원도 같은 결과를 받습니다.
  await expect(Page({ params })).rejects.toThrow("NOT_FOUND");
  expect(await generateMetadata({ params })).toEqual({ title: "강의 자료" });
});
it("잘못된 UUID는 세션 확인 뒤 DB 조회 전에 차단된다", async () => {
  // 준비·실행: 형식이 잘못된 경로 ID입니다.
  await expect(Page({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow("NOT_FOUND");
  // 검증: SQL 캐스트 오류로 노출되지 않습니다.
  expect(mocks.requireMember).toHaveBeenCalledOnce();
  expect(mocks.select).not.toHaveBeenCalled();
});
