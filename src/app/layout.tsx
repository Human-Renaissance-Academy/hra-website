import type { Metadata } from "next";
import { headers } from "next/headers";
import { CspNonceProvider } from "@/components/security/csp-nonce-provider";
import { requireCspNonce } from "@/lib/security/csp";
import { getSiteConfig } from "@/lib/site-url";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

/**
 * 사이트 전역 메타데이터.
 *
 * - metadataBase: src/lib/site-url.ts 의 환경별 규칙으로 정한 기준 주소입니다.
 *   Vercel Production은 운영 도메인, Preview는 자기 배포 주소, 로컬은 localhost를 사용하며
 *   상대 경로(canonical, /opengraph-image 등)를 절대 URL로 변환하는 기준점이 됩니다.
 * - robots: 색인이 허용된 환경(Vercel Production)이 아니면 noindex·nofollow를 전역으로 붙여
 *   Preview·로컬 주소가 검색 결과에 노출되거나 운영 canonical과 경쟁하지 않게 합니다.
 * - openGraph / twitter: 카카오톡, 페이스북, 슬랙, 트위터 등 SNS에서
 *   링크를 공유했을 때 미리보기 카드를 제대로 노출하기 위한 공통 설정입니다.
 *   제목/설명은 각 페이지의 metadata.title / description 을 그대로 상속받습니다.
 * - 이미지는 src/app/opengraph-image.tsx 에서 Next.js ImageResponse 로
 *   1200x630 PNG 를 동적으로 생성합니다.
 * - canonical 은 루트에 두지 않고 각 공개 페이지가 자기 경로로 선언합니다.
 *   루트에 두면 모든 하위·없는 페이지가 홈 canonical 을 상속하기 때문입니다.
 */
const siteConfig = getSiteConfig();

const siteName = "HRA - Human Renaissance Academy";
const siteDescription = "인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteName,
    template: "%s | HRA",
  },
  description: siteDescription,
  openGraph: {
    siteName: "HRA",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  // 색인 금지 환경에서만 지정하고, 운영에서는 검색엔진 기본값(index, follow)을 유지합니다.
  ...(siteConfig.indexable ? {} : { robots: { index: false, follow: false } }),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // headers()는 요청별 동적 렌더를 보장하며 Proxy 누락 시 안전하게 실패한다.
  const nonce = requireCspNonce((await headers()).get("x-nonce"));
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <CspNonceProvider nonce={nonce}>
          {children}
          <Toaster />
        </CspNonceProvider>
      </body>
    </html>
  );
}
