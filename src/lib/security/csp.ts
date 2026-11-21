/**
 * HTML 문서의 요청별 CSP를 생성한다.
 * Proxy가 만든 nonce만 사용하며, 파일 API의 독립 sandbox 정책에는 적용하지 않는다.
 */
import { projectBlobHost } from "@/lib/blob-host";

/** 누락되거나 변조된 nonce로 문서를 렌더링하지 않고 명시적으로 실패한다. */
export function requireCspNonce(nonce: string | null): string {
  if (!nonce || !/^[A-Za-z0-9+/]{43}=$/.test(nonce)) {
    throw new Error("CSP_NONCE_MISSING");
  }
  return nonce;
}

/** 설치된 Sonner 정적 CSS만 hash로 허용하고 앱의 style 요소는 nonce로 제한한다. */
export function createContentSecurityPolicy(nonce: string, development: boolean): string {
  requireCspNonce(nonce);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Sonner는 빈 style을 먼저 삽입한다. 빈 CSS(규칙 0개)의 hash만 추가 허용한다.
    // 이후 텍스트 변경은 CSP가 재검사하며, 위에서 검토한 CSS hash 또는 nonce가 필요하다.
    `style-src 'self' 'nonce-${nonce}' 'sha256-StEaX+se6YS7pqjzrzMIA0KaX9zF/8zAhvQXZAe5epY=' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='`,
    // Sonner·에디터·UI 컴포넌트의 런타임 style 속성에만 한정한 예외다.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: https://${projectBlobHost}`,
    "font-src 'self' data:",
    "connect-src 'self' https://vercel.com/api/blob/",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
