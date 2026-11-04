// @vitest-environment node
/**
 * 강의자료·주차별 텍스트 API v1 목록·상세 경로의 HTTP 인증·입력·오류·whitelist DTO 경계를 검증합니다.
 * 실제 Application Service를 거치고 세션·현재 계정·저장소만 대체합니다. SQL 대상 필터는 격리 PostgreSQL 테스트에서 확인합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), log: vi.fn(),
  materialCount: vi.fn(), materialList: vi.fn(), materialFind: vi.fn(),
  weeklyCount: vi.fn(), weeklyList: vi.fn(), weeklyFind: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("@/features/users/me/repository", () => ({ findUserProfileById: mocks.profile }));
vi.mock("@/features/class-materials/member/repository", () => ({
  countClassMaterialsForReader: mocks.materialCount,
  listClassMaterialsForReader: mocks.materialList,
  findClassMaterialForReader: mocks.materialFind,
  findClassMaterialFileForReader: vi.fn(),
}));
vi.mock("@/features/weekly-texts/member/repository", () => ({
  countWeeklyTexts: mocks.weeklyCount,
  listWeeklyTexts: mocks.weeklyList,
  findWeeklyText: mocks.weeklyFind,
  findWeeklyTextFile: vi.fn(),
}));

import { GET as listClassMaterials } from "@/app/api/v1/resources/class-materials/route";
import { GET as getClassMaterial } from "@/app/api/v1/resources/class-materials/[id]/route";
import { GET as listWeeklyTexts } from "@/app/api/v1/resources/weekly-texts/route";
import { GET as getWeeklyText } from "@/app/api/v1/resources/weekly-texts/[id]/route";

const userId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const ownCohort = "33333333-3333-4333-8333-333333333333";
const otherCohort = "44444444-4444-4444-8444-444444444444";
const profile = { id: userId, name: "합성", email: null, role: "MEMBER", cohortId: ownCohort, image: null };
const leak = { fileUrl: "https://private.invalid/secret.pdf", uploadedById: userId, uploaderName: "업로더", createdAt: new Date() };
// 수업일은 관리자 폼의 `YYYY-MM-DDT00:00:00` 벽시계 값을 Drizzle이 UTC로 읽은 형태입니다.
const classDate = new Date("2026-10-05T00:00:00.000Z");

const materialRow = {
  id: itemId, title: "합성 강의자료", audience: "STUDENT", weekNumber: 3, lectureTitle: "고전 읽기", classDate, ...leak,
};
const weeklyRow = {
  id: itemId, title: "합성 텍스트", textType: "고전명작", classDate, cohortId: otherCohort, cohortName: "다른 기수",
  hasBody: true, hasFile: false, body: "# 본문", fileName: null, ...leak,
};

const listRequest = (path: string, query = "") => new Request(`https://qa.invalid/api/v1/resources/${path}${query}`);
const detailRequest = (path: string, query = "") => new Request(`https://qa.invalid/api/v1/resources/${path}/${itemId}${query}`);
const context = (id = itemId) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.profile.mockResolvedValue(profile);
  mocks.materialCount.mockResolvedValue(1);
  mocks.materialList.mockResolvedValue([materialRow]);
  mocks.materialFind.mockResolvedValue({ ...materialRow, fileName: "강의.pdf" });
  mocks.weeklyCount.mockResolvedValue(1);
  mocks.weeklyList.mockResolvedValue([weeklyRow]);
  mocks.weeklyFind.mockResolvedValue(weeklyRow);
});

const lists = [
  { name: "강의자료", path: "class-materials", handler: listClassMaterials, count: mocks.materialCount, list: mocks.materialList },
  { name: "주차별 텍스트", path: "weekly-texts", handler: listWeeklyTexts, count: mocks.weeklyCount, list: mocks.weeklyList },
] as const;
const details = [
  { name: "강의자료", path: "class-materials", handler: getClassMaterial, find: mocks.materialFind },
  { name: "주차별 텍스트", path: "weekly-texts", handler: getWeeklyText, find: mocks.weeklyFind },
] as const;

describe("강의자료 목록·상세 DTO", () => {
  it("MEMBER는 현재 DB 역할로 대상 필터 저장소를 호출하고 URL·업로더·작성 시각 없는 목록을 받는다", async () => {
    const response = await listClassMaterials(listRequest("class-materials"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(mocks.materialCount).toHaveBeenCalledWith({ id: userId, role: "MEMBER" });
    expect(mocks.materialList).toHaveBeenCalledWith({ id: userId, role: "MEMBER" }, 10, 0);
    const body = await response.json();
    expect(body).toEqual({
      classMaterials: [{ id: itemId, title: "합성 강의자료", audience: "STUDENT", weekNumber: 3,
        lectureTitle: "고전 읽기", classDate: "2026-10-05" }],
      page: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|fileName|uploaded|uploader|createdAt|private\.invalid/);
  });

  it("FACULTY·ADMIN은 자신의 현재 역할로 저장소 필터를 호출한다", async () => {
    for (const role of ["FACULTY", "ADMIN"] as const) {
      mocks.auth.mockResolvedValue({ user: { id: userId, role } });
      mocks.profile.mockResolvedValue({ ...profile, role });
      expect((await listClassMaterials(listRequest("class-materials"))).status).toBe(200);
      expect(mocks.materialList).toHaveBeenLastCalledWith({ id: userId, role }, 10, 0);
    }
  });

  it("상세는 파일명만 추가하고 저장 위치는 제외한다", async () => {
    const response = await getClassMaterial(detailRequest("class-materials"), context());
    expect(response.status).toBe(200);
    expect(mocks.materialFind).toHaveBeenCalledWith({ id: userId, role: "MEMBER" }, itemId);
    const body = await response.json();
    expect(body).toEqual({ classMaterial: { id: itemId, title: "합성 강의자료", audience: "STUDENT", weekNumber: 3,
      lectureTitle: "고전 읽기", classDate: "2026-10-05", fileName: "강의.pdf" } });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|uploader|private\.invalid/);
  });

  it("MEMBER에게 허용되지 않은 교수용 자료는 대상 필터가 찾지 못해 404다", async () => {
    mocks.materialFind.mockResolvedValue(null);
    const response = await getClassMaterial(detailRequest("class-materials"), context());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});

describe("주차별 텍스트 목록·상세 DTO", () => {
  it("다른 기수 텍스트도 공동 자료로 목록에 포함하며 본문·URL·파일명은 제외한다", async () => {
    const response = await listWeeklyTexts(listRequest("weekly-texts", "?page=1&pageSize=5"));
    expect(response.status).toBe(200);
    expect(mocks.weeklyList).toHaveBeenCalledWith(5, 0);
    const body = await response.json();
    expect(body.weeklyTexts).toEqual([{ id: itemId, title: "합성 텍스트", textType: "고전명작",
      cohort: { id: otherCohort, name: "다른 기수" }, classDate: "2026-10-05", hasBody: true, hasFile: false }]);
    expect(JSON.stringify(body)).not.toMatch(/body"|fileUrl|fileName|createdAt|private\.invalid/);
  });

  it("상세는 Markdown 본문과 파일명만 추가하고 기수 없는 텍스트·빈 분류는 null이다", async () => {
    mocks.weeklyFind.mockResolvedValue({ ...weeklyRow, cohortId: null, cohortName: null, textType: "", hasFile: true, fileName: "텍스트.pdf" });
    const response = await getWeeklyText(detailRequest("weekly-texts"), context());
    expect(response.status).toBe(200);
    expect(mocks.weeklyFind).toHaveBeenCalledWith(itemId);
    const body = await response.json();
    expect(body).toEqual({ weeklyText: { id: itemId, title: "합성 텍스트", textType: null, cohort: null,
      classDate: "2026-10-05", hasBody: true, hasFile: true, body: "# 본문", fileName: "텍스트.pdf" } });
    expect(JSON.stringify(body)).not.toMatch(/fileUrl|private\.invalid/);
  });

  it("없는 텍스트는 404다", async () => {
    mocks.weeklyFind.mockResolvedValue(null);
    const response = await getWeeklyText(detailRequest("weekly-texts"), context());
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });
});

describe.each(lists)("$name 목록 공통 경계", ({ path, handler, count, list }) => {
  it("범위 밖 페이지는 요청 번호를 유지한 빈 배열이며 목록 조회를 생략한다", async () => {
    count.mockResolvedValue(12);
    const response = await handler(listRequest(path, "?page=4&pageSize=5"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.values(body)[0]).toEqual([]);
    expect(body.page).toEqual({ page: 4, pageSize: 5, totalCount: 12, totalPages: 3, hasNextPage: false, hasPreviousPage: true });
    expect(list).not.toHaveBeenCalled();
  });

  it.each(["?page=1&page=2", "?q=검색", "?page=0", "?pageSize=51", "?page=9007199254740991&pageSize=50", "?page=2147483649"])(
    "잘못된 query %s는 인증·DB 전에 400이다",
    async (query) => {
      const response = await handler(listRequest(path, query));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_INPUT");
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: "익명", status: 401, code: "UNAUTHENTICATED" },
    { name: "PENDING", status: 403, code: "FORBIDDEN" },
    { name: "역할 변경", status: 401, code: "UNAUTHENTICATED" },
    { name: "계정 삭제", status: 401, code: "UNAUTHENTICATED" },
  ])("$name은 자료 조회 없이 $status다", async ({ name, status, code }) => {
    if (name === "익명") mocks.auth.mockResolvedValue(null);
    if (name === "PENDING") {
      mocks.auth.mockResolvedValue({ user: { id: userId, role: "PENDING" } });
      mocks.profile.mockResolvedValue({ ...profile, role: "PENDING" });
    }
    if (name === "역할 변경") mocks.profile.mockResolvedValue({ ...profile, role: "PENDING" });
    if (name === "계정 삭제") mocks.profile.mockResolvedValue(null);
    const response = await handler(listRequest(path));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(count).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    if (name === "PENDING") expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("저장소 장애는 원문 없는 503이다", async () => {
    count.mockRejectedValue(new Error("SELECT file_url FROM secret"));
    const response = await handler(listRequest(path));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(mocks.log).toHaveBeenCalledOnce();
  });
});

describe.each(details)("$name 상세 공통 경계", ({ path, handler, find }) => {
  it.each([
    { name: "잘못된 UUID", status: 400, code: "INVALID_INPUT" },
    { name: "query", status: 400, code: "INVALID_INPUT" },
    { name: "익명", status: 401, code: "UNAUTHENTICATED" },
    { name: "PENDING", status: 403, code: "FORBIDDEN" },
    { name: "역할 변경", status: 401, code: "UNAUTHENTICATED" },
    { name: "저장소 장애", status: 503, code: "UNAVAILABLE" },
  ])("$name은 $status다", async ({ name, status, code }) => {
    if (name === "익명") mocks.auth.mockResolvedValue(null);
    if (name === "PENDING") mocks.auth.mockResolvedValue({ user: { id: userId, role: "PENDING" } });
    if (name === "역할 변경") mocks.profile.mockResolvedValue({ ...profile, role: "FACULTY" });
    if (name === "저장소 장애") find.mockRejectedValue(new Error("connection secret"));
    const response = await handler(
      detailRequest(path, name === "query" ? "?inline=1" : ""),
      context(name === "잘못된 UUID" ? "not-a-uuid" : itemId),
    );
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(response.headers.get("vary")).toBe("Cookie");
    if (status !== 503) expect(find).not.toHaveBeenCalled();
  });
});
