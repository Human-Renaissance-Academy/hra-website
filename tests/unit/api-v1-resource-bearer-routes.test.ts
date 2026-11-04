// @vitest-environment node
/**
 * 공동 자료 API v1 7경로(강의자료·주차별 텍스트 목록/상세/파일, 가이드북 파일)의 모바일 Bearer 이중 인증 경계입니다.
 * - 유효한 Bearer는 쿠키 없이 200이며 Auth.js 세션을 읽지 않습니다.
 * - Authorization 헤더가 있으면 잘못된 토큰·형식·회수된 세션은 유효한 쿠키가 있어도 401입니다(쿠키 대체 없음).
 * - Bearer 주체도 현재 계정 행을 다시 대조하므로 PENDING은 403입니다.
 * - 모바일 세션 저장소 장애는 503이며 모든 응답의 Vary는 Cookie·Authorization입니다.
 * 실제 principal 어댑터·서비스를 거치고 세션 저장소·DB 저장소·Blob만 대체합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), authenticate: vi.fn(), validate: vi.fn(), profile: vi.fn(), get: vi.fn(),
  guidebookFile: vi.fn(),
  materialCount: vi.fn(), materialList: vi.fn(), materialFind: vi.fn(), materialFile: vi.fn(),
  weeklyCount: vi.fn(), weeklyList: vi.fn(), weeklyFind: vi.fn(), weeklyFile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/features/auth/mobile-session/service", () => ({
  authenticateAccessToken: mocks.authenticate, validateMobileSession: mocks.validate,
}));
vi.mock("@/features/users/me/repository", () => ({ findUserProfileById: mocks.profile }));
vi.mock("@/features/guidebooks/file-download/repository", () => ({ findGuidebookFile: mocks.guidebookFile }));
vi.mock("@/features/class-materials/member/repository", () => ({
  countClassMaterialsForReader: mocks.materialCount, listClassMaterialsForReader: mocks.materialList,
  findClassMaterialForReader: mocks.materialFind, findClassMaterialFileForReader: mocks.materialFile,
}));
vi.mock("@/features/weekly-texts/member/repository", () => ({
  countWeeklyTexts: mocks.weeklyCount, listWeeklyTexts: mocks.weeklyList,
  findWeeklyText: mocks.weeklyFind, findWeeklyTextFile: mocks.weeklyFile,
}));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));

import { GET as classMaterials } from "@/app/api/v1/resources/class-materials/route";
import { GET as classMaterial } from "@/app/api/v1/resources/class-materials/[id]/route";
import { GET as classMaterialFile } from "@/app/api/v1/resources/class-materials/[id]/file/route";
import { GET as guidebookFile } from "@/app/api/v1/resources/guidebooks/[id]/file/route";
import { GET as weeklyTexts } from "@/app/api/v1/resources/weekly-texts/route";
import { GET as weeklyText } from "@/app/api/v1/resources/weekly-texts/[id]/route";
import { GET as weeklyTextFile } from "@/app/api/v1/resources/weekly-texts/[id]/file/route";
import { MobileSessionStorageError } from "@/features/auth/mobile-session/types";

const userId = "51000000-0000-4000-8000-000000000001";
const sessionId = "52000000-0000-4000-8000-000000000001";
const itemId = "53000000-0000-4000-8000-000000000001";
const host = "bearerqa.private.blob.vercel-storage.com";
const fileUrl = `https://${host}/resource-uploads/qa/file.pdf`;
const profile = { id: userId, name: "합성", email: null, role: "MEMBER", cohortId: null, image: null };
const context = { params: Promise.resolve({ id: itemId }) };

const routes = [
  { name: "강의자료 목록", path: "class-materials", run: (r: Request) => classMaterials(r), file: false },
  { name: "강의자료 상세", path: `class-materials/${itemId}`, run: (r: Request) => classMaterial(r, context), file: false },
  { name: "강의자료 파일", path: `class-materials/${itemId}/file`, run: (r: Request) => classMaterialFile(r, context), file: true },
  { name: "주차별 텍스트 목록", path: "weekly-texts", run: (r: Request) => weeklyTexts(r), file: false },
  { name: "주차별 텍스트 상세", path: `weekly-texts/${itemId}`, run: (r: Request) => weeklyText(r, context), file: false },
  { name: "주차별 텍스트 파일", path: `weekly-texts/${itemId}/file`, run: (r: Request) => weeklyTextFile(r, context), file: true },
  { name: "가이드북 파일", path: `guidebooks/${itemId}/file`, run: (r: Request) => guidebookFile(r, context), file: true },
] as const;

/** 쿠키는 항상 유효한 상태로 두어 Bearer 실패가 쿠키로 대체되지 않는지 확인합니다. */
const request = (path: string, authorization?: string, query = "") => new Request(
  `https://qa.invalid/api/v1/resources/${path}${query}`,
  { headers: { Cookie: "synthetic=valid", ...(authorization ? { Authorization: authorization } : {}) } },
);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", host);
  vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "fixture-private-token");
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.authenticate.mockImplementation(async (token: string) => {
    if (token === "storage") throw new MobileSessionStorageError();
    if (token === "valid" || token === "pending" || token === "revoked") {
      return { userId, role: token === "pending" ? "PENDING" : "MEMBER", sessionVersion: 1, sessionId };
    }
    return null;
  });
  // 요청마다 다시 검증하는 모바일 세션의 현재 상태입니다. revoked는 인증 직후 회수된 세션을 나타냅니다.
  mocks.validate.mockImplementation(async () => {
    const token = mocks.authenticate.mock.calls.at(-1)?.[0];
    if (token === "revoked") return null;
    return { userId, role: token === "pending" ? "PENDING" : "MEMBER" };
  });
  mocks.profile.mockResolvedValue(profile);
  const material = { id: itemId, title: "합성 강의자료", audience: "STUDENT", weekNumber: null, lectureTitle: null, classDate: null };
  const text = { id: itemId, title: "합성 텍스트", textType: null, classDate: null, cohortId: null, cohortName: null, hasBody: true, hasFile: true };
  mocks.materialCount.mockResolvedValue(1);
  mocks.materialList.mockResolvedValue([material]);
  mocks.materialFind.mockResolvedValue({ ...material, fileName: "강의.pdf" });
  mocks.weeklyCount.mockResolvedValue(1);
  mocks.weeklyList.mockResolvedValue([text]);
  mocks.weeklyFind.mockResolvedValue({ ...text, body: "본문", fileName: "텍스트.pdf" });
  for (const find of [mocks.guidebookFile, mocks.materialFile, mocks.weeklyFile]) find.mockResolvedValue({ fileUrl, fileName: "자료.pdf" });
  mocks.get.mockImplementation(async () => ({ statusCode: 200, blob: { contentType: "application/pdf" },
    stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("PDF")); controller.close(); } }) }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/** 성공·실패 모두 쿠키와 Bearer를 구분하는 캐시 헤더를 가져야 합니다. */
function expectDualVary(response: Response) {
  const vary = (response.headers.get("vary") ?? "").split(",").map((value) => value.trim().toLowerCase());
  expect(vary).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe.each(routes)("$name Bearer 이중 인증", ({ path, run, file }) => {
  it("유효한 Bearer는 쿠키를 읽지 않고 현재 계정 확인 뒤 200이다", async () => {
    const response = await run(request(path, "Bearer valid"));
    expect(response.status).toBe(200);
    expectDualVary(response);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.validate).toHaveBeenCalledWith({ sessionId, expectedVersion: 1 });
    expect(mocks.profile).toHaveBeenCalledWith(userId);
    if (file) {
      expect(await response.text()).toBe("PDF");
      expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    } else {
      expect(response.headers.get("content-type")).toContain("application/json");
    }
  });

  it("쿠키만 있는 기존 Web 요청도 계속 200이다", async () => {
    const response = await run(request(path));
    expect(response.status).toBe(200);
    expectDualVary(response);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.auth).toHaveBeenCalledOnce();
    await response.body?.cancel();
  });

  it.each([
    { header: "Bearer unknown", status: 401, code: "UNAUTHENTICATED" },
    { header: "Bearer ", status: 401, code: "UNAUTHENTICATED" },
    { header: "Basic dXNlcjpwYXNz", status: 401, code: "UNAUTHENTICATED" },
    { header: "Bearer revoked", status: 401, code: "UNAUTHENTICATED" },
    { header: "Bearer pending", status: 403, code: "FORBIDDEN" },
    { header: "Bearer storage", status: 503, code: "UNAVAILABLE" },
  ])("$header는 유효한 쿠키가 있어도 $status이다", async ({ header, status, code }) => {
    const response = await run(request(path, header));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(host);
    expectDualVary(response);
    if (file) expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    // Authorization 헤더가 있으면 쿠키 세션으로 대체 인증하지 않습니다.
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    // PENDING Bearer는 현재 계정·자료 조회 전에 거부합니다.
    if (header === "Bearer pending") expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("Bearer 검증 실패는 query 입력 오류보다 먼저 401이다", async () => {
    const response = await run(request(path, "Bearer unknown", "?unsupported=1"));
    expect(response.status).toBe(401);
    expectDualVary(response);
  });
});
