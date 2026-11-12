/**
 * ======================================================
 * Next.js 프레임워크 설정 파일
 * ======================================================
 * 
 * Next.js 프레임워크의 동작 방식을 커스터마이징하는 파일입니다.
 * 여기서 설정할 수 있는 것들:
 * 
 * - 이미지 로딩할 때 사용 가능한 도메인 설정
 * - URL 리다이렉트 규칙 (옛날 주소 → 새로운 주소)
 * - 환경변수 설정
 * - 빌드 최적화 옵션
 * - 웹팩 설정 (고급)
 * 
 * 현재는 기본 설정만 사용 중이므로, 필요한 것이 생기면 여기에 추가하면 됩니다.
 * 예를 들어, 외부 이미지를 사용하면 domains 배열에 도메인을 등록해야 합니다.
 */

import type { NextConfig } from "next";
import { projectBlobHost } from "./src/lib/blob-host";

// HTML nonce 정책은 Proxy가 요청별로 제공한다. 파일 API의 임베드 경계만 정적으로 둔다.
const downloadCsp = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";
// Auth.js의 API HTML 응답에도 기존 정적 보호를 유지한다. HTML nonce 경로와는 겹치지 않는다.
const apiCsp = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";

const nextConfig: NextConfig = {
  // 내부 contracts workspace의 TypeScript 원본을 Web 서버·클라이언트 번들에 포함합니다.
  transpilePackages: ["@hra/contracts"],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: apiCsp }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // PDF는 같은 출처의 자료실 페이지에만 임베드합니다.
        source: "/api/resources/:kind/:id/download",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: downloadCsp },
        ],
      },
      {
        // Next의 정적 헤더가 Route 응답보다 우선하므로 학사 파일 sandbox를 마지막에 고정한다.
        source: "/api/academic/submissions/:id/file/:fileId",
        headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" }],
      },
      {
        // 버전 API도 같은 개인 파일을 전달하므로 일반 API 헤더 뒤에서 sandbox를 고정합니다.
        source: "/api/v1/submissions/:id/files/:fileId",
        headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" }],
      },
      // 공동 자료 API v1 파일도 첨부 스트림이므로 일반 API CSP 뒤에서 같은 sandbox를 고정합니다.
      {
        source: "/api/v1/resources/guidebooks/:id/file",
        headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" }],
      },
      {
        source: "/api/v1/resources/class-materials/:id/file",
        headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" }],
      },
      {
        source: "/api/v1/resources/weekly-texts/:id/file",
        headers: [{ key: "Content-Security-Policy", value: "sandbox; default-src 'none'" }],
      },
    ];
  },
  experimental: {
    // 가이드북·주차별텍스트 파일 업로드 최대 30MB + 멀티파트 헤더 여유분 포함해 32MB로 설정.
    // 기본값(1MB)에서는 대부분의 파일이 413 에러로 차단된다.
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: projectBlobHost,
      },
    ],
  },
};

export default nextConfig;
