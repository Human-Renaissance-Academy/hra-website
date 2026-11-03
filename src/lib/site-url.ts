/**
 * 사이트 기준 주소(canonical·Open Graph·sitemap·robots)와 검색 색인 허용 여부를 한곳에서 결정합니다.
 *
 * 사용 위치:
 * - src/app/layout.tsx: metadataBase와 환경별 robots 메타데이터
 * - src/app/sitemap.ts, src/app/robots.ts: 절대 URL과 크롤링 정책
 *
 * 환경별 규칙 (docs/developer/seo-indexing-policy.md 와 같은 내용):
 * 1. Vercel Production(VERCEL_ENV=production)
 *    - 기준 주소: VERCEL_PROJECT_PRODUCTION_URL → 고정 운영 주소(PRODUCTION_SITE_URL)
 *    - 색인 허용. canonical·OG URL은 운영 주소를 가리킵니다.
 * 2. Vercel Preview·Development(VERCEL_ENV가 production 이외의 값)
 *    - 기준 주소: 해당 배포 자신의 VERCEL_URL → 개발 fallback
 *    - 운영 canonical을 무조건 복사하지 않고 자기 주소를 쓰며, 색인 금지(noindex)입니다.
 * 3. Vercel 밖(로컬 개발, CI, 로컬 next start)
 *    - 기준 주소: NODE_ENV=production이면 고정 운영 주소, 아니면 NEXT_PUBLIC_APP_URL → localhost
 *    - 색인 금지. 운영 색인은 Vercel Production에서만 허용합니다.
 *
 * 확인되지 않은 custom domain을 가정하지 않습니다. 운영 도메인이 바뀌면 Vercel의
 * VERCEL_PROJECT_PRODUCTION_URL이 먼저 반영되고, 고정 주소는 그 값이 없을 때의 fallback입니다.
 */

// AGENTS.md 에 기록된 운영 주소입니다. Vercel이 운영 도메인을 제공하지 않을 때만 사용합니다.
export const PRODUCTION_SITE_URL = "https://hra-website-theta.vercel.app";

// Vercel 밖 개발 서버의 기본 주소입니다.
const DEVELOPMENT_SITE_URL = "http://localhost:3000";

/** 주소 결정에 필요한 환경 입력입니다. 테스트에서 값을 직접 주입할 수 있도록 분리합니다. */
export type SiteEnvironmentInput = {
  vercelEnv?: string;
  vercelProjectProductionUrl?: string;
  vercelUrl?: string;
  nodeEnv?: string;
  publicAppUrl?: string;
};

/** 결정된 사이트 설정입니다. */
export type SiteConfig = {
  // 사이트 기준 origin (끝 슬래시 없음)
  url: string;
  // 검색엔진 색인 허용 여부. Vercel Production에서만 true입니다.
  indexable: boolean;
};

/** Vercel이 제공하는 호스트 이름(프로토콜 없음)을 https origin으로 바꿉니다. 비었거나 호스트가 아니면 null입니다. */
function originFromHost(host: string | undefined): string | null {
  const trimmed = host?.trim();
  // 호스트 이름 문자만 허용해 경로·인증 정보·공백이 섞인 값을 기준 주소로 쓰지 않습니다.
  if (!trimmed || !/^[a-z0-9.-]+(?::\d+)?$/i.test(trimmed)) return null;
  return `https://${trimmed.toLowerCase()}`;
}

/** 개발용 전체 URL 값을 origin으로 정규화합니다. http(s)가 아니거나 해석할 수 없으면 null입니다. */
function originFromUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !URL.canParse(trimmed)) return null;
  const parsed = new URL(trimmed);
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
}

/** 환경 입력만으로 기준 주소와 색인 여부를 결정하는 순수 함수입니다. */
export function resolveSiteConfig(input: SiteEnvironmentInput): SiteConfig {
  const vercelEnv = input.vercelEnv?.trim();

  // 1) Vercel Production: 운영 도메인 기준, 색인 허용
  if (vercelEnv === "production") {
    return {
      url: originFromHost(input.vercelProjectProductionUrl) ?? PRODUCTION_SITE_URL,
      indexable: true,
    };
  }

  // 2) Vercel Preview·Development: 자기 배포 주소 기준, 색인 금지
  if (vercelEnv) {
    return {
      url: originFromHost(input.vercelUrl) ?? originFromUrl(input.publicAppUrl) ?? DEVELOPMENT_SITE_URL,
      indexable: false,
    };
  }

  // 3) Vercel 밖: 기존 동작처럼 production 빌드는 운영 주소, 개발은 지정 주소·localhost. 색인 금지
  return {
    url: input.nodeEnv === "production"
      ? PRODUCTION_SITE_URL
      : originFromUrl(input.publicAppUrl) ?? DEVELOPMENT_SITE_URL,
    indexable: false,
  };
}

/** 현재 실행 환경의 사이트 설정을 읽습니다. 환경 계약 검사가 추적할 수 있도록 process.env를 직접 참조합니다. */
export function getSiteConfig(): SiteConfig {
  return resolveSiteConfig({
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelUrl: process.env.VERCEL_URL,
    nodeEnv: process.env.NODE_ENV,
    publicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

/** 사이트 기준 주소에 경로를 붙인 절대 URL을 만듭니다. */
export function absoluteSiteUrl(siteUrl: string, path: string): string {
  return new URL(path, `${siteUrl}/`).toString();
}
