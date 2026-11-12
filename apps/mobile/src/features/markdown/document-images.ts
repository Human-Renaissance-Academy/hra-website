/** 안전 AST 전체를 순회하여 문서당 자동 이미지 요청을 최대 20개로 제한합니다. */
import type { MarkdownBlockNode, MarkdownInlineNode } from './types';

export function collectDocumentImages(blocks: readonly MarkdownBlockNode[]): readonly { readonly url: string | null }[] {
  const urls: { readonly url: string | null }[] = [];
  const inline = (nodes: readonly MarkdownInlineNode[]) => {
    for (const node of nodes) {
      switch (node.kind) {
        case 'image': if (node.url) urls.push(node); break;
        case 'link': case 'strong': case 'emphasis': case 'strikethrough': inline(node.children); break;
        case 'text': case 'break': case 'code': break;
        default: { const exhaustive: never = node; return exhaustive; }
      }
    }
  };
  const visit = (nodes: readonly MarkdownBlockNode[]) => {
    for (const node of nodes) {
      switch (node.kind) {
        case 'image': if (node.url) urls.push(node); break;
        case 'paragraph': case 'heading': inline(node.children); break;
        case 'blockquote': visit(node.blocks); break;
        case 'list': for (const item of node.items) visit(item.blocks); break;
        case 'table': for (const row of [node.headers, ...node.rows]) for (const cell of row) inline(cell); break;
        case 'codeBlock': case 'thematicBreak': break;
        default: { const exhaustive: never = node; return exhaustive; }
      }
    }
  };
  visit(blocks);
  return urls;
}
