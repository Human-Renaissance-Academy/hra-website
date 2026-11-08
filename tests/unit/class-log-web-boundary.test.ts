import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  title: vi.fn(),
  detail: vi.fn(),
  printable: vi.fn(),
  increment: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/features/class-logs/web/repository", () => ({
  findWebClassLogTitle: mock.title,
  findWebClassLogDetail: mock.detail,
  findWebClassLogPrintable: mock.printable,
  incrementWebClassLogViewCount: mock.increment,
}));
vi.mock("@/lib/errors", () => ({ logServerError: mock.error }));

import {
  getWebClassLogTitle,
  getWebClassLogDetail,
  getWebClassLogPrintable,
  recordWebClassLogRead,
} from "@/features/class-logs/web/service";

const id = "11111111-1111-4111-8111-111111111111";
const when = new Date("2026-11-08T00:00:00Z");

describe("수업일지 Web Application Service 권한·조회 분리", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.title.mockResolvedValue("기업실무 수업일지");
    mock.detail.mockResolvedValue({
      log: { id, title: "기업실무 수업일지", content: "# 본문",
        classDate: when, viewCount: 3, authorName: "교수" },
      images: [{ id, alt: "사진", order: 1 }],
    });
    mock.printable.mockResolvedValue({
      id, title: "기업실무 수업일지", content: "# 본문",
      classDate: when, authorName: "교수",
    });
    mock.increment.mockResolvedValue(undefined);
  });

  it.each(["MEMBER", "FACULTY", "ADMIN"])("%s는 공동 수업일지 상세·인쇄를 읽는다", async role => {
    expect(await getWebClassLogTitle(role, id)).toBe("기업실무 수업일지");
    expect((await getWebClassLogDetail(role, id))?.log.content).toBe("# 본문");
    expect((await getWebClassLogPrintable(role, id))?.title).toBe("기업실무 수업일지");
  });

  it.each(["PENDING", "UNKNOWN", null, undefined])("%s는 모든 DB 조회와 조회수 증가 전에 차단", async role => {
    expect(await getWebClassLogTitle(role, id)).toBeNull();
    expect(await getWebClassLogDetail(role, id)).toBeNull();
    expect(await getWebClassLogPrintable(role, id)).toBeNull();
    recordWebClassLogRead(role, id);
    expect(mock.title).not.toHaveBeenCalled();
    expect(mock.detail).not.toHaveBeenCalled();
    expect(mock.printable).not.toHaveBeenCalled();
    expect(mock.increment).not.toHaveBeenCalled();
  });

  it("메타데이터 제목 조회는 본문·이미지 및 조회수 증가를 실행하지 않는다", async () => {
    expect(await getWebClassLogTitle("MEMBER", id)).toBe("기업실무 수업일지");
    expect(mock.title).toHaveBeenCalledWith(id);
    expect(mock.detail).not.toHaveBeenCalled();
    expect(mock.printable).not.toHaveBeenCalled();
    expect(mock.increment).not.toHaveBeenCalled();
  });

  it("인쇄는 제목·본문·수업일·작성자 전용 조회만 실행한다", async () => {
    expect((await getWebClassLogPrintable("MEMBER", id))?.content).toBe("# 본문");
    expect(mock.printable).toHaveBeenCalledWith(id);
    expect(mock.detail).not.toHaveBeenCalled();
    expect(mock.increment).not.toHaveBeenCalled();
  });

  it("실제 승인 상세에서만 조회수를 원자 증가시키는 port를 호출한다", () => {
    recordWebClassLogRead("MEMBER", id);
    expect(mock.increment).toHaveBeenCalledWith(id);
    expect(mock.increment).toHaveBeenCalledTimes(1);
  });

  it("조회수 비동기 증가 실패의 원본 오류는 정제 로깅 헬퍼에만 전달한다", async () => {
    const failure = new Error("synthetic-storage-secret");
    mock.increment.mockRejectedValueOnce(failure);
    recordWebClassLogRead("MEMBER", id);
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.error).toHaveBeenCalledWith("member/resources/viewCount", failure, { id });
  });

  it("없는 수업일지에 대해 목록/인쇄 데이터를 위조하지 않는다", async () => {
    mock.detail.mockResolvedValueOnce(null);
    mock.printable.mockResolvedValueOnce(null);
    expect(await getWebClassLogDetail("MEMBER", id)).toBeNull();
    expect(await getWebClassLogPrintable("MEMBER", id)).toBeNull();
  });
});
