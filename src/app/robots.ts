/**
 * /robots.txt 응답 (Next.js metadata route)
 *
 * 역할:
 * - Vercel Production: 공개 영역 크롤링을 허용하고 관리자·회원·인증·API·작성 경로를 제외하며 sitemap 위치를 안내합니다.
 * - Preview·로컬 등 그 외 환경: 모든 경로 크롤링을 막고 sitemap을 안내하지 않습니다.
 *
 * 주의: robots.txt는 검색엔진에 보내는 "요청"일 뿐 접근 통제가 아닙니다.
 * 규칙을 무시하는 크롤러나 사용자는 여전히 URL에 접근할 수 있으므로,
 * 보호 경로의 인증·인가는 반드시 Proxy·서버 액션·서비스의 권한 검사가 담당합니다.
 * 또한 여기에 적힌 경로는 누구나 볼 수 있으므로 비공개 ID나 숨겨야 할 경로를 적지 않습니다.
 */
import type { MetadataRoute } from "next";
import { absoluteSiteUrl, getSiteConfig } from "@/lib/site-url";

// 환경변수에 따라 응답이 달라지므로 빌드 시점 값으로 고정하지 않고 요청마다 생성합니다.
export const dynamic = "force-dynamic";

// 검색 결과에 노출할 필요가 없는 비공개·작성·시스템 경로 접두어입니다. (학사 화면은 /admin 아래에 있습니다.)
const ROBOTS_DISALLOWED_PATHS = [
  "/admin",
  "/member",
  "/mypage",
  "/resources",
  "/login",
  "/register",
  "/pending",
  "/recruitment/apply",
  "/system-error",
  "/api/",
] as const;

export default function robots(): MetadataRoute.Robots {
  const site = getSiteConfig();

  // 색인 금지 환경은 전체 크롤링을 막아 Preview 주소가 운영 페이지와 경쟁하지 않게 합니다.
  if (!site.indexable) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...ROBOTS_DISALLOWED_PATHS],
    },
    sitemap: absoluteSiteUrl(site.url, "/sitemap.xml"),
  };
}
