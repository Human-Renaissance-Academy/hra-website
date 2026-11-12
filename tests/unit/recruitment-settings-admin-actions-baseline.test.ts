// @vitest-environment node
/** 모집 설정 웹 액션의 조회 투영·검증·포스터 순서·저장 대기를 원래 DB 경계에서 고정합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { recruitmentSettings } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), select: vi.fn(), limit: vi.fn(), orderBy: vi.fn(),
  values: vi.fn(), upsert: vi.fn(), revalidate: vi.fn(), prepare: vi.fn(), log: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select,
  insert: () => ({ values: mocks.values }),
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/poster-upload-server", () => ({ prepareStoredPoster: mocks.prepare }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import {
  getCohorts, getRecruitmentSettings, updateRecruitmentSettings,
  updateRecruitmentInfo, updateRecruitmentPoster, updateRecruitmentDetails,
} from "@/features/recruitment-settings/actions";

/** 폼은 합성 URL과 기존과 다른 입력값을 사용합니다. */
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
  mocks.select.mockReturnValue({ from: () => ({ limit: mocks.limit, orderBy: mocks.orderBy }) });
  mocks.limit.mockResolvedValue([{ posterImageUrl: "https://old.invalid/poster.png" }]);
  mocks.orderBy.mockResolvedValue([{ id: "cohort-1", name: "합성 기수" }]);
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.upsert.mockResolvedValue([]);
  mocks.prepare.mockResolvedValue("https://stored.invalid/poster.webp");
});

const writes = [
  ["전체", updateRecruitmentSettings, "모집 설정을 저장했습니다."],
  ["정보", updateRecruitmentInfo, "현재 모집 정보를 저장했습니다."],
  ["포스터", updateRecruitmentPoster, "모집 포스터를 저장했습니다."],
  ["안내", updateRecruitmentDetails, "모집 세부 안내를 저장했습니다."],
] as const;
const posters = [updateRecruitmentSettings, updateRecruitmentPoster] as const;

describe("모집 설정 변경 전후 기준", () => {
  it("전체 설정 조회는 화면 필드만 투영하고 내부 열은 반환하지 않는다", async () => {
    // 준비: 화면 필드와 내부 열이 함께 있는 기존 조회 행입니다.
    const visible = {
      activeCohortId: "cohort-1", googleFormUrl: "https://example.com/form",
      recruitmentStartDate: new Date("2026-01-01T00:00:00Z"), posterImageUrl: null,
      deadlineDate: new Date("2026-02-01T00:00:00Z"), detailsMarkdown: "안내", posterLayout: "left",
    };
    const row = {
      ...visible, id: "settings-1", singletonKey: 1, recruitmentStatus: "OPEN",
      nextRecruitmentYear: 2027, nextRecruitmentMonth: 3, qualificationText: "기존 필드", updatedAt: new Date(),
    };
    mocks.limit.mockResolvedValue([row]);
    // 실행: 관리자 조회입니다.
    const result = await getRecruitmentSettings();
    // 확인: 전체 행 조회와 limit은 보존하되 응답은 화면 필드만 담습니다.
    expect(result).toStrictEqual(visible);
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(1);
    expect(mocks.admin).toHaveBeenCalledOnce();
  });

  it("설정이 없으면 조회가 기본행을 만들지 않고 null을 반환한다", async () => {
    // 준비
    mocks.limit.mockResolvedValue([]);
    // 실행
    const result = await getRecruitmentSettings();
    // 확인
    expect(result).toBeNull();
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("기수는 ID·이름만 순서와 생성일 역순으로 조회한다", async () => {
    // 준비
    const dialect = new PgDialect();
    // 실행
    const result = await getCohorts();
    // 확인
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["id", "name"]);
    expect(mocks.orderBy.mock.calls[0].map(sql => dialect.sqlToQuery(sql).sql))
      .toEqual(['"cohorts"."order" desc', '"cohorts"."created_at" desc']);
    expect(result).toEqual([{ id: "cohort-1", name: "합성 기수" }]);
    expect(mocks.admin).toHaveBeenCalledOnce();
  });

  it.each(writes)("%s 저장은 DB 확정 후에만 경로를 순서대로 재검증한다", async (_name, action, message) => {
    // 준비: DB 진입과 완료를 별도의 신호로 제어합니다.
    const entered = Promise.withResolvers<void>();
    const persistence = Promise.withResolvers<unknown[]>();
    mocks.upsert.mockImplementation(() => { entered.resolve(); return persistence.promise; });
    // 실행
    const pending = action(form({ posterInputMode: "url", detailsMarkdown: " 합성 안내 " }));
    await entered.promise;
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    // 확인: 미완료 저장은 캐시를 무효화하지 않습니다.
    expect(mocks.revalidate).not.toHaveBeenCalled();
    persistence.resolve([]);
    expect(await pending).toEqual({ success: true, message });
    expect(mocks.revalidate.mock.calls).toEqual([["/recruitment"], ["/admin/recruitment-settings"]]);
    expect(mocks.values.mock.calls[0][0].singletonKey).toBe(1);
    expect(mocks.upsert.mock.calls[0][0].target).toBe(recruitmentSettings.singletonKey);
  });

  it.each([updateRecruitmentSettings, updateRecruitmentInfo])("정보 저장은 UTC 날짜를 쓰고 입력 상태를 저장하지 않는다", async action => {
    // 준비
    const data = form({ posterInputMode: "url", recruitmentStatus: "CLOSED", recruitmentStartDate: "2026-03-20", deadlineDate: "2026-03-21" });
    // 실행
    await action(data);
    // 확인
    expect(mocks.upsert.mock.calls[0][0].set).toMatchObject({
      activeCohortId: null, googleFormUrl: null,
      recruitmentStartDate: new Date("2026-03-20T00:00:00Z"), deadlineDate: new Date("2026-03-21T00:00:00Z"),
    });
    expect(mocks.upsert.mock.calls[0][0].set).not.toHaveProperty("recruitmentStatus");
  });

  it.each([
    [updateRecruitmentInfo, { googleFormUrl: "http://form.invalid" }, "googleFormUrl", "구글폼 URL은 https://로 시작해야 합니다."],
    [updateRecruitmentInfo, { recruitmentStartDate: "2026-03-22", deadlineDate: "2026-03-21" }, "deadlineDate", "모집 종료일은 시작일 이후여야 합니다."],
    [updateRecruitmentPoster, { posterInputMode: "url", posterImageUrl: "ftp://poster.invalid" }, "posterImageUrl", "포스터 URL은 http:// 또는 https://로 시작해야 합니다."],
    [updateRecruitmentDetails, { detailsMarkdown: "가".repeat(20001) }, "detailsMarkdown", "세부 안내는 20000자 이하여야 합니다."],
  ] as const)("검증 실패는 오류 상태만 반환하고 조회·저장을 하지 않는다", async (action, values, field, message) => {
    // 준비
    const data = form(values);
    // 실행
    const result = await action(data);
    // 확인
    expect(result).toEqual({ success: false, message, fieldErrors: { [field]: message } });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(posters)("직접 업로드는 기존 포스터 조회 후 소유권 확인을 마치고 저장한다", async action => {
    // 준비
    const data = form({ posterInputMode: "file", uploadedPosterUrl: "https://upload.invalid/original.png" });
    // 실행
    await action(data);
    // 확인
    expect(Object.keys(mocks.select.mock.calls[0][0])).toEqual(["posterImageUrl"]);
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith("https://upload.invalid/original.png", "admin-1");
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.values.mock.invocationCallOrder[0]);
    expect(mocks.upsert.mock.calls[0][0].set.posterImageUrl).toBe("https://stored.invalid/poster.webp");
  });

  it.each(posters)("제거는 직접 업로드보다 우선한다", async action => {
    // 준비
    const data = form({ posterInputMode: "file", removePoster: "true", uploadedPosterUrl: "https://upload.invalid/original.png" });
    // 실행
    await action(data);
    // 확인
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.upsert.mock.calls[0][0].set.posterImageUrl).toBeNull();
  });

  it.each(posters)("업로드 실패만 폼 오류로 바꾸고 DB에는 쓰지 않는다", async action => {
    // 준비
    const failure = new Error("합성 업로드 실패");
    mocks.prepare.mockRejectedValue(failure);
    // 실행
    const result = await action(form({ posterInputMode: "file", uploadedPosterUrl: "https://upload.invalid/original.png" }));
    // 확인
    expect(result).toEqual({ success: false, message: "포스터 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.", fieldErrors: { posterFile: "포스터 업로드에 실패했습니다." } });
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith("recruitment-settings/poster-upload", failure);
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
