/**
 * #413: robots.txt·sitemap.xml 생성 규칙을 환경별로 고정합니다.
 *
 * - robots: Production만 크롤링 허용·보호 경로 제외·sitemap 안내, 그 외 환경은 전체 차단
 * - sitemap route: Production만 절대 URL을 내보내고 Preview는 서비스(DB)를 호출하지 않음
 * - sitemap service: 공개 정적 경로와 게시 콘텐츠만, 보호 경로·잘못된 ID 제외, DB 실패 시 정적 경로 유지
 * - sitemap repository: 공지 조회가 PUBLISHED 조건을 SQL에 포함
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noticeRows: vi.fn(),
  alumniRows: vi.fn(),
  galleryRows: vi.fn(),
}));

// 서비스 테스트는 repository를 합성 행으로 대체합니다. repository 자체 테스트는 아래에서 실제 모듈을 불러옵니다.
vi.mock("@/features/sitemap/repository", () => ({
  listPublishedNoticeSitemapRows: mocks.noticeRows,
  listAlumniStorySitemapRows: mocks.alumniRows,
  listGallerySitemapRows: mocks.galleryRows,
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { listPublicSitemapEntries, PUBLIC_STATIC_SITEMAP_PATHS } from "@/features/sitemap/service";

const noticeId = "10000000-0000-4000-8000-000000000001";
const alumniId = "20000000-0000-4000-8000-000000000002";
const galleryId = "30000000-0000-4000-8000-000000000003";
const updatedAt = new Date("2026-10-30T00:00:00Z");

// sitemap에 절대 나오면 안 되는 보호·작성·시스템 경로 접두어입니다.
const protectedPrefixes = ["/admin", "/member", "/mypage", "/resources", "/login", "/register", "/pending", "/recruitment/apply", "/api", "/system-error"];

/** Production 환경변수를 설정합니다. */
function stubProduction() {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hra-website-theta.vercel.app");
  vi.stubEnv("VERCEL_URL", "hra-website-abc123.vercel.app");
}

/** Preview 환경변수를 설정합니다. Vercel은 Preview에도 운영 도메인 값을 제공할 수 있습니다. */
function stubPreview() {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hra-website-theta.vercel.app");
  vi.stubEnv("VERCEL_URL", "hra-website-git-feature.vercel.app");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.noticeRows.mockResolvedValue([{ id: noticeId, updatedAt }]);
  mocks.alumniRows.mockResolvedValue([{ id: alumniId, updatedAt }]);
  mocks.galleryRows.mockResolvedValue([{ id: galleryId, updatedAt }]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("robots.txt", () => {
  it("Production은 공개 영역을 허용하고 보호 경로를 제외하며 운영 sitemap을 안내한다", () => {
    stubProduction();
    const result = robots();
    expect(result.sitemap).toBe("https://hra-website-theta.vercel.app/sitemap.xml");
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/member", "/mypage", "/resources", "/login", "/register", "/pending", "/recruitment/apply", "/system-error", "/api/"],
    });
  });

  it("Preview와 Vercel 밖 실행은 전체 크롤링을 막고 sitemap을 안내하지 않는다", () => {
    stubPreview();
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });

    vi.unstubAllEnvs();
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("sitemap.xml route", () => {
  it("Production은 운영 주소 기준의 절대 URL만 내보낸다", async () => {
    stubProduction();
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://hra-website-theta.vercel.app/");
    expect(urls).toContain(`https://hra-website-theta.vercel.app/notices/${noticeId}`);
    expect(urls).toContain(`https://hra-website-theta.vercel.app/alumni/${alumniId}`);
    expect(urls).toContain(`https://hra-website-theta.vercel.app/gallery/${galleryId}`);
    expect(urls.every((url) => url.startsWith("https://hra-website-theta.vercel.app/"))).toBe(true);
    expect(entries.find((entry) => entry.url.endsWith(noticeId))?.lastModified).toEqual(updatedAt);
    // 정적 경로에는 근거 없는 수정 시각을 붙이지 않습니다.
    expect(entries.find((entry) => entry.url === "https://hra-website-theta.vercel.app/about")).toEqual({
      url: "https://hra-website-theta.vercel.app/about",
    });
  });

  it("Preview는 빈 sitemap을 반환하고 DB 조회를 하지 않는다", async () => {
    stubPreview();
    await expect(sitemap()).resolves.toEqual([]);
    expect(mocks.noticeRows).not.toHaveBeenCalled();
    expect(mocks.alumniRows).not.toHaveBeenCalled();
    expect(mocks.galleryRows).not.toHaveBeenCalled();
  });
});

describe("listPublicSitemapEntries", () => {
  it("공개 정적 경로와 공개 콘텐츠만 포함하고 보호 경로는 포함하지 않는다", async () => {
    const paths = (await listPublicSitemapEntries()).map((entry) => entry.path);
    expect(paths).toEqual([
      ...PUBLIC_STATIC_SITEMAP_PATHS,
      `/notices/${noticeId}`,
      `/alumni/${alumniId}`,
      `/gallery/${galleryId}`,
    ]);
    for (const path of paths) {
      for (const prefix of protectedPrefixes) {
        expect(path === prefix || path.startsWith(`${prefix}/`)).toBe(false);
      }
    }
    expect(mocks.noticeRows).toHaveBeenCalledWith(5000);
  });

  it("UUID가 아닌 ID는 경로로 만들지 않는다", async () => {
    mocks.noticeRows.mockResolvedValue([{ id: "../admin", updatedAt }, { id: noticeId, updatedAt }]);
    mocks.alumniRows.mockResolvedValue([{ id: "not-a-uuid", updatedAt }]);
    mocks.galleryRows.mockResolvedValue([]);
    const paths = (await listPublicSitemapEntries()).map((entry) => entry.path);
    expect(paths.filter((path) => path.split("/").length > 2)).toEqual([`/notices/${noticeId}`]);
  });

  it("DB 조회가 실패하면 원문 없이 기록하고 정적 경로만 반환한다", async () => {
    mocks.galleryRows.mockRejectedValue(new Error("Failed query: SELECT synthetic_secret"));
    const paths = (await listPublicSitemapEntries()).map((entry) => entry.path);
    expect(paths).toEqual([...PUBLIC_STATIC_SITEMAP_PATHS]);
    expect(console.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("synthetic_secret");
  });
});

describe("sitemap repository", () => {
  it("공지 조회는 PUBLISHED 상태 조건과 ID·수정 시각만 사용한다", async () => {
    const captured: { projection?: Record<string, unknown>; where?: SQL; limit?: number } = {};
    vi.doMock("@/lib/db", () => ({
      db: {
        select: (projection: Record<string, unknown>) => {
          captured.projection = projection;
          return { from: () => ({ where: (where: SQL) => {
            captured.where = where;
            return { orderBy: () => ({ limit: async (limit: number) => { captured.limit = limit; return []; } }) };
          } }) };
        },
      },
    }));
    const repository = await vi.importActual<typeof import("@/features/sitemap/repository")>("@/features/sitemap/repository");
    await repository.listPublishedNoticeSitemapRows(7);
    expect(Object.keys(captured.projection ?? {})).toEqual(["id", "updatedAt"]);
    expect(new PgDialect().sqlToQuery(captured.where as SQL)).toMatchObject({
      sql: '"notices"."status" = $1',
      params: ["PUBLISHED"],
    });
    expect(captured.limit).toBe(7);
    vi.doUnmock("@/lib/db");
  });
});
