/**
 * 역할: 마크다운 링크·이미지 URL 화이트리스트 검증 및 원시 HTML/엔티티 안전 정화(Sanitization)
 * 사용 위치: src/features/markdown/inline-parser.ts, block-parser.ts, markdown-view.tsx
 * 주요 기능:
 * - 링크 URL: http, https, mailto, tel 스킴만 허용하고 javascript:, data:, file:, 자격증명 포함 URL 차단
 * - 이미지 URL: 오직 https 스킴만 허용하고 http:, data:, 상대 경로, 자격증명 포함 URL 차단
 * - 원시 HTML: script/style/iframe 등 위험 블록과 태그를 정규식 역추적 없이 선형 스캔으로 제거
 */

const ALLOWED_HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const DANGEROUS_CONTAINER_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'applet',
] as const;

/** 제어 문자(0x00~0x20, 0x7F) 여부를 판별합니다. */
function isAsciiControlOrSpace(code: number): boolean {
  return code <= 0x20 || code === 0x7f;
}

/** 문자열 내에 ASCII 제어 문자(탭·줄바꿈 제외가 아닌 모든 0x00~0x1F, 0x7F)가 있는지 확인합니다. */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** 앞뒤 공백 및 제어 문자를 제거한 문자열을 반환합니다. */
function trimControlAndSpace(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && isAsciiControlOrSpace(raw.charCodeAt(start))) start += 1;
  while (end > start && isAsciiControlOrSpace(raw.charCodeAt(end - 1))) end -= 1;
  return raw.slice(start, end);
}

/**
 * 외부 링크 열기에 사용할 URL을 검증합니다.
 * 허용 스킴: http:, https:, mailto:, tel:
 * 허용되지 않거나 손상된 URL은 null을 반환합니다.
 */
export function sanitizeLinkUrl(rawUrl: string): string | null {
  const trimmed = trimControlAndSpace(rawUrl);
  if (!trimmed || trimmed.length > 2048 || hasControlCharacters(trimmed)) {
    return null;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('mailto:')) {
    const target = trimmed.slice('mailto:'.length).trim();
    if (!target || /[\s<>"'`]/.test(target) || !target.includes('@')) {
      return null;
    }
    return `mailto:${target}`;
  }

  if (lower.startsWith('tel:')) {
    const rawNumber = trimmed.slice('tel:'.length).trim();
    if (!rawNumber || !/^[0-9+()\-.\s]+$/.test(rawNumber) || !/\d/.test(rawNumber)) {
      return null;
    }
    const normalized = rawNumber.replace(/\s+/g, '');
    return `tel:${normalized}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_HTTP_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * 마크다운 이미지 렌더링에 사용할 URL을 검증합니다.
 * 오직 https: 스킴만 허용하며 http:, data:, blob:, 상대 경로 등은 모두 null을 반환합니다.
 */
export function sanitizeImageUrl(rawUrl: string): string | null {
  const trimmed = trimControlAndSpace(rawUrl);
  if (!trimmed || trimmed.length > 2048 || hasControlCharacters(trimmed)) {
    return null;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * 선형 indexOf 탐색으로 특정 위험 태그(<script>...</script> 등)와 내부 콘텐츠를 통째로 제거합니다.
 * 닫는 태그가 없는 비정상 입력도 끝까지 안전하게 제거하며 정규식 역추적을 사용하지 않습니다.
 */
function removeContainerTagBlocks(input: string, tagName: string): string {
  const lower = input.toLowerCase();
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}`;
  let cursor = 0;
  let result = '';

  while (cursor < input.length) {
    const openIdx = lower.indexOf(openToken, cursor);
    if (openIdx === -1) {
      result += input.slice(cursor);
      break;
    }
    const nextChar = lower.charAt(openIdx + openToken.length);
    const isTagBoundary =
      nextChar === '>' ||
      nextChar === '/' ||
      nextChar === ' ' ||
      nextChar === '\t' ||
      nextChar === '\n' ||
      nextChar === '\r';
    if (!isTagBoundary) {
      result += input.slice(cursor, openIdx + openToken.length);
      cursor = openIdx + openToken.length;
      continue;
    }

    result += input.slice(cursor, openIdx);
    const closeIdx = lower.indexOf(closeToken, openIdx + openToken.length);
    if (closeIdx === -1) {
      break;
    }
    const closeEndIdx = lower.indexOf('>', closeIdx + closeToken.length);
    if (closeEndIdx === -1) {
      break;
    }
    cursor = closeEndIdx + 1;
  }

  return result;
}

/** HTML 주석(<!-- ... -->)과 위험 컨테이너 블록(<script>, <style>, <iframe> 등)을 선형 제거합니다. */
export function stripDangerousHtmlBlocks(input: string): string {
  let cleaned = input;
  let commentCursor = 0;
  let withoutComments = '';
  while (commentCursor < cleaned.length) {
    const start = cleaned.indexOf('<!--', commentCursor);
    if (start === -1) {
      withoutComments += cleaned.slice(commentCursor);
      break;
    }
    withoutComments += cleaned.slice(commentCursor, start);
    const end = cleaned.indexOf('-->', start + 4);
    if (end === -1) break;
    commentCursor = end + 3;
  }
  cleaned = withoutComments;

  for (const tag of DANGEROUS_CONTAINER_TAGS) {
    cleaned = removeContainerTagBlocks(cleaned, tag);
  }
  return cleaned;
}

/** 구조 파싱이 끝난 평문 텍스트에 대해서만 기본 HTML 엔티티를 안전하게 복원합니다. */
export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&amp;/gi, '&');
}
