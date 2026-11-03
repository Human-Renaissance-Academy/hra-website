/**
 * #271 지원 양식 공개 목록의 빈 상태·행 순서·링크·오류 전파를 DB 경계 이동 전에 고정합니다.
 * 합성 공개 양식만 렌더링하며 상세 질문·제출 액션·운영 DB는 호출하지 않습니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  select: vi.fn(),
  rows: [] as Array<{ id: string; title: string; description: string | null }>,
  failure: null as Error | null,
}));

vi.mock("@/lib/db", () => ({ db: {
  query: { applicationForms: { findMany: mocks.findMany } },
  select: mocks.select,
} }));

import RecruitmentApplyPage, { dynamic } from "@/app/(public)/recruitment/apply/page";

const first = { id: "11111111-1111-4111-8111-111111111111", title: "최근 공개 양식", description: "최근 양식 안내" };
const second = { id: "22222222-2222-4222-8222-222222222222", title: "이전 공개 양식", description: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows = [];
  mocks.failure = null;
  const result = () => mocks.failure ? Promise.reject(mocks.failure) : Promise.resolve(mocks.rows);
  mocks.findMany.mockImplementation(result);
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ orderBy: result }) }) }));
});

it("동적 공개 목록이 비었으면 공개 양식 없음과 외부 접수 확인 경로를 안내한다", async () => {
  expect(dynamic).toBe("force-dynamic");
  const html = renderToStaticMarkup(await RecruitmentApplyPage());
  expect(html).toContain("현재 공개된 홈페이지 지원서 양식이 없습니다.");
  expect(html).toContain('href="/recruitment#apply-channels"');
  expect(html).toContain("홈페이지 공지사항에서 새로운 모집 소식을 확인해주세요.");
  expect(html).not.toContain("지원서 작성하기");
});

it("조회된 공개 양식을 순서대로 제목·설명·상세 링크와 함께 표시한다", async () => {
  mocks.rows = [first, second];
  const html = renderToStaticMarkup(await RecruitmentApplyPage());
  expect(html.indexOf(first.title)).toBeLessThan(html.indexOf(second.title));
  expect(html).toContain(first.description);
  expect(html).toContain(`href="/recruitment/apply/${first.id}"`);
  expect(html).toContain(`href="/recruitment/apply/${second.id}"`);
  expect((html.match(/접수 중/g) ?? [])).toHaveLength(2);
  expect(html).not.toContain("현재 공개된 홈페이지 지원서 양식이 없습니다.");
});

it("DB 조회 실패를 빈 목록으로 바꾸지 않고 상위 오류 경계로 전달한다", async () => {
  const failure = new Error("합성 목록 DB 오류");
  mocks.failure = failure;
  await expect(RecruitmentApplyPage()).rejects.toBe(failure);
});
