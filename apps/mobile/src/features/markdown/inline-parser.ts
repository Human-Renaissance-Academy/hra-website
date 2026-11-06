/**
 * 역할: 마크다운 인라인 문법(강조, 취소선, 인라인 코드, 링크, 이미지, 줄바꿈)을 선형 스캔으로 안전하게 파싱
 * 사용 위치: src/features/markdown/block-parser.ts, block-containers.ts 및 단위 테스트
 * 주요 기능:
 * - 정규식 역추적(catastrophic backtracking) 없이 문자 단위 커서 스캔으로 인라인 AST 생성
 * - 허용되지 않은 링크 스킴(javascript: 등)은 평문으로 강등하고, 원시 HTML 태그는 제거(<br>만 줄바꿈 변환)
 * - 최대 중첩 깊이(MAX_INLINE_DEPTH)와 최대 노드 수(MAX_INLINE_NODES) 상한 강제
 */
import { ASCII_PUNCTUATION, isWordChar, matchBracketAndParen, matchDelimitedSpan, stripInlineHtmlTags } from './inline-helpers';
import { decodeHtmlEntities, sanitizeImageUrl, sanitizeLinkUrl, stripDangerousHtmlBlocks } from './sanitize-url';
import { MAX_INLINE_DEPTH, MAX_INLINE_NODES, type MarkdownInlineNode } from './types';
import { createParseBudget, type ParseBudget } from './parse-budget';

/**
 * 마크다운 인라인 문자열을 안전한 AST 노드 배열로 변환합니다.
 */
export function parseInline(rawInput: string, depth: number = 0, budget: ParseBudget = createParseBudget()): readonly MarkdownInlineNode[] {
  const source = depth === 0 ? stripDangerousHtmlBlocks(rawInput) : rawInput;
  if (!source) return [];
  if (depth >= MAX_INLINE_DEPTH) {
    return [{ kind: 'text', text: decodeHtmlEntities(stripInlineHtmlTags(source)) }];
  }

  const nodes: MarkdownInlineNode[] = [];
  let textBuffer = '';
  let cursor = 0;

  const flushText = () => {
    if (!textBuffer) return;
    const decoded = decodeHtmlEntities(textBuffer);
    textBuffer = '';
    if (!decoded) return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'text') {
      nodes[nodes.length - 1] = { kind: 'text', text: last.text + decoded };
    } else {
      nodes.push({ kind: 'text', text: decoded });
    }
  };

  while (cursor < source.length) {
    if (!budget.spend() || !budget.node(3)) {
      textBuffer += source.slice(cursor);
      break;
    }
    if (nodes.length >= MAX_INLINE_NODES) {
      textBuffer += stripInlineHtmlTags(source.slice(cursor));
      break;
    }

    const ch = source.charAt(cursor);

    // 1. 이스케이프 문자 및 백슬래시 강제 줄바꿈(\ + \n)
    if (ch === '\\') {
      const next = source.charAt(cursor + 1);
      if (next === '\n' || (next === '\r' && source.charAt(cursor + 2) === '\n')) {
        flushText();
        nodes.push({ kind: 'break' });
        cursor += next === '\r' ? 3 : 2;
        continue;
      }
      if (next && ASCII_PUNCTUATION.has(next)) {
        textBuffer += next;
        cursor += 2;
        continue;
      }
    }

    // 2. 공백 2개 이상 + 줄바꿈(Hard line break) 또는 일반 줄바꿈
    if (ch === ' ') {
      let spaceEnd = cursor;
      while (source.charAt(spaceEnd) === ' ' && budget.spend()) spaceEnd += 1;
      const afterSpaces = source.charAt(spaceEnd);
      if (spaceEnd - cursor >= 2 && (afterSpaces === '\n' || afterSpaces === '\r')) {
        flushText();
        nodes.push({ kind: 'break' });
        cursor = spaceEnd + (afterSpaces === '\r' && source.charAt(spaceEnd + 1) === '\n' ? 2 : 1);
        continue;
      }
      textBuffer += source.slice(cursor, spaceEnd);
      cursor = spaceEnd;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      textBuffer += ' ';
      cursor += ch === '\r' && source.charAt(cursor + 1) === '\n' ? 2 : 1;
      continue;
    }

    // 3. 인라인 코드 (`code` 또는 ``code``)
    if (ch === '`') {
      let tickEnd = cursor;
      while (source.charAt(tickEnd) === '`') tickEnd += 1;
      const fence = source.slice(cursor, tickEnd);
      const closeIdx = budget.spend(source.length - tickEnd) ? source.indexOf(fence, tickEnd) : -1;
      if (closeIdx !== -1) {
        flushText();
        let codeText = source.slice(tickEnd, closeIdx).replace(/\r?\n/g, ' ');
        if (codeText.length >= 2 && codeText.startsWith(' ') && codeText.endsWith(' ') && codeText.trim().length > 0) {
          codeText = codeText.slice(1, -1);
        }
        nodes.push({ kind: 'code', text: codeText });
        cursor = closeIdx + fence.length;
        continue;
      }
      textBuffer += fence;
      cursor = tickEnd;
      continue;
    }

    // 4. 인라인 이미지 ![alt](url)
    if (ch === '!' && source.charAt(cursor + 1) === '[') {
      const matched = matchBracketAndParen(source, cursor + 1, budget);
      if (matched) {
        flushText();
        nodes.push({
          kind: 'image',
          alt: decodeHtmlEntities(stripInlineHtmlTags(matched.label).trim()),
          url: sanitizeImageUrl(matched.url),
        });
        cursor = matched.nextIndex;
        continue;
      }
    }

    // 5. 링크 [label](url)
    if (ch === '[') {
      const matched = matchBracketAndParen(source, cursor, budget);
      if (matched) {
        flushText();
        const safeUrl = sanitizeLinkUrl(matched.url);
        const children = parseInline(matched.label, depth + 1, budget);
        if (safeUrl) {
          nodes.push({ kind: 'link', url: safeUrl, children });
        } else {
          for (const child of children) nodes.push(child);
        }
        cursor = matched.nextIndex;
        continue;
      }
    }

    // 6. <br>, 자동 링크(<https://...>), 또는 원시 HTML 태그(<tag>)
    if (ch === '<') {
      const closeAngle = budget.spend(source.length - cursor) ? source.indexOf('>', cursor + 1) : -1;
      if (closeAngle !== -1 && closeAngle - cursor <= 2048) {
        const inner = source.slice(cursor + 1, closeAngle).trim();
        if (/^br\s*\/?$/i.test(inner)) {
          flushText();
          nodes.push({ kind: 'break' });
          cursor = closeAngle + 1;
          continue;
        }
        if (/^(?:https?:\/\/|mailto:|tel:)/i.test(inner) && !/\s/.test(inner)) {
          const safeAutoUrl = sanitizeLinkUrl(inner);
          if (safeAutoUrl) {
            flushText();
            nodes.push({
              kind: 'link',
              url: safeAutoUrl,
              children: [{ kind: 'text', text: inner }],
            });
            cursor = closeAngle + 1;
            continue;
          }
        }
        if (/^\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*)?\/?$/.test(inner) || inner.startsWith('!')) {
          cursor = closeAngle + 1;
          continue;
        }
      }
    }

    // 7. 굵게 + 기울임(*** / ___), 굵게(** / __), 취소선(~~), 기울임(* / _)
    if (ch === '*' || ch === '_' || ch === '~') {
      const prevChar = cursor > 0 ? source.charAt(cursor - 1) : '';
      if (!(ch === '_' && isWordChar(prevChar))) {
        if ((ch === '*' || ch === '_') && source.startsWith(ch.repeat(3), cursor)) {
          const match = matchDelimitedSpan(source, cursor, ch.repeat(3), budget);
          if (match) {
            flushText();
            nodes.push({
              kind: 'strong',
              children: [{ kind: 'emphasis', children: parseInline(match.content, depth + 1, budget) }],
            });
            cursor = match.nextIndex;
            continue;
          }
        }
        if ((ch === '*' || ch === '_') && source.startsWith(ch.repeat(2), cursor)) {
          const match = matchDelimitedSpan(source, cursor, ch.repeat(2), budget);
          if (match) {
            flushText();
            nodes.push({ kind: 'strong', children: parseInline(match.content, depth + 1, budget) });
            cursor = match.nextIndex;
            continue;
          }
        }
        if (ch === '~' && source.startsWith('~~', cursor)) {
          const match = matchDelimitedSpan(source, cursor, '~~', budget);
          if (match) {
            flushText();
            nodes.push({ kind: 'strikethrough', children: parseInline(match.content, depth + 1, budget) });
            cursor = match.nextIndex;
            continue;
          }
        }
        if (ch === '*' || ch === '_') {
          const match = matchDelimitedSpan(source, cursor, ch, budget);
          if (match) {
            flushText();
            nodes.push({ kind: 'emphasis', children: parseInline(match.content, depth + 1, budget) });
            cursor = match.nextIndex;
            continue;
          }
        }
      }
    }

    textBuffer += ch;
    cursor += 1;
  }

  flushText();
  return nodes;
}
