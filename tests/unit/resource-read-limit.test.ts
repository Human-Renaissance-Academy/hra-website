// @vitest-environment node
/**
 * 자료실 파일·메타데이터 조회의 사용자별 빈도 제한(#444) 경계를 검증합니다.
 *
 * - API v1 자료 8경로(가이드북 목록 포함)와 Web 다운로드 경로가 초과 시 429·Retry-After를 반환합니다.
 * - 401·403은 제한보다 먼저 판단하며 무인증·승인 대기 요청은 예산에 기록하지 않습니다.
 * - 모바일 Bearer와 Web 쿠키 주체는 같은 사용자 id 키 하나를 공유합니다.
 * - 제한 저장소 장애는 자료를 제공하지 않는 503입니다(fail-closed).
 * - 한 화면의 정상 조회(목록·상세·파일 몇 건, 사진 100장)는 실제 정책 상수로도 제한되지 않습니다.
 *
 * 실제 principal 어댑터·서비스·공용 제한 경계를 거치고 세션 저장소·DB 저장소·Blob·예약 함수만 대체합니다.
 */
import { apiV1ResourceRateLimitedErrorSchema } from "@hra/contracts/api-v1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitReservation } from "@/lib/rate-limit";
import { RESOURCE_READ_BURST_RATE_LIMIT, RESOURCE_READ_HOURLY_RATE_LIMIT } from "@/lib/rate-limit-core";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), authenticate: vi.fn(), validate: vi.fn(), profile: vi.fn(), get: vi.fn(), reserve: vi.fn(),
  requireReader: vi.fn(), dbLimit: vi.fn(), log: vi.fn(),
  guidebookCount: vi.fn(), guidebookList: vi.fn(), guidebookFile: vi.fn(),
  materialCount: vi.fn(), materialList: vi.fn(), materialFind: vi.fn(), materialFile: vi.fn(),
  weeklyCount: vi.fn(), weeklyList: vi.fn(), weeklyFind: vi.fn(), weeklyFile: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("@/lib/rate-limit", () => ({ reserveResourceRead: mocks.reserve }));
vi.mock("@/lib/resource-access", () => ({ requireSharedResourceReader: mocks.requireReader }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.dbLimit }) }) }) } }));
vi.mock("@/features/auth/mobile-session/service", () => ({
  authenticateAccessToken: mocks.authenticate, validateMobileSession: mocks.validate,
}));
vi.mock("@/features/users/me/repository", () => ({ findUserProfileById: mocks.profile }));
vi.mock("@/features/guidebooks/member-list/repository", () => ({
  countGuidebooks: mocks.guidebookCount, listGuidebooks: mocks.guidebookList,
}));
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

import { GET as webDownload } from "@/app/api/resources/[kind]/[id]/download/route";
import { GET as classMaterials } from "@/app/api/v1/resources/class-materials/route";
import { GET as classMaterial } from "@/app/api/v1/resources/class-materials/[id]/route";
import { GET as classMaterialFile } from "@/app/api/v1/resources/class-materials/[id]/file/route";
import { GET as guidebooks } from "@/app/api/v1/resources/guidebooks/route";
import { GET as guidebookFile } from "@/app/api/v1/resources/guidebooks/[id]/file/route";
import { GET as weeklyTexts } from "@/app/api/v1/resources/weekly-texts/route";
import { GET as weeklyText } from "@/app/api/v1/resources/weekly-texts/[id]/route";
import { GET as weeklyTextFile } from "@/app/api/v1/resources/weekly-texts/[id]/file/route";
import { enforceResourceReadLimit, ResourceReadRateLimitError } from "@/features/resources/read-limit";

const userId = "61000000-0000-4000-8000-000000000001";
const sessionId = "62000000-0000-4000-8000-000000000001";
const itemId = "63000000-0000-4000-8000-000000000001";
const host = "readlimitqa.private.blob.vercel-storage.com";
const fileUrl = `https://${host}/resource-uploads/qa/file.pdf`;
const context = { params: Promise.resolve({ id: itemId }) };
const webContext = (kind: string) => ({ params: Promise.resolve({ kind, id: itemId }) });
const allowed: RateLimitReservation = { blocked: false, retryAfterSec: 0, reservationId: null };

const v1Routes = [
  { name: "가이드북 목록", path: "guidebooks", run: (r: Request) => guidebooks(r), file: false },
  { name: "가이드북 파일", path: `guidebooks/${itemId}/file`, run: (r: Request) => guidebookFile(r, context), file: true },
  { name: "강의자료 목록", path: "class-materials", run: (r: Request) => classMaterials(r), file: false },
  { name: "강의자료 상세", path: `class-materials/${itemId}`, run: (r: Request) => classMaterial(r, context), file: false },
  { name: "강의자료 파일", path: `class-materials/${itemId}/file`, run: (r: Request) => classMaterialFile(r, context), file: true },
  { name: "주차별 텍스트 목록", path: "weekly-texts", run: (r: Request) => weeklyTexts(r), file: false },
  { name: "주차별 텍스트 상세", path: `weekly-texts/${itemId}`, run: (r: Request) => weeklyText(r, context), file: false },
  { name: "주차별 텍스트 파일", path: `weekly-texts/${itemId}/file`, run: (r: Request) => weeklyTextFile(r, context), file: true },
] as const;

/** Bearer가 없으면 쿠키 세션(Auth.js mock)으로 인증합니다. */
const v1Request = (path: string, authorization?: string) => new Request(
  `https://qa.invalid/api/v1/resources/${path}`,
  { headers: { Cookie: "synthetic=valid", ...(authorization ? { Authorization: authorization } : {}) } },
);
const webRequest = (kind: string) => new Request(`https://qa.invalid/api/resources/${kind}/${itemId}/download`);

/** 매 호출 새 본문 스트림을 만들어 반복 요청에서도 소비된 스트림을 재사용하지 않습니다. */
const blobResponse = (contentType: string) => ({ statusCode: 200, blob: { contentType },
  stream: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("DATA")); controller.close(); } }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", host);
  vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "fixture-private-token");
  mocks.reserve.mockResolvedValue(allowed);
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.requireReader.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.authenticate.mockImplementation(async (token: string) => token === "valid" || token === "pending"
    ? { userId, role: token === "pending" ? "PENDING" : "MEMBER", sessionVersion: 1, sessionId }
    : null);
  mocks.validate.mockImplementation(async () => {
    const token = mocks.authenticate.mock.calls.at(-1)?.[0];
    return { userId, role: token === "pending" ? "PENDING" : "MEMBER" };
  });
  mocks.profile.mockResolvedValue({ id: userId, name: "합성", email: null, role: "MEMBER", cohortId: null, image: null });
  const material = { id: itemId, title: "합성 강의자료", audience: "STUDENT", weekNumber: null, lectureTitle: null, classDate: null };
  const text = { id: itemId, title: "합성 텍스트", textType: null, classDate: null, cohortId: null, cohortName: null, hasBody: true, hasFile: true };
  mocks.guidebookCount.mockResolvedValue(1);
  mocks.guidebookList.mockResolvedValue([{ id: itemId, title: "합성 가이드북" }]);
  mocks.materialCount.mockResolvedValue(1);
  mocks.materialList.mockResolvedValue([material]);
  mocks.materialFind.mockResolvedValue({ ...material, fileName: "강의.pdf" });
  mocks.weeklyCount.mockResolvedValue(1);
  mocks.weeklyList.mockResolvedValue([text]);
  mocks.weeklyFind.mockResolvedValue({ ...text, body: "본문", fileName: "텍스트.pdf" });
  for (const find of [mocks.guidebookFile, mocks.materialFile, mocks.weeklyFile]) find.mockResolvedValue({ fileUrl, fileName: "자료.pdf" });
  mocks.dbLimit.mockResolvedValue([{ fileUrl, fileName: "자료.pdf" }]);
  mocks.get.mockImplementation(async (url: string) => blobResponse(url.endsWith(".png") ? "image/png" : "application/pdf"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/** 성공·실패 모두 쿠키와 Bearer를 구분하는 캐시 헤더를 유지해야 합니다. */
function expectDualVary(response: Response) {
  const vary = (response.headers.get("vary") ?? "").split(",").map((value) => value.trim().toLowerCase());
  expect(vary).toEqual(expect.arrayContaining(["cookie", "authorization"]));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe.each(v1Routes)("$name 사용자별 조회 빈도 제한", ({ path, run, file }) => {
  it("예산 초과는 공용 오류 봉투의 429와 같은 값의 Retry-After이며 자료를 읽지 않는다", async () => {
    mocks.reserve.mockResolvedValueOnce({ blocked: true, retryAfterSec: 42, reservationId: null });
    const response = await run(v1Request(path, "Bearer valid"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expectDualVary(response);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    if (file) expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    const body = apiV1ResourceRateLimitedErrorSchema.parse(await response.json());
    expect(body.error.retryAfterSeconds).toBe(42);
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
    expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith(userId);
    expect(mocks.get).not.toHaveBeenCalled();
    for (const read of [mocks.guidebookList, mocks.materialList, mocks.materialFind, mocks.weeklyList, mocks.weeklyFind]) {
      expect(read).not.toHaveBeenCalled();
    }
  });

  it("무인증 401·승인 대기 403이 먼저이며 예산에 기록하지 않는다", async () => {
    mocks.reserve.mockResolvedValue({ blocked: true, retryAfterSec: 42, reservationId: null });
    const unauthenticated = await run(v1Request(path, "Bearer unknown"));
    expect(unauthenticated.status).toBe(401);
    expectDualVary(unauthenticated);
    // 가이드북 목록은 현재 계정 행으로 PENDING을 판단하므로 계정 행도 승인 대기 상태로 맞춥니다.
    mocks.profile.mockResolvedValueOnce({ id: userId, name: "합성", email: null, role: "PENDING", cohortId: null, image: null });
    const pending = await run(v1Request(path, "Bearer pending"));
    expect(pending.status).toBe(403);
    expectDualVary(pending);
    // 계정 행 조회 전에 PENDING을 거부한 경로에서 남은 일회성 값을 비웁니다.
    mocks.profile.mockReset();
    mocks.auth.mockResolvedValueOnce(null);
    expect((await run(v1Request(path))).status).toBe(401);
    // 삭제·역할 변경으로 현재 계정 확인에 실패한 쿠키 주체도 401이며 계산하지 않습니다.
    mocks.profile.mockResolvedValueOnce(null);
    expect((await run(v1Request(path))).status).toBe(401);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("제한 저장소 장애는 자료를 제공하지 않는 503 UNAVAILABLE이다(fail-closed)", async () => {
    mocks.reserve.mockResolvedValueOnce({ unavailable: true, blocked: true, retryAfterSec: 3600, reservationId: null });
    const response = await run(v1Request(path, "Bearer valid"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expectDualVary(response);
    expect((await response.json()).error.code).toBe("UNAVAILABLE");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("Bearer와 쿠키 주체는 같은 사용자 id 키 하나로 계산한다", async () => {
    const bearer = await run(v1Request(path, "Bearer valid"));
    const cookie = await run(v1Request(path));
    expect([bearer.status, cookie.status]).toEqual([200, 200]);
    await Promise.all([bearer.body?.cancel(), cookie.body?.cancel()]);
    expect(mocks.reserve.mock.calls).toEqual([[userId], [userId]]);
  });
});

describe("Web 자료실 다운로드 경로 사용자별 조회 빈도 제한", () => {
  it.each(["class-materials", "guidebooks", "weekly-texts", "weekly-text-images", "class-log-images"])(
    "%s 초과는 429와 Retry-After이며 DB·Blob을 읽지 않는다",
    async (kind) => {
      mocks.reserve.mockResolvedValueOnce({ blocked: true, retryAfterSec: 17, reservationId: null });
      const response = await webDownload(webRequest(kind), webContext(kind));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("17");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toMatch(/[가-힣]/);
      expect(mocks.reserve).toHaveBeenCalledExactlyOnceWith(userId);
      expect(mocks.dbLimit).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    },
  );

  it("미로그인·승인 대기 이동은 제한보다 먼저이며 예산에 기록하지 않는다", async () => {
    mocks.requireReader.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(webDownload(webRequest("guidebooks"), webContext("guidebooks"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("제한 저장소 장애는 파일을 제공하지 않는 503이다(fail-closed)", async () => {
    mocks.reserve.mockResolvedValueOnce({ unavailable: true, blocked: true, retryAfterSec: 3600, reservationId: null });
    const response = await webDownload(webRequest("guidebooks"), webContext("guidebooks"));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(mocks.dbLimit).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe("정상 사용 범위와 공유 예산", () => {
  /** 실제 정책 상수로 분·시간 두 축을 계산하는 메모리 예약 함수입니다(DB 함수와 같은 '초과 시 기록 안 함' 규칙). */
  function useInMemoryLimiter() {
    const events = new Map<string, number[]>();
    mocks.reserve.mockImplementation(async (key: string): Promise<RateLimitReservation> => {
      const now = Date.now();
      const times = events.get(key) ?? [];
      for (const policy of [RESOURCE_READ_BURST_RATE_LIMIT, RESOURCE_READ_HOURLY_RATE_LIMIT]) {
        if (times.filter((time) => time > now - policy.windowMs).length >= policy.maxAttempts) {
          return { blocked: true, retryAfterSec: policy.windowMs / 1000, reservationId: null };
        }
      }
      events.set(key, [...times, now]);
      return allowed;
    });
  }

  it("모바일 목록·상세·파일 몇 건과 사진 100장짜리 Web 화면을 함께 열어도 제한되지 않는다", async () => {
    useInMemoryLimiter();
    mocks.dbLimit.mockResolvedValue([{ fileUrl: `https://${host}/resource-uploads/qa/photo.png`, fileName: null }]);
    const statuses: number[] = [];
    const record = async (response: Response) => {
      statuses.push(response.status);
      await response.body?.cancel();
    };
    // 모바일 앱 한 화면: 목록 3종 + 상세 2건 + 파일 3건
    for (const route of v1Routes) await record(await route.run(v1Request(route.path, "Bearer valid")));
    // Web 주차별 텍스트 상세 화면: 첨부 파일 1건 + 사진 최대 100장, 두 번 새로 고침
    for (let view = 0; view < 2; view += 1) {
      await record(await webDownload(webRequest("weekly-texts"), webContext("weekly-texts")));
      for (let image = 0; image < 100; image += 1) {
        await record(await webDownload(webRequest("weekly-text-images"), webContext("weekly-text-images")));
      }
    }
    expect(statuses).toHaveLength(8 + 2 * 101);
    expect(statuses.every((status) => status === 200)).toBe(true);
    // Bearer·쿠키·Web 다운로드가 모두 같은 사용자 키 하나로 기록되었습니다.
    expect(new Set(mocks.reserve.mock.calls.map(([key]) => key))).toEqual(new Set([userId]));
  });

  it("같은 사용자가 분당 상한을 넘기면 Bearer든 쿠키든 같은 예산으로 429가 된다", async () => {
    useInMemoryLimiter();
    for (let index = 0; index < RESOURCE_READ_BURST_RATE_LIMIT.maxAttempts; index += 1) {
      const response = await classMaterials(v1Request("class-materials", index % 2 ? "Bearer valid" : undefined));
      expect(response.status).toBe(200);
    }
    const bearer = await classMaterials(v1Request("class-materials", "Bearer valid"));
    const cookie = await webDownload(webRequest("guidebooks"), webContext("guidebooks"));
    expect([bearer.status, cookie.status]).toEqual([429, 429]);
    expect(bearer.headers.get("retry-after")).toBe("60");
    expect(cookie.headers.get("retry-after")).toBe("60");
  });

  it("정책 상수는 사진 100장 화면 두세 번과 목록·파일 몇 건을 1분 안에 허용한다", () => {
    expect(RESOURCE_READ_BURST_RATE_LIMIT).toEqual({ windowMs: 60_000, maxAttempts: 300 });
    expect(RESOURCE_READ_HOURLY_RATE_LIMIT).toEqual({ windowMs: 3_600_000, maxAttempts: 2000 });
    expect(RESOURCE_READ_BURST_RATE_LIMIT.maxAttempts).toBeGreaterThanOrEqual(2 * (100 + 10));
  });
});

describe("enforceResourceReadLimit 재시도 값", () => {
  it.each([
    { retryAfterSec: 0, expected: 1 },
    { retryAfterSec: 12.2, expected: 13 },
    { retryAfterSec: 99_999, expected: 3600 },
    { retryAfterSec: Number.NaN, expected: 3600 },
  ])("$retryAfterSec초는 계약 범위의 $expected초로 고정한다", async ({ retryAfterSec, expected }) => {
    mocks.reserve.mockResolvedValueOnce({ blocked: true, retryAfterSec, reservationId: null });
    const error = await enforceResourceReadLimit(userId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResourceReadRateLimitError);
    expect(error instanceof ResourceReadRateLimitError ? error.retryAfterSeconds : null).toBe(expected);
  });
});
