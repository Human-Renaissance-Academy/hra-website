import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ title: vi.fn(), detail: vi.fn() }));
vi.mock("@/features/class-materials/web/repository", () => ({
  findWebClassMaterialTitle: repo.title,
  findWebClassMaterialDetail: repo.detail,
}));

import { getWebClassMaterialTitle, getWebClassMaterialDetail } from "@/features/class-materials/web/service";

const member = { id: "11111111-1111-4111-8111-111111111111", role: "MEMBER" };
const uuid = "22222222-2222-4222-8222-222222222222";

describe("강의 자료 Web 서비스 인가 및 표시 데이터", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repo.title.mockResolvedValue("합성 강의자료");
    repo.detail.mockResolvedValue({
      id: uuid, title: "합성 강의자료", audience: "STUDENT",
      fileName: "synthetic.pdf", weekNumber: 1, lectureTitle: "기업실무",
    });
  });

  it.each(["ADMIN", "FACULTY", "MEMBER"])("%s의 승인 세션은 repository에 권한 조건을 함께 전달", async role => {
    const user = { ...member, role };
    expect(await getWebClassMaterialTitle(user, uuid)).toBe("합성 강의자료");
    expect(await getWebClassMaterialDetail(user, uuid)).toMatchObject({ title: "합성 강의자료" });
    expect(repo.title).toHaveBeenCalledWith(user, uuid);
    expect(repo.detail).toHaveBeenCalledWith(user, uuid);
  });

  it.each([undefined, null, { ...member, role: "PENDING" },
    { ...member, role: "UNKNOWN" }, { id: "", role: "MEMBER" }])(
    "승인되지 않은 사용자 %s는 DB 호출 전에 거부", async user => {
      expect(await getWebClassMaterialTitle(user, uuid)).toBeNull();
      expect(await getWebClassMaterialDetail(user, uuid)).toBeNull();
      expect(repo.title).not.toHaveBeenCalled();
      expect(repo.detail).not.toHaveBeenCalled();
    },
  );

  it.each(["", "not-a-uuid", "11111111-1111-1111-1111-111111111111",
    "22222222-2222-4222-8222-222222222222' OR TRUE"])(
    "손상된 경로 파라미터 %s는 DB 이전에 거부", async id => {
      expect(await getWebClassMaterialDetail(member, id)).toBeNull();
      expect(await getWebClassMaterialTitle(member, id)).toBeNull();
      expect(repo.detail).not.toHaveBeenCalled();
      expect(repo.title).not.toHaveBeenCalled();
    },
  );

  it("제목 메타데이터는 본문 상세를 조회하지 않는다", async () => {
    expect(await getWebClassMaterialTitle(member, uuid)).toBe("합성 강의자료");
    expect(repo.detail).not.toHaveBeenCalled();
  });

  it("DB에서 행이 보이지 않으면 존재·역할 구분 정보 없이 null 반환", async () => {
    repo.title.mockResolvedValueOnce(null);
    repo.detail.mockResolvedValueOnce(null);
    expect(await getWebClassMaterialTitle(member, uuid)).toBeNull();
    expect(await getWebClassMaterialDetail(member, uuid)).toBeNull();
  });
});
