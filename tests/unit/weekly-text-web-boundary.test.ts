import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  title: vi.fn(),
  detail: vi.fn(),
  printable: vi.fn(),
}));
vi.mock("@/features/weekly-texts/web/repository", () => ({
  findWebWeeklyTextTitle: repository.title,
  findWebWeeklyTextDetail: repository.detail,
  findWebWeeklyTextPrintable: repository.printable,
}));

import {
  getWebWeeklyTextTitle,
  getWebWeeklyTextDetail,
  getWebWeeklyTextPrintable,
} from "@/features/weekly-texts/web/service";

const id = "11111111-1111-4111-8111-111111111111";

describe("주차별 텍스트 Web 상세·인쇄 Application Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.title.mockResolvedValue("기업실무 2주차");
    repository.detail.mockResolvedValue({
      id, title: "기업실무 2주차", hasFile: true, fileName: "자료.pdf",
      body: "# 안내", cohortName: "19기", textType: "기업실무",
      createdAt: new Date("2026-11-08T00:00:00Z"), images: [{ id, alt: null, order: 0 }],
    });
    repository.printable.mockResolvedValue({
      id, title: "기업실무 2주차", body: "# 안내",
      createdAt: new Date("2026-11-08T00:00:00Z"), cohortName: "19기", textType: "기업실무",
    });
  });

  it.each(["ADMIN", "FACULTY", "MEMBER"])("승인 역할 %s는 기수와 무관한 공동 자료 열람을 유지한다", async role => {
    expect(await getWebWeeklyTextTitle(role, id)).toBe("기업실무 2주차");
    expect((await getWebWeeklyTextDetail(role, id))?.cohortName).toBe("19기");
    expect((await getWebWeeklyTextPrintable(role, id))?.body).toBe("# 안내");
  });

  it.each(["PENDING", "UNKNOWN", null, undefined])("%s는 저장소 조회 이전에 차단한다", async role => {
    expect(await getWebWeeklyTextTitle(role, id)).toBeNull();
    expect(await getWebWeeklyTextDetail(role, id)).toBeNull();
    expect(await getWebWeeklyTextPrintable(role, id)).toBeNull();
    expect(repository.title).not.toHaveBeenCalled();
    expect(repository.detail).not.toHaveBeenCalled();
    expect(repository.printable).not.toHaveBeenCalled();
  });

  it("상세가 없거나 인쇄할 본문이 없더라도 서비스가 데이터를 만들어 내지 않는다", async () => {
    repository.detail.mockResolvedValueOnce(null);
    repository.printable.mockResolvedValueOnce(null);
    expect(await getWebWeeklyTextDetail("MEMBER", id)).toBeNull();
    expect(await getWebWeeklyTextPrintable("MEMBER", id)).toBeNull();
  });

  it("메타데이터는 제목만 조회하며 본문·이미지 조회를 시작하지 않는다", async () => {
    expect(await getWebWeeklyTextTitle("MEMBER", id)).toBe("기업실무 2주차");
    expect(repository.title).toHaveBeenCalledWith(id);
    expect(repository.detail).not.toHaveBeenCalled();
    expect(repository.printable).not.toHaveBeenCalled();
  });

  it("인쇄는 전용 저장소 조회만 사용한다", async () => {
    expect((await getWebWeeklyTextPrintable("MEMBER", id))?.body).toBe("# 안내");
    expect(repository.printable).toHaveBeenCalledWith(id);
    expect(repository.detail).not.toHaveBeenCalled();
  });
});
