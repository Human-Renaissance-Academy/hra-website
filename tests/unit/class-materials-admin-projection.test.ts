/** 새 저장소 조회의 정확한 열 투영을 고정합니다. HEAD에는 의도적으로 없는 새 경계 계약입니다. */
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { classMaterials: { findFirst: mocks.findFirst } } } }));
import { getMaterial, getMutationTarget } from "@/features/class-materials/admin/repository";
beforeEach(() => vi.resetAllMocks());
it.each([
  { name: "편집", run: getMaterial, columns: ["title", "weekNumber", "lectureTitle", "audience", "fileName"] },
  { name: "변경 전 조회", run: getMutationTarget, columns: ["fileUrl", "classDate"] },
])("$name는 필요한 열만 읽는다", async ({ run, columns }) => {
  // 준비·실행: 합성 ID로 저장소 조회를 실행합니다.
  await run("11111111-1111-4111-8111-111111111111");
  // 검증: 필드 누락이나 내부 열 추가는 모두 실패합니다.
  expect(Object.keys(mocks.findFirst.mock.calls[0][0].columns)).toEqual(columns);
  expect(Object.values(mocks.findFirst.mock.calls[0][0].columns)).toEqual(columns.map(() => true));
});
