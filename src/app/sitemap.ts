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

// 게시 상태와 환경이 바뀌면 바로 반영되도록 빌드 시점에 고정하지 않고 요청마다 생성합니다.
export const dynamic = "force-dynamic";

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
