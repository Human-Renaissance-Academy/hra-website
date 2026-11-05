/**
 * 역할: 인라인 마크다운 파서를 위한 대괄호·소괄호 링크 매칭, 강조 구분자 탐색, 인라인 HTML 제거 보조 함수
 * 사용 위치: src/features/markdown/inline-parser.ts
 * 주요 기능:
 * - 역추적 없는 선형 스캔으로 [label](url "title") 패턴과 **, __, ~~, *, _ 닫는 위치 탐색
 * - 단어 내부 밑줄(snake_case) 오탐 방지 및 인라인 원시 HTML 태그 제거
 */
import { stripDangerousHtmlBlocks } from './sanitize-url';
import { createParseBudget, type ParseBudget } from './parse-budget';

export interface SpanMatch {
  readonly content: string;
  readonly nextIndex: number;
}

export interface LinkTargetMatch {
  readonly label: string;
  readonly url: string;
  readonly nextIndex: number;
}

export const ASCII_PUNCTUATION = new Set([
  '\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '~', '<', '>',
]);

export function isWordChar(ch: string): boolean {
  return /[a-zA-Z0-9가-힣]/.test(ch);
}

/** (url "optional title") 또는 (<url>) 형태에서 실제 URL 부분만 추출합니다. */
export function extractTargetUrl(rawInside: string): string {
  if (!rawInside) return '';
  if (rawInside.startsWith('<')) {
    const closeAngle = rawInside.indexOf('>');
    if (closeAngle !== -1) return rawInside.slice(1, closeAngle).trim();
  }
  const spaceMatch = /\s/.exec(rawInside);
  if (!spaceMatch || spaceMatch.index === undefined) return rawInside;
  return rawInside.slice(0, spaceMatch.index).trim();
}

/** 대괄호 [label] 과 이어지는 소괄호 (url "title") 쌍을 선형 탐색합니다. */
export function matchBracketAndParen(source: string, bracketStart: number, budget: ParseBudget = createParseBudget()): LinkTargetMatch | null {
  if (source.charAt(bracketStart) !== '[') return null;
  let depth = 0;
  let labelEnd = -1;

  for (let i = bracketStart; i < source.length; i += 1) {
    if (!budget.spend()) return null;
    const ch = source.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        labelEnd = i;
        break;
      }
    }
  }
  if (labelEnd === -1 || source.charAt(labelEnd + 1) !== '(') return null;

  const parenStart = labelEnd + 1;
  let parenDepth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < source.length; i += 1) {
    if (!budget.spend()) return null;
    const ch = source.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') return null;
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        parenEnd = i;
        break;
      }
    }
  }
  if (parenEnd === -1) return null;

  const label = source.slice(bracketStart + 1, labelEnd);
  const rawInside = source.slice(parenStart + 1, parenEnd).trim();
  const url = extractTargetUrl(rawInside);

  return { label, url, nextIndex: parenEnd + 1 };
}

/** 동일한 구분자(**, __, ~~, *, _)의 닫는 위치를 선형 탐색합니다. */
export function matchDelimitedSpan(source: string, start: number, delimiter: string, budget: ParseBudget = createParseBudget()): SpanMatch | null {
  const contentStart = start + delimiter.length;
  if (contentStart >= source.length) return null;
  const firstAfter = source.charAt(contentStart);
  if (!firstAfter || firstAfter === ' ' || firstAfter === '\t' || firstAfter === '\n') {
    return null;
  }

  let searchFrom = contentStart;
  while (searchFrom < source.length) {
    if (!budget.spend(source.length - searchFrom)) return null;
    const closeIdx = source.indexOf(delimiter, searchFrom);
    if (closeIdx === -1) return null;
    if (source.charAt(closeIdx - 1) === '\\') {
      searchFrom = closeIdx + delimiter.length;
      continue;
    }
    if (delimiter.length === 1 && source.charAt(closeIdx + 1) === delimiter) {
      searchFrom = closeIdx + 2;
      continue;
    }
    const content = source.slice(contentStart, closeIdx);
    if (!content.trim()) return null;
    return { content, nextIndex: closeIdx + delimiter.length };
  }
  return null;
}

/** 인라인 원시 HTML 태그를 제거하고 텍스트만 남깁니다(상한 도달 시 폴백용). */
export function stripInlineHtmlTags(input: string): string {
  return stripDangerousHtmlBlocks(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*)?>/g, '');
}
