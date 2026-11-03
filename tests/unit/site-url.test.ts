/**
 * #414: 환경별 사이트 기준 주소와 색인 허용 규칙(src/lib/site-url.ts)을 고정합니다.
 * Production만 운영 주소·색인을 쓰고, Preview는 자기 배포 주소·noindex를 쓰는지 확인합니다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { absoluteSiteUrl, getSiteConfig, PRODUCTION_SITE_URL, resolveSiteConfig } from "@/lib/site-url";

afterEach(() => vi.unstubAllEnvs());

describe("resolveSiteConfig", () => {
  it("Vercel Production은 운영 도메인을 쓰고 색인을 허용한다", () => {
    expect(resolveSiteConfig({
      vercelEnv: "production",
      vercelProjectProductionUrl: "hra.example.test",
      vercelUrl: "hra-git-branch.vercel.app",
    })).toEqual({ url: "https://hra.example.test", indexable: true });
  });

  it("Vercel Production에 운영 도메인 값이 없거나 잘못되면 고정 운영 주소를 쓴다", () => {
    expect(resolveSiteConfig({ vercelEnv: "production", vercelUrl: "hra-abc.vercel.app" }))
      .toEqual({ url: PRODUCTION_SITE_URL, indexable: true });
    expect(resolveSiteConfig({ vercelEnv: "production", vercelProjectProductionUrl: "  " }))
      .toEqual({ url: PRODUCTION_SITE_URL, indexable: true });
    expect(resolveSiteConfig({ vercelEnv: "production", vercelProjectProductionUrl: "evil.test/path?x" }))
      .toEqual({ url: PRODUCTION_SITE_URL, indexable: true });
    expect(PRODUCTION_SITE_URL).toBe("https://hra-website-theta.vercel.app");
  });

  it("Preview는 운영 도메인이 주어져도 자기 배포 주소를 쓰고 색인을 막는다", () => {
    expect(resolveSiteConfig({
      vercelEnv: "preview",
      vercelProjectProductionUrl: "hra-website-theta.vercel.app",
      vercelUrl: "hra-website-git-feature.vercel.app",
    })).toEqual({ url: "https://hra-website-git-feature.vercel.app", indexable: false });
  });

  it("Vercel Development나 배포 주소 없는 Preview는 개발 주소로 대체하고 색인을 막는다", () => {
    expect(resolveSiteConfig({ vercelEnv: "development", publicAppUrl: "http://localhost:4000/path" }))
      .toEqual({ url: "http://localhost:4000", indexable: false });
    expect(resolveSiteConfig({ vercelEnv: "preview" }))
      .toEqual({ url: "http://localhost:3000", indexable: false });
  });

  it("Vercel 밖에서는 기존처럼 production 실행은 운영 주소, 개발은 지정 주소를 쓰되 항상 색인을 막는다", () => {
    expect(resolveSiteConfig({ nodeEnv: "production", publicAppUrl: "http://localhost:4000" }))
      .toEqual({ url: PRODUCTION_SITE_URL, indexable: false });
    expect(resolveSiteConfig({ nodeEnv: "development", publicAppUrl: "http://localhost:4000" }))
      .toEqual({ url: "http://localhost:4000", indexable: false });
    expect(resolveSiteConfig({ nodeEnv: "development", publicAppUrl: "javascript:alert(1)" }))
      .toEqual({ url: "http://localhost:3000", indexable: false });
    expect(resolveSiteConfig({})).toEqual({ url: "http://localhost:3000", indexable: false });
  });
});

describe("getSiteConfig", () => {
  it("실행 환경변수를 읽어 같은 규칙을 적용한다", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hra-website-theta.vercel.app");
    vi.stubEnv("VERCEL_URL", "hra-preview.vercel.app");
    expect(getSiteConfig()).toEqual({ url: "https://hra-preview.vercel.app", indexable: false });

    vi.stubEnv("VERCEL_ENV", "production");
    expect(getSiteConfig()).toEqual({ url: "https://hra-website-theta.vercel.app", indexable: true });
  });
});

describe("absoluteSiteUrl", () => {
  it("기준 주소와 경로를 하나의 슬래시로 합친다", () => {
    expect(absoluteSiteUrl("https://hra.example.test", "/")).toBe("https://hra.example.test/");
    expect(absoluteSiteUrl("https://hra.example.test", "/notices/abc")).toBe("https://hra.example.test/notices/abc");
  });
});
