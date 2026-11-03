/**
 * 리치 텍스트 에디터 이미지 속성 변환 함수 (#292)
 *
 * 역할:
 * - 이미지 너비를 크기 조정 UI와 같은 1~100% 범위로만 정규화합니다.
 * - 이미지 노드 속성(src·alt·title·width)을 저장용 문자열로 바꿉니다.
 *   - 너비가 있으면 `<img ... style="width: N%" />` HTML로 저장 (공개 페이지 rehype-raw 가 파싱)
 *   - 너비가 없으면 `![설명](주소 "제목")` Markdown으로 저장
 *   - 어느 쪽이든 구분자가 되는 특수문자는 문자 참조로 저장해 원래 값을 그대로 복원합니다.
 * - marked가 만든 image 토큰을 다시 이미지 노드 속성으로 복원합니다.
 *
 * 사용 위치: `./extensions.ts`의 MarkdownImage 확장 (addAttributes / renderMarkdown / parseMarkdown)
 *
 * React·DOM에 의존하지 않는 순수 함수만 두어 단위 테스트로 직접 검증합니다.
 */

import { decodeHtmlEntities, type MarkdownToken } from "@tiptap/core";
import { escapeHtml, escapeHtmlAttr } from "./markdown";

// 이미지 노드의 Markdown 관련 속성 — parseMarkdown 결과이자 renderMarkdown 입력
export type MarkdownImageAttrs = {
  src: string;
  alt: string | null;
  title: string | null;
};

/** 이미지 크기 조정 UI와 같은 1~100% 범위만 저장·복원하며 다른 CSS 단위·선언은 버립니다. */
export function normalizeImageWidth(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?%$/.test(value)) return null;
  const width = Number(value.slice(0, -1));
  return width >= 1 && width <= 100 ? `${width}%` : null;
}

/** Markdown 이미지의 설명·주소·제목에서 구분자가 되는 문자는 문자 참조로 저장합니다. */
export function encodeMarkdownImageValue(value: string): string {
  return value.replace(/[&<>"'\\[\]()*_`~!|\s]/g, (character) => `&#${character.charCodeAt(0)};`);
}

/**
 * marked의 이미지 토큰은 문자 참조를 그대로 주므로 저장 시 인코딩한 값을 한 번만 복원합니다.
 * Tiptap의 기존 named entity 헬퍼를 재사용하고 숫자 참조만 보완합니다. `&amp;lt;` 같은 실제
 * 설명을 다시 `<`로 바꾸지 않도록 숫자·이름 참조를 한 번의 치환에서 처리합니다.
 */
export function decodeMarkdownImageValue(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);|&(?:amp|lt|gt|quot);/gi, (entity: string, numeric: string | undefined) => {
    if (!numeric) return decodeHtmlEntities(entity.toLowerCase());
    const code = numeric.toLowerCase().startsWith("x") ? parseInt(numeric.slice(1), 16) : Number(numeric);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "\uFFFD";
  });
}

/** 이미지 설명은 marked가 나눈 escape·인라인 토큰을 재사용해 문법 기호와 실제 글자를 구분합니다. */
export function parseMarkdownImageAlt(tokens: MarkdownToken[]): string {
  return tokens.map((token) => {
    if (token.tokens) return parseMarkdownImageAlt(token.tokens);
    if (token.type === "escape" || token.type === "codespan") return token.text ?? "";
    return decodeMarkdownImageValue(token.text ?? "");
  }).join("");
}

/**
 * TipTap 이미지 노드 속성 → 마크다운 또는 HTML img 태그
 * 크기가 지정된 경우 <img> HTML로 직렬화 → 표시 측 rehype-raw 가 파싱
 */
export function renderImageMarkdown(attrs: Record<string, unknown> | undefined): string {
  const src = (attrs?.src as string) ?? "";
  const alt = (attrs?.alt as string) ?? "";
  const width = normalizeImageWidth(attrs?.width);
  const title = attrs?.title as string | null;

  if (width) {
    // CR·LF를 문자 참조로 보존해 원래 설명을 복원하고, 여러 줄 속성이 inline HTML로
    // 분류되어 Tiptap 3.32에서 블록 이미지가 유실되는 것을 방지합니다.
    const encodeAttribute = (value: string) => escapeHtmlAttr(escapeHtml(value)).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
    const srcAttr = encodeAttribute(src);
    const altAttr = encodeAttribute(alt);
    const titleAttr = title != null ? ` title="${encodeAttribute(title)}"` : "";
    return `<img src="${srcAttr}" alt="${altAttr}"${titleAttr} style="width: ${width}" />`;
  }
  const titlePart = title != null ? ` "${encodeMarkdownImageValue(title)}"` : "";
  return `![${encodeMarkdownImageValue(alt)}](${encodeMarkdownImageValue(src)}${titlePart})`;
}

/** 마크다운 image 토큰 → TipTap 이미지 노드 속성 (저장 시 인코딩한 문자 참조를 한 번만 복원) */
export function markdownImageTokenToAttrs(token: MarkdownToken): MarkdownImageAttrs {
  return {
    src: decodeMarkdownImageValue(token.href ?? ""),
    alt: token.tokens ? parseMarkdownImageAlt(token.tokens) : token.text != null ? decodeMarkdownImageValue(token.text) : null,
    title: token.title != null ? decodeMarkdownImageValue(token.title) : null,
  };
}
