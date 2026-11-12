/**
 * 역할: 마크다운 파서, URL 정화기, React Native 뷰어 컴포넌트의 단일 진입점
 * 사용 위치: 공지 상세, 과제 상세 및 단위 테스트
 * 주요 기능: MarkdownView 컴포넌트와 순수 파서/정화 유틸리티 재수출
 */
export { parseMarkdown } from './block-parser';
export { parseInline } from './inline-parser';
export { MarkdownView } from './markdown-view';
export type { MarkdownViewProps } from './markdown-view';
export {
  decodeHtmlEntities,
  sanitizeImageUrl,
  sanitizeLinkUrl,
  stripDangerousHtmlBlocks,
} from './sanitize-url';
export { markdownStrings } from './strings';
export {
  MAX_INLINE_DEPTH,
  MAX_INLINE_NODES,
  MAX_MARKDOWN_BLOCKS,
  MAX_MARKDOWN_DEPTH,
  MAX_MARKDOWN_LENGTH,
  MAX_MARKDOWN_LINES,
  MAX_TABLE_COLUMNS,
} from './types';
export type {
  HeadingLevel,
  MarkdownBlockNode,
  MarkdownInlineNode,
  MarkdownListItem,
  TableAlignment,
} from './types';
