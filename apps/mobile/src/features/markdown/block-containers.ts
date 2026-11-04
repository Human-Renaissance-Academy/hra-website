/**
 * 역할: 마크다운 중첩 목록(List) 및 GFM 표(Table) 블록 조립 보조 모듈
 * 사용 위치: src/features/markdown/block-parser.ts
 * 주요 기능:
 * - 중첩 들여쓰기를 보존하며 순서/비순서 목록 블록을 조립하고 최대 깊이 상한 적용
 * - 헤더·구분행·본문 행으로 구성된 GFM 표 블록을 조립하고 각 셀을 인라인 파싱
 */
import {
  isThematicBreak,
  matchAtxHeading,
  matchFenceStart,
  matchListItemLine,
  measureIndent,
  splitTableCells,
  type ListLineMatch,
} from './block-helpers';
import { parseInline } from './inline-parser';
import type { ParseBudget } from './parse-budget';
import {
  MAX_MARKDOWN_BLOCKS,
  MAX_MARKDOWN_DEPTH,
  type MarkdownBlockNode,
  type MarkdownInlineNode,
  type MarkdownListItem,
  type TableAlignment,
} from './types';

export interface ListParseContext {
  readonly budget: ParseBudget;
  readonly startIndex: number;
  readonly firstMatch: ListLineMatch;
  readonly depth: number;
  readonly parseSubBlocks: (lines: readonly string[], depth: number) => readonly MarkdownBlockNode[];
}

export interface TableParseContext {
  readonly budget: ParseBudget;
  readonly startIndex: number;
  readonly alignments: readonly TableAlignment[];
  readonly rawHeaderCells: readonly string[];
}

/** 목록 블록(중첩 목록 포함)을 소비하고 다음 줄 인덱스와 목록 노드를 반환합니다. */
export function parseListContainer(
  lines: readonly string[],
  context: ListParseContext,
): { readonly node: MarkdownBlockNode; readonly nextIndex: number } {
  const { startIndex, firstMatch, depth, parseSubBlocks } = context;
  const baseIndent = firstMatch.indent;
  const ordered = firstMatch.ordered;
  const startNumber = firstMatch.start;
  const items: MarkdownListItem[] = [];
  let cursor = startIndex;

  while (cursor < lines.length && items.length < MAX_MARKDOWN_BLOCKS && !context.budget.exhausted && context.budget.node()) {
    const currentLine = lines[cursor] ?? '';
    const itemMatch = matchListItemLine(currentLine);
    if (!itemMatch || itemMatch.indent !== baseIndent || itemMatch.ordered !== ordered) {
      break;
    }

    const itemLines: string[] = [itemMatch.content];
    cursor += 1;

    while (cursor < lines.length) {
      const subLine = lines[cursor] ?? '';
      if (!subLine.trim()) {
        const afterBlank = lines[cursor + 1];
        if (afterBlank === undefined) break;
        if (measureIndent(afterBlank).indent <= baseIndent) break;
        itemLines.push('');
        cursor += 1;
        continue;
      }

      const subListMatch = matchListItemLine(subLine);
      if (subListMatch) {
        if (subListMatch.indent <= baseIndent) break;
        itemLines.push(subLine.slice(Math.min(baseIndent + 2, subListMatch.indent)));
        cursor += 1;
        continue;
      }

      if (
        isThematicBreak(subLine) ||
        matchFenceStart(subLine) !== null ||
        matchAtxHeading(subLine) !== null
      ) {
        break;
      }

      const { indent: subIndent, trimmed: subTrimmed } = measureIndent(subLine);
      if (subIndent > baseIndent) {
        itemLines.push(subLine.slice(Math.min(baseIndent + 2, subIndent)));
        cursor += 1;
        continue;
      }

      itemLines.push(subTrimmed);
      cursor += 1;
    }

    const childBlocks =
      depth + 1 <= MAX_MARKDOWN_DEPTH
        ? parseSubBlocks(itemLines, depth + 1)
        : [{ kind: 'paragraph', children: parseInline(itemLines.join('\n'), 0, context.budget) } as const];

    items.push({
      blocks:
        childBlocks.length > 0
          ? childBlocks
          : [{ kind: 'paragraph', children: parseInline(itemMatch.content, 0, context.budget) }],
    });

    if ((lines[cursor] ?? '').trim() === '') {
      const afterBlank = lines[cursor + 1];
      const nextMatch = afterBlank !== undefined ? matchListItemLine(afterBlank) : null;
      if (nextMatch && nextMatch.indent === baseIndent && nextMatch.ordered === ordered) {
        cursor += 1;
      }
    }
  }

  return {
    node: { kind: 'list', ordered, start: startNumber, items },
    nextIndex: cursor,
  };
}

/** GFM 표 블록을 소비하고 다음 줄 인덱스와 표 노드를 반환합니다. */
export function parseTableContainer(
  lines: readonly string[],
  context: TableParseContext,
): { readonly node: MarkdownBlockNode; readonly nextIndex: number } {
  const { startIndex, alignments, rawHeaderCells } = context;
  const columnCount = alignments.length;
  const headers: readonly (readonly MarkdownInlineNode[])[] = Array.from(
    { length: columnCount },
    (_, colIdx) => context.budget.node() ? parseInline(rawHeaderCells[colIdx] ?? '', 0, context.budget) : [],
  );
  let cursor = startIndex + 2;
  const rows: (readonly (readonly MarkdownInlineNode[])[])[] = [];

  while (cursor < lines.length && rows.length < MAX_MARKDOWN_BLOCKS && !context.budget.exhausted && context.budget.node()) {
    const rowLine = lines[cursor] ?? '';
    if (!rowLine.trim() || !rowLine.includes('|') || isThematicBreak(rowLine)) {
      break;
    }
    const rawCells = splitTableCells(rowLine);
    const parsedRow: readonly (readonly MarkdownInlineNode[])[] = Array.from(
      { length: columnCount },
      (_, colIdx) => context.budget.node() ? parseInline(rawCells[colIdx] ?? '', 0, context.budget) : [],
    );
    rows.push(parsedRow);
    cursor += 1;
  }

  return {
    node: { kind: 'table', alignments, headers, rows },
    nextIndex: cursor,
  };
}
