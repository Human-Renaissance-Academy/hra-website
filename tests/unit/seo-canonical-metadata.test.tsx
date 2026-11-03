/**
 * #414: 루트·공개 페이지·동적 상세의 canonical/robots 메타데이터 회귀를 고정합니다.
 *
 * - 루트 레이아웃: 환경별 metadataBase, Production 외 noindex, 루트 canonical 없음
 * - 주요 공개 페이지: 기존 제목 유지 + 자기 경로 canonical
 * - 공지·갤러리 상세: 공개된 항목에만 canonical, 없는·미발행 항목에는 canonical 없음
 */
import type { Metadata } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notice: vi.fn(),
  gallery: vi.fn(),
}));

// 페이지 모듈을 불러올 때 실제 DB 연결을 만들지 않도록 비어 있는 DB를 둡니다. 상세 메타데이터는 서비스를 대체합니다.
vi.mock("@/lib/db", () => ({ db: {} }));
// 일부 페이지가 간접적으로 불러오는 인증 모듈도 메타데이터 확인에는 필요 없으므로 대체합니다.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/features/notices/detail/service", () => ({
  getPublishedNoticeById: mocks.notice,
  getPublishedNoticeDetail: vi.fn(),
  incrementPublishedNoticeViewCount: vi.fn(),
}));
vi.mock("@/features/gallery/detail/service", () => ({
  getPublicGalleryDetail: mocks.gallery,
  incrementPublicGalleryViewCount: vi.fn(),
}));

const id = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** 환경변수를 바꾼 뒤 루트 레이아웃을 새로 불러와 모듈 범위의 metadata를 다시 계산합니다. */
async function loadRootMetadata(): Promise<Metadata> {
  vi.resetModules();
  return (await import("@/app/layout")).metadata;
}

describe("루트 레이아웃 메타데이터", () => {
  it("Production은 운영 주소를 기준으로 하고 noindex를 붙이지 않는다", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hra-website-theta.vercel.app");
    vi.stubEnv("VERCEL_URL", "hra-website-abc.vercel.app");
    const metadata = await loadRootMetadata();
    expect(metadata.metadataBase?.toString()).toBe("https://hra-website-theta.vercel.app/");
    expect(metadata.robots).toBeUndefined();
    // 루트 canonical은 모든 하위·없는 페이지에 상속되므로 두지 않습니다.
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.title).toEqual({ default: "HRA - Human Renaissance Academy", template: "%s | HRA" });
  });

  it("Preview는 자기 배포 주소를 기준으로 하고 noindex·nofollow를 붙인다", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hra-website-theta.vercel.app");
    vi.stubEnv("VERCEL_URL", "hra-website-git-feature.vercel.app");
    const metadata = await loadRootMetadata();
    expect(metadata.metadataBase?.toString()).toBe("https://hra-website-git-feature.vercel.app/");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("주요 공개 페이지 canonical", () => {
  // [모듈 경로, 기대 canonical, 기존 제목]
  const pages: Array<[string, string, string]> = [
    ["@/app/(public)/page", "/", "HRA - Human Renaissance Academy"],
    ["@/app/(public)/about/page", "/about", "소개"],
    ["@/app/(public)/curriculum/layout", "/curriculum", "커리큘럼"],
    ["@/app/(public)/faculty/page", "/faculty", "교수진 소개"],
    ["@/app/(public)/cohorts/page", "/cohorts", "기수 소개"],
    ["@/app/(public)/recruitment/page", "/recruitment", "모집안내"],
    ["@/app/(public)/notices/page", "/notices", "공지사항"],
    ["@/app/(public)/press/page", "/press", "언론보도"],
    ["@/app/(public)/gallery/page", "/gallery", "갤러리"],
    ["@/app/(public)/alumni/page", "/alumni", "수료생 이야기"],
    ["@/app/(public)/faq/layout", "/faq", "자주 묻는 질문"],
  ];

  it.each(pages)("%s 는 %s 를 대표 주소로 선언하고 제목을 유지한다", async (path, canonical, title) => {
    const { metadata } = (await import(/* @vite-ignore */ path)) as { metadata: Metadata };
    expect(metadata.alternates).toEqual({ canonical });
    expect(metadata.title).toBe(title);
  });
});

describe("동적 상세 canonical", () => {
  it("게시된 공지에만 자기 경로 canonical을 선언한다", async () => {
    const { generateMetadata } = await import("@/app/(public)/notices/[id]/page");
    mocks.notice.mockResolvedValue({
      id, title: "수업 안내", content: "공개 본문", viewCount: 0, createdAt: new Date("2026-10-20T00:00:00Z"),
    });
    const found = await generateMetadata({ params: Promise.resolve({ id }) });
    expect(found.title).toBe("수업 안내");
    expect(found.alternates).toEqual({ canonical: `/notices/${id}` });

    // 서비스는 미발행·없는 공지를 null로 돌려줍니다. 이때 canonical을 선언하지 않습니다.
    mocks.notice.mockResolvedValue(null);
    await expect(generateMetadata({ params: Promise.resolve({ id }) })).resolves.toEqual({ title: "공지사항" });
    await expect(generateMetadata({ params: Promise.resolve({ id: "invalid-id" }) })).resolves.toEqual({ title: "공지사항" });
  });

  it("존재하는 갤러리 앨범에만 자기 경로 canonical을 선언한다", async () => {
    const { generateMetadata } = await import("@/app/(public)/gallery/[id]/page");
    mocks.gallery.mockResolvedValue({ id, title: "수업 사진", description: null, viewCount: 0, images: [] });
    const found = await generateMetadata({ params: Promise.resolve({ id }) });
    expect(found.title).toBe("수업 사진");
    expect(found.alternates).toEqual({ canonical: `/gallery/${id}` });

    mocks.gallery.mockResolvedValue(null);
    await expect(generateMetadata({ params: Promise.resolve({ id }) })).resolves.toEqual({ title: "갤러리" });
  });
});
