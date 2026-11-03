/**
 * 리치 텍스트 에디터 전용 Tiptap 확장 (단락·표·이미지 Markdown 저장 규칙)
 *
 * 역할:
 * - 기본 확장을 이 에디터의 저장 규칙에 맞게 확장해 `editor.getMarkdown()` 결과를 결정합니다.
 *   - MarkdownParagraph: 빈 단락을 `&nbsp;`로 저장 (공개 페이지 줄 간격 보존)
 *   - MarkdownTable    : 표 ↔ GFM Markdown/HTML (`./table.ts`, #118)
 *   - MarkdownImage    : 이미지 너비·속성 ↔ Markdown/HTML (`./image-attrs.ts`, #292) + 크기 조정 NodeView
 * - 실제 변환 로직은 순수 함수 모듈에 두고, 이 파일은 Tiptap 훅(renderMarkdown·parseMarkdown 등)에 연결만 합니다.
 *
 * 사용 위치: `../rich-text-editor.tsx`의 `useEditor({ extensions })`
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import { Paragraph } from "@tiptap/extension-paragraph";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { EMPTY_PARAGRAPH_MARKDOWN } from "./markdown";
import { markedTableTokenToJson, renderTableMarkdown, type MarkedTableToken } from "./table";
import { markdownImageTokenToAttrs, normalizeImageWidth, renderImageMarkdown } from "./image-attrs";
import { ImageResizeView } from "./image-resize-view";

/**
 * 빈 단락 마크다운 직렬화 확장
 *
 * 기본 @tiptap/extension-paragraph 는 직전 노드가 비-빈 단락이면 빈 단락을 ""로 직렬화해
 * 공개 페이지에 빈 줄 간격이 반영되지 않는다.
 * 빈 단락을 항상 &nbsp;로 직렬화해 공개 페이지에서도 줄 간격을 보존한다.
 */
export const MarkdownParagraph = Paragraph.extend({
  // 빈 단락(내용 없음) → &nbsp; 로 직렬화 (공개 페이지 줄 간격 보존)
  // 비-빈 단락 → 기본 동작 유지 (helpers.renderChildren 호출)
  renderMarkdown(node, helpers) {
    const content = Array.isArray(node.content) ? node.content : [];
    if (content.length === 0) return EMPTY_PARAGRAPH_MARKDOWN;
    return helpers.renderChildren(content);
  },
});

/**
 * 표(GFM 테이블) 마크다운 직렬화·역직렬화 확장
 *
 * 열 너비를 HTML 로 보존하는 등 이 에디터만의 저장 규칙이 있어 직접 구현한다.
 * - renderMarkdown: TipTap table 노드 → GFM 마크다운 표 또는 colgroup 포함 HTML
 * - parseMarkdown: marked 의 "table" 토큰 → TipTap table 노드 JSON
 */
export const MarkdownTable = Table.configure({ resizable: true }).extend({
  // @tiptap/markdown 에 "table" 토큰을 이 확장이 처리함을 등록
  markdownTokenName: "table",

  // TipTap table 노드 → 마크다운/HTML 직렬화 (형식 선택은 renderTableMarkdown 참고)
  renderMarkdown(node, helpers) {
    return renderTableMarkdown(node, helpers);
  },

  // marked "table" 토큰 → TipTap 노드 JSON (셀 내용은 인라인 토큰을 파싱, #118)
  parseMarkdown(token, helpers) {
    // parseInline 은 helpers 의 메서드이므로 this 를 유지하도록 화살표 함수로 감싸 전달한다.
    return markedTableTokenToJson(token as MarkedTableToken, (tokens) => helpers.parseInline(tokens));
  },
});

// 이미지의 Markdown·크기 지정 HTML 양쪽에 저장 규칙을 적용하고, NodeView로 크기 조정 UI를 제공합니다.
export const MarkdownImage = Image.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      // 이미지 표시 너비 — "50%" 형식, null이면 원본
      width: {
        default: null,
        // <img style="width: 50%"> 로부터 파싱
        parseHTML: (element: HTMLElement) => normalizeImageWidth(element.style.width),
        // TipTap 에디터 내부 HTML 직렬화 (붙여넣기·드래그 용)
        renderHTML: (attrs: Record<string, unknown>) => {
          const width = normalizeImageWidth(attrs.width);
          return width ? { style: `width: ${width}` } : {};
        },
      },
    };
  },

  // TipTap 이미지 노드 → 마크다운 또는 HTML img 태그 (크기 지정 시 HTML)
  renderMarkdown(node) {
    return renderImageMarkdown(node.attrs);
  },

  // 마크다운 image 토큰 → TipTap 이미지 노드
  parseMarkdown(token) {
    return {
      type: "image",
      attrs: markdownImageTokenToAttrs(token),
    };
  },

  // 이미지 클릭 시 크기 조정 UI를 보여주는 React 기반 NodeView 등록
  addNodeView() {
    return ReactNodeViewRenderer(ImageResizeView);
  },
});
