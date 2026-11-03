/**
 * /sitemap.xml 응답 (Next.js metadata route)
 *
 * 역할:
 * - 공개 정적 경로와 공개된 동적 콘텐츠(게시 공지·수료생 이야기·갤러리)의 절대 URL을 제공합니다.
 * - 경로 선택은 Application Service(listPublicSitemapEntries)가 담당하고, 이 파일은 DB를 직접 읽지 않습니다.
 * - Vercel Production이 아닌 환경(Preview·로컬)은 색인 대상이 아니므로 빈 sitemap을 반환합니다.
 *
 * 관리자·회원·인증·학사 경로와 비공개 ID는 서비스 단계에서 제외됩니다.
 */
import type { MetadataRoute } from "next";
import { listPublicSitemapEntries } from "@/features/sitemap/service";
import { absoluteSiteUrl, getSiteConfig } from "@/lib/site-url";

/**
 * 캐시 정책: 빌드 시 한 번 생성하고 최대 1시간(3600초)마다 백그라운드에서 다시 생성합니다.
 * - 인증 없는 공개 URL이므로 요청마다 DB를 조회(최대 3쿼리·각 5,000행)하지 않도록 캐시합니다.
 * - 환경(VERCEL_ENV)은 빌드 시점 값으로 판단합니다. Preview 빌드는 DB 조회 없이 빈 sitemap이 고정됩니다.
 * - 빌드 중 DB에 접속할 수 없으면 서비스가 정적 경로만 반환하므로 빌드는 실패하지 않으며,
 *   다음 재생성 시점에 게시 콘텐츠가 다시 포함됩니다. 새 게시물 반영은 최대 1시간 늦을 수 있습니다.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteConfig();

  // 색인 금지 환경에서는 URL을 안내하지 않고 DB도 조회하지 않습니다.
  if (!site.indexable) return [];

  const entries = await listPublicSitemapEntries();
  return entries.map((entry) => ({
    url: absoluteSiteUrl(site.url, entry.path),
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  }));
}
