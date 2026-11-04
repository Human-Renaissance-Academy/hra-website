// @vitest-environment node
/**
 * 공동 자료 API v1 파일 경로(가이드북·강의자료·주차별 텍스트)의 실제 서비스·역할 정책·서버 Blob 읽기·보호 스트림 회귀입니다.
 * 외부 DB/Blob/세션만 대체하며 공통 오류 봉투, 안전한 첨부 헤더, 저장 위치·토큰 비노출을 검사합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), profile: vi.fn(), get: vi.fn(),
  guidebook: vi.fn(), material: vi.fn(), weekly: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/features/users/me/repository", () => ({ findUserProfileById: mocks.profile }));
vi.mock("@/features/guidebooks/file-download/repository", () => ({ findGuidebookFile: mocks.guidebook }));
vi.mock("@/features/class-materials/member/repository", () => ({
  findClassMaterialFileForReader: mocks.material,
  countClassMaterialsForReader: vi.fn(), listClassMaterialsForReader: vi.fn(), findClassMaterialForReader: vi.fn(),
}));
vi.mock("@/features/weekly-texts/member/repository", () => ({
  findWeeklyTextFile: mocks.weekly,
  countWeeklyTexts: vi.fn(), listWeeklyTexts: vi.fn(), findWeeklyText: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));

import { GET as guidebookFile } from "@/app/api/v1/resources/guidebooks/[id]/file/route";
import { GET as classMaterialFile } from "@/app/api/v1/resources/class-materials/[id]/file/route";
import { GET as weeklyTextFile } from "@/app/api/v1/resources/weekly-texts/[id]/file/route";
import config from "../../next.config";

const id = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const cohortA = "30000000-0000-4000-8000-00000000000a";
const host = "resourceqa.private.blob.vercel-storage.com";
const url = `https://${host}/resource-uploads/qa/material.pdf`;
const token = "fixture-private-token";
const profile = { id: userId, name: "합성", email: null, role: "MEMBER", cohortId: cohortA, image: null };

const routes = [
  { name: "가이드북", path: "guidebooks", handler: guidebookFile, repository: mocks.guidebook },
  { name: "강의자료", path: "class-materials", handler: classMaterialFile, repository: mocks.material },
  { name: "주차별 텍스트", path: "weekly-texts", handler: weeklyTextFile, repository: mocks.weekly },
] as const;

const context = (value = id) => ({ params: Promise.resolve({ id: value }) });
const request = (path: string, query = "", init?: RequestInit) =>
  new Request(`https://qa.invalid/api/v1/resources/${path}/${id}/file${query}`, init);
const pdfStream = () => new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(new TextEncoder().encode("PDF")); controller.close(); },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", host);
  vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", token);
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.profile.mockResolvedValue(profile);
  for (const route of routes) route.repository.mockResolvedValue({ fileUrl: url, fileName: '한글/안내\r\n".pdf' });
  mocks.get.mockImplementation(async () => ({ statusCode: 200, blob: { contentType: "application/pdf" }, stream: pdfStream() }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe.each(routes)("$name 파일 API", ({ path, handler, repository }) => {
  it.each(["MEMBER", "FACULTY", "ADMIN"] as const)("%s는 현재 역할 확인 뒤 서버가 읽은 첨부 스트림만 받는다", async (role) => {
    // Given: 현재 DB 행과 세션 역할이 같은 승인 회원입니다.
    mocks.auth.mockResolvedValue({ user: { id: userId, role } });
    mocks.profile.mockResolvedValue({ ...profile, role });
    // When
    const response = await handler(request(path), context());
    // Then
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("PDF");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="[^\r\n/]*"; filename\*=UTF-8''/);
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("location")).toBeNull();
    const headers = JSON.stringify([...response.headers]);
    expect(headers).not.toContain(host);
    expect(headers).not.toContain(token);
    expect(mocks.get).toHaveBeenCalledWith(url, expect.objectContaining({
      access: "private", token, useCache: false, storeId: "resourceqa",
    }));
  });

  it.each([
    { name: "잘못된 UUID", status: 400, code: "INVALID_INPUT" },
    { name: "query", status: 400, code: "INVALID_INPUT" },
    { name: "익명", status: 401, code: "UNAUTHENTICATED" },
    { name: "PENDING", status: 403, code: "FORBIDDEN" },
    { name: "역할 변경", status: 401, code: "UNAUTHENTICATED" },
    { name: "계정 삭제", status: 401, code: "UNAUTHENTICATED" },
    { name: "없는 자료", status: 404, code: "NOT_FOUND" },
    { name: "빈 파일 URL", status: 404, code: "NOT_FOUND" },
    { name: "외부 저장소", status: 404, code: "NOT_FOUND" },
    { name: "공급자 304", status: 404, code: "NOT_FOUND" },
    { name: "공급자 장애", status: 503, code: "UNAVAILABLE" },
    { name: "토큰 누락", status: 503, code: "UNAVAILABLE" },
  ])("$name은 $status 공통 오류로 끝나며 파일 위치를 숨긴다", async (scenario) => {
    // Given
    if (scenario.name === "익명") mocks.auth.mockResolvedValue(null);
    if (scenario.name === "PENDING") {
      mocks.auth.mockResolvedValue({ user: { id: userId, role: "PENDING" } });
      mocks.profile.mockResolvedValue({ ...profile, role: "PENDING" });
    }
    if (scenario.name === "역할 변경") mocks.profile.mockResolvedValue({ ...profile, role: "PENDING" });
    if (scenario.name === "계정 삭제") mocks.profile.mockResolvedValue(null);
    if (scenario.name === "없는 자료") repository.mockResolvedValue(null);
    if (scenario.name === "빈 파일 URL") repository.mockResolvedValue({ fileUrl: "", fileName: null });
    if (scenario.name === "외부 저장소") repository.mockResolvedValue({ fileUrl: "https://attacker.invalid/file.pdf", fileName: null });
    if (scenario.name === "공급자 304") mocks.get.mockResolvedValue({ statusCode: 304, stream: null, blob: null });
    if (scenario.name === "공급자 장애") mocks.get.mockRejectedValue(new Error(`private ${url} ${token}`));
    if (scenario.name === "토큰 누락") vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "");
    // When
    const response = await handler(
      request(path, scenario.name === "query" ? "?inline=1" : ""),
      context(scenario.name === "잘못된 UUID" ? "bad" : id),
    );
    // Then
    expect(response.status).toBe(scenario.status);
    const body = await response.json();
    expect(body.error.code).toBe(scenario.code);
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
    const serialized = JSON.stringify(body) + JSON.stringify([...response.headers]);
    expect(serialized).not.toContain(url);
    expect(serialized).not.toContain(token);
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    // 입력·인증·역할 실패는 파일 행 조회와 Blob 읽기 전에 끝납니다.
    if (["잘못된 UUID", "query", "익명", "PENDING", "역할 변경", "계정 삭제"].includes(scenario.name)) {
      expect(repository).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    }
    // 승인 대기 세션은 현재 계정 조회도 하지 않습니다.
    if (scenario.name === "PENDING") expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("응답 본문 취소는 공급자 스트림까지 전파한다", async () => {
    // Given
    const cancel = vi.fn();
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { contentType: "application/pdf" }, stream: new ReadableStream({
      pull() { return new Promise<void>(() => undefined); }, cancel,
    }) });
    const response = await handler(request(path), context());
    // When
    await response.body?.cancel();
    // Then
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("공급자 헤더가 오기 전 요청 취소는 SDK의 진행 중 요청을 중단하고 503으로 끝난다", async () => {
    // Given
    const entered = Promise.withResolvers<AbortSignal>();
    mocks.get.mockImplementation((_url, options: { abortSignal: AbortSignal }) => {
      entered.resolve(options.abortSignal);
      return new Promise((_resolve, reject) => options.abortSignal.addEventListener("abort", () => reject(options.abortSignal.reason), { once: true }));
    });
    const controller = new AbortController();
    const pending = handler(request(path, "", { signal: controller.signal }), context());
    const upstream = await entered.promise;
    // When
    controller.abort();
    const response = await pending;
    // Then
    expect(upstream.aborted).toBe(true);
    expect(response.status).toBe(503);
  });

  it("응답 구성 실패도 공급자 스트림을 취소하고 503으로 끝난다", async () => {
    // Given: 헤더로 쓸 수 없는 저장 MIME입니다.
    const cancel = vi.fn();
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { contentType: "application/pdf\r\nX-Injected: 1" },
      stream: new ReadableStream({ cancel }) });
    // When
    const response = await handler(request(path), context());
    // Then
    expect(response.status).toBe(503);
    expect(response.headers.get("x-injected")).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("공급자 헤더 수신 뒤에는 60초 상한을 해제하고 요청 취소만 본문에 전파한다", async () => {
    // Given
    vi.useFakeTimers();
    try {
      const response = await handler(request(path), context());
      const signal: AbortSignal = mocks.get.mock.calls[0][1].abortSignal;
      // When
      vi.advanceTimersByTime(61_000);
      // Then
      expect(signal.aborted).toBe(false);
      expect(response.status).toBe(200);
      await response.body?.cancel();
    } finally {
      vi.useRealTimers();
    }
  });

  it("시작 뒤 공급자 오류는 원문 없는 고정 스트림 오류로 끝난다", async () => {
    // Given
    mocks.get.mockResolvedValue({ statusCode: 200, blob: { contentType: "application/pdf" }, stream: new ReadableStream({
      pull() { throw new Error(url); },
    }) });
    const response = await handler(request(path), context());
    // When
    const reading = response.text();
    // Then
    await expect(reading).rejects.toThrow("파일 전송이 중단되었습니다.");
  });

  it("정적 헤더도 일반 API CSP 뒤에서 같은 sandbox를 적용한다", async () => {
    // Given
    const rules = await config.headers?.();
    // When
    const rule = rules?.find((item) => item.source === `/api/v1/resources/${path}/:id/file`);
    // Then
    expect(rule?.headers).toContainEqual({ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" });
    expect(rules?.indexOf(rule!)).toBeGreaterThan(rules?.findIndex((item) => item.source === "/api/:path*") ?? -1);
  });
});

describe("파일 인가 조회 입력", () => {
  it("강의자료 파일은 현재 DB 역할로 대상 필터 저장소를 호출해 MEMBER의 교수용 자료를 404로 숨긴다", async () => {
    // Given: 저장소가 MEMBER 대상 필터로 교수용 자료를 찾지 못한 상황입니다.
    mocks.material.mockResolvedValue(null);
    // When
    const response = await classMaterialFile(request("class-materials"), context());
    // Then
    expect(response.status).toBe(404);
    expect(mocks.material).toHaveBeenCalledWith({ id: userId, role: "MEMBER" }, id);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("주차별 텍스트 파일은 다른 기수 회원도 공동 자료 정책으로 받는다", async () => {
    // Given: 요청자는 cohortA 소속이며 저장소는 기수 조건 없이 ID로만 찾습니다.
    // When
    const response = await weeklyTextFile(request("weekly-texts"), context());
    // Then
    expect(response.status).toBe(200);
    expect(mocks.weekly).toHaveBeenCalledWith(id);
    await response.body?.cancel();
  });
});
