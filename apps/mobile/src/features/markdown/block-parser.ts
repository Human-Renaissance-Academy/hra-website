/**
 * 역할: 마크다운 문서를 안전한 블록 AST(MarkdownBlockNode[])로 변환하는 순수 TypeScript 블록 파서
 * 사용 위치: src/features/markdown/markdown-view.tsx 및 마크다운 안전성 단위 테스트
 * 주요 기능:
 * - 제목(1~6), 문단, 펜스 코드 블록, 인용문, 중첩 목록(순서/비순서), 구분선, GFM 표, 단독 이미지 파싱
 * - 원시 HTML 위험 블록(<script>, <iframe>, <style> 등) 제거 및 깊이/길이/블록 개수 상한 보장
 */
import { parseListContainer, parseTableContainer } from './block-containers';
import { isFenceClose, isThematicBreak, matchAtxHeading, matchDangerousHtmlBlockStart, matchFenceStart, matchListItemLine, matchStandaloneImage, measureIndent, parseTableDelimiterRow, splitTableCells } from './block-helpers';
import { parseInline } from './inline-parser';
import { stripDangerousHtmlBlocks } from './sanitize-url';
import { MAX_MARKDOWN_BLOCKS, MAX_MARKDOWN_DEPTH, MAX_MARKDOWN_LENGTH, MAX_MARKDOWN_LINES, type MarkdownBlockNode } from './types';
import { createParseBudget, type ParseBudget } from './parse-budget';

/** 인용문 한 단계(> )를 제거합니다. 최대 깊이 도달 시에는 모든 연속된 > 접두어를 한 번에 벗깁니다. */
function stripBlockquotePrefix(line: string, flattenAll: boolean): string {
  if (flattenAll) {
    return line.replace(/^(?:[ \t]*>[ \t]?)+/, '');
  }
  return line.replace(/^[ \t]{0,3}>[ \t]?/, '');
}

/** 줄이 인용문(>)으로 시작하는지 확인합니다. */
function isBlockquoteLine(line: string): boolean {
  const { indent, trimmed } = measureIndent(line);
  return indent <= 3 && trimmed.startsWith('>');
}

/** 줄이 새로운 블록 요소의 시작인지 확인합니다(문단 종료 판별용). */
function startsNewBlock(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? '';
  if (!line.trim()) return true;
  if (matchFenceStart(line) !== null) return true;
  if (matchAtxHeading(line) !== null) return true;
  if (isThematicBreak(line)) return true;
  if (isBlockquoteLine(line)) return true;
  if (matchListItemLine(line) !== null) return true;
  if (matchStandaloneImage(line) !== null) return true;
  if (matchDangerousHtmlBlockStart(line) !== null) return true;

  const nextLine = lines[index + 1];
  if (nextLine !== undefined && line.includes('|') && parseTableDelimiterRow(nextLine) !== null) {
    return splitTableCells(line).length > 0;
  }
  return false;
}

/** 줄 배열을 순회하며 블록 AST 노드 배열을 생성합니다. */
function parseBlockLines(lines: readonly string[], depth: number, budget: ParseBudget): readonly MarkdownBlockNode[] {
  const blocks: MarkdownBlockNode[] = [];
  let cursor = 0;

  while (cursor < lines.length && blocks.length < MAX_MARKDOWN_BLOCKS) {
    if (budget.exhausted || !budget.node()) break;
    const line = lines[cursor] ?? '';
    if (!budget.spend(line.length + 1)) {
      blocks.push({ kind: 'paragraph', children: [{ kind: 'text', text: line }] });
      break;
    }

    if (!line.trim()) {
      cursor += 1;
      continue;
    }

    // 1. 위험 원시 HTML 컨테이너 블록(<script>, <style>, <iframe>, <!-- -->) 제거 후 잔여 평문 보존
    const dangerousEndToken = matchDangerousHtmlBlockStart(line);
    if (dangerousEndToken !== null) {
      const rawHtmlLines: string[] = [];
      while (cursor < lines.length) {
        const currentLine = lines[cursor] ?? '';
        rawHtmlLines.push(currentLine);
        cursor += 1;
        if (currentLine.toLowerCase().includes(dangerousEndToken)) break;
      }
      const residual = stripDangerousHtmlBlocks(rawHtmlLines.join('\n')).trim();
      if (residual) {
        const residualNodes = parseInline(residual, 0, budget);
        if (residualNodes.length > 0) {
          blocks.push({ kind: 'paragraph', children: residualNodes });
        }
      }
      continue;
    }

    // 2. 펜스 코드 블록 (``` 또는 ~~~)
    const fence = matchFenceStart(line);
    if (fence !== null) {
      cursor += 1;
      const codeLines: string[] = [];
      while (cursor < lines.length) {
        const codeLine = lines[cursor] ?? '';
        if (isFenceClose(codeLine, fence)) {
          cursor += 1;
          break;
        }
        codeLines.push(codeLine);
        cursor += 1;
      }
      blocks.push({
        kind: 'codeBlock',
        language: fence.language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // 3. ATX 제목 (# ~ ######)
    const heading = matchAtxHeading(line);
    if (heading !== null) {
      blocks.push({
        kind: 'heading',
        level: heading.level,
        children: parseInline(heading.content, 0, budget),
      });
      cursor += 1;
      continue;
    }

    // 4. 수평 구분선 (---, ***, ___)
    if (isThematicBreak(line)) {
      blocks.push({ kind: 'thematicBreak' });
      cursor += 1;
      continue;
    }

    // 5. 인용문 (> ...)
    if (isBlockquoteLine(line)) {
      const quoteLines: string[] = [];
      const flatten = depth >= MAX_MARKDOWN_DEPTH;
      while (cursor < lines.length && isBlockquoteLine(lines[cursor] ?? '')) {
        quoteLines.push(stripBlockquotePrefix(lines[cursor] ?? '', flatten));
        cursor += 1;
      }
      if (flatten) {
        const text = quoteLines.join('\n').trim();
        if (text) {
          blocks.push({ kind: 'paragraph', children: parseInline(text, 0, budget) });
        }
      } else {
        blocks.push({ kind: 'blockquote', blocks: parseBlockLines(quoteLines, depth + 1, budget) });
      }
      continue;
    }

    // 6. GFM 표 (헤더 행 + 정렬 구분 행 + 본문 행)
    const nextLine = lines[cursor + 1];
    if (nextLine !== undefined && line.includes('|')) {
      const alignments = parseTableDelimiterRow(nextLine);
      const rawHeaderCells = alignments ? splitTableCells(line) : [];
      if (alignments && rawHeaderCells.length > 0) {
        const parsedTable = parseTableContainer(lines, {
          startIndex: cursor,
          alignments,
          rawHeaderCells,
          budget,
        });
        blocks.push(parsedTable.node);
        cursor = parsedTable.nextIndex;
        continue;
      }
    }

    // 7. 순서 있는/없는 목록
    const listMatch = matchListItemLine(line);
    if (listMatch !== null) {
      const parsedList = parseListContainer(lines, {
        startIndex: cursor,
        firstMatch: listMatch,
        depth,
        parseSubBlocks: (childLines, childDepth) => parseBlockLines(childLines, childDepth, budget),
        budget,
      });
      blocks.push(parsedList.node);
      cursor = parsedList.nextIndex;
      continue;
    }

    // 8. 단독 블록 이미지 ![alt](url)
    const standaloneImage = matchStandaloneImage(line);
    if (standaloneImage !== null) {
      blocks.push({
        kind: 'image',
        alt: standaloneImage.alt,
        url: standaloneImage.url,
      });
      cursor += 1;
      continue;
    }

    // 9. Setext 제목 (=== 또는 ---) 또는 일반 문단
    const paragraphLines: string[] = [line];
    cursor += 1;
    let setextLevel: 1 | 2 | null = null;

    while (cursor < lines.length) {
      const current = lines[cursor] ?? '';
      if (paragraphLines.length === 1 && /^[ \t]{0,3}(=+|-+)[ \t]*$/.test(current)) {
        const trimmedSetext = current.trim();
        if (trimmedSetext.startsWith('=')) {
          setextLevel = 1;
          cursor += 1;
          break;
        }
        if (trimmedSetext.startsWith('-') && trimmedSetext.length >= 2) {
          setextLevel = 2;
          cursor += 1;
          break;
        }
      }
      if (startsNewBlock(lines, cursor)) break;
      paragraphLines.push(current);
      cursor += 1;
    }

    const joined = paragraphLines.join('\n').trim();
    if (!joined) continue;

    if (setextLevel !== null) {
      blocks.push({
        kind: 'heading',
        level: setextLevel,
        children: parseInline(joined, 0, budget),
      });
      continue;
    }

    const inlineNodes = parseInline(joined, 0, budget);
    if (inlineNodes.length > 0) {
      blocks.push({ kind: 'paragraph', children: inlineNodes });
    }
  }

  return blocks;
}

/**
 * 마크다운 원문을 안전한 블록 AST 배열로 파싱합니다.
 */
export function parseMarkdown(source: string, budget: ParseBudget = createParseBudget()): readonly MarkdownBlockNode[] {
  if (!source) return [];
  const boundedSource =
    source.length > MAX_MARKDOWN_LENGTH ? source.slice(0, MAX_MARKDOWN_LENGTH) : source;
  const rawLines = boundedSource.replace(/\r\n?/g, '\n').split('\n');
  const boundedLines =
    rawLines.length > MAX_MARKDOWN_LINES ? rawLines.slice(0, MAX_MARKDOWN_LINES) : rawLines;

  return parseBlockLines(boundedLines, 0, budget);
}
