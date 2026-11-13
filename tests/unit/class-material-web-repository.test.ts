import { beforeEach, describe, expect, it, vi } from "vitest";

const dbCalls = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { select: dbCalls.select } }));

import {
  findWebClassMaterialTitle,
  findWebClassMaterialDetail,
} from "@/features/class-materials/web/repository";

const user = { id: "11111111-1111-4111-8111-111111111111", role: "MEMBER" };
const id = "22222222-2222-4222-8222-222222222222";

describe("강의 자료 Web DB 투영 최소화", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbCalls.select.mockImplementation(() => ({ from: dbCalls.from }));
    dbCalls.from.mockImplementation(() => ({ where: dbCalls.where }));
    dbCalls.where.mockImplementation(() => ({ limit: dbCalls.limit }));
  });

  it("인가된 메타데이터 조회는 파일명·파일 URL·본문 없이 title 한 열만 읽는다", async () => {
    dbCalls.limit.mockResolvedValueOnce([{ title: "가이드" }]);
    expect(await findWebClassMaterialTitle(user, id)).toBe("가이드");
    expect(Object.keys(dbCalls.select.mock.calls[0][0])).toEqual(["title"]);
    expect(dbCalls.where).toHaveBeenCalledTimes(1);
  });

  it("상세 조회에서는 실제 화면에 필요한 필드만 읽고 private Blob URL을 조회하지 않는다", async () => {
    dbCalls.limit.mockResolvedValueOnce([
      {
        id,
        title: "가이드",
        fileName: "a.pdf",
        audience: "STUDENT",
        weekNumber: null,
        lectureTitle: null,
      },
    ]);
    expect(await findWebClassMaterialDetail(user, id)).toMatchObject({
      id,
      title: "가이드",
      fileName: "a.pdf",
      audience: "STUDENT",
    });
    const selection = dbCalls.select.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(selection).sort()).toEqual(
      ["id", "title", "fileName", "audience", "weekNumber", "lectureTitle"].sort(),
    );
    expect(selection).not.toHaveProperty("fileUrl");
    expect(selection).not.toHaveProperty("uploadedById");
    expect(dbCalls.where).toHaveBeenCalledTimes(1);
  });

  it("자료가 없거나 audience SQL predicate에 의해 제외된 결과는 null", async () => {
    dbCalls.limit.mockResolvedValueOnce([]);
    expect(await findWebClassMaterialDetail(user, id)).toBeNull();
    dbCalls.limit.mockResolvedValueOnce([]);
    expect(await findWebClassMaterialTitle(user, id)).toBeNull();
  });
});
