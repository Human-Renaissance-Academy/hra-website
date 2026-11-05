/**
 * 역할: 마크다운 블록 파서를 위한 행 단위 패턴 판별(제목, 구분선, 펜스 코드, 표, 목록, 단독 이미지) 보조 모듈
 * 사용 위치: src/features/markdown/block-parser.ts
 * 주요 기능:
 * - 역추적 없는 선형 문자열 검사로 ATX 제목, 구분선, 코드 펜스, GFM 표 구분행, 목록 항목 판별
 * - 이스케이프된 파이프(\|)를 보존하면서 GFM 표 셀을 분리하고 최대 열 개수 상한 적용
 */
import { decodeHtmlEntities, sanitizeImageUrl } from './sanitize-url';
import {
  MAX_TABLE_COLUMNS,
  type HeadingLevel,
  type TableAlignment,
} from './types';

export interface FenceStartMatch {
  readonly marker: '`' | '~';
  readonly count: number;
  readonly language: string;
}

export interface ListLineMatch {
  readonly indent: number;
  readonly ordered: boolean;
  readonly start: number;
  readonly content: string;
}

/** 들여쓰기 공백 길이를 계산합니다(탭은 공백 2칸으로 환산). */
export function measureIndent(line: string): { readonly indent: number; readonly trimmed: string } {
  let indent = 0;
  let idx = 0;
  while (idx < line.length) {
    const ch = line.charAt(idx);
    if (ch === ' ') indent += 1;
    else if (ch === '\t') indent += 2;
    else break;
    idx += 1;
  }
  return { indent, trimmed: line.slice(idx) };
}

/** 수평 구분선(---, ***, ___) 여부를 판별합니다. */
export function isThematicBreak(line: string): boolean {
  const { indent, trimmed } = measureIndent(line);
  if (indent > 3 || trimmed.length < 3) return false;
  const first = trimmed.charAt(0);
  if (first !== '-' && first !== '*' && first !== '_') return false;

  let markerCount = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed.charAt(i);
    if (ch === first) markerCount += 1;
    else if (ch !== ' ' && ch !== '\t') return false;
  }
  return markerCount >= 3;
}

/** ATX 제목(# ~ ######)을 판별하고 제목 단계(1~6)와 본문을 반환합니다. */
export function matchAtxHeading(line: string): {
  readonly level: HeadingLevel;
  readonly content: string;
} | null {
  const { indent, trimmed } = measureIndent(line);
  if (indent > 3 || !trimmed.startsWith('#')) return null;

  let hashes = 0;
  while (hashes < trimmed.length && trimmed.charAt(hashes) === '#') {
    hashes += 1;
  }
  if (hashes < 1 || hashes > 6) return null;

  const rest = trimmed.slice(hashes);
  if (rest.length > 0 && rest.charAt(0) !== ' ' && rest.charAt(0) !== '\t') {
    return null;
  }

  const content = rest.trim().replace(/[ \t]+#+[ \t]*$/, '').trim();
  return { level: hashes as HeadingLevel, content };
}

/** 펜스 코드 블록 시작(``` 또는 ~~~) 여부를 판별합니다. */
export function matchFenceStart(line: string): FenceStartMatch | null {
  const { indent, trimmed } = measureIndent(line);
  if (indent > 3 || trimmed.length < 3) return null;
  const first = trimmed.charAt(0);
  if (first !== '`' && first !== '~') return null;

  let count = 0;
  while (count < trimmed.length && trimmed.charAt(count) === first) {
    count += 1;
  }
  if (count < 3) return null;

  const info = trimmed.slice(count).trim();
  if (first === '`' && info.includes('`')) return null;
  const language = info.split(/\s+/)[0] ?? '';

  return { marker: first, count, language };
}

/** 펜스 코드 블록 닫힘 행 여부를 판별합니다. */
export function isFenceClose(line: string, fence: FenceStartMatch): boolean {
  const { indent, trimmed } = measureIndent(line);
  if (indent > 3 || trimmed.length < fence.count) return false;
  let count = 0;
  while (count < trimmed.length && trimmed.charAt(count) === fence.marker) {
    count += 1;
  }
  if (count < fence.count) return false;
  return trimmed.slice(count).trim().length === 0;
}

/** 한 줄 전체가 단독 마크다운 이미지(![alt](url))인지 판별합니다. */
export function matchStandaloneImage(
  line: string,
): { readonly alt: string; readonly url: string | null } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('![') || !trimmed.endsWith(')')) return null;

  const closeBracket = trimmed.indexOf('](');
  if (closeBracket === -1) return null;
  const alt = decodeHtmlEntities(trimmed.slice(2, closeBracket).trim());
  const rawInside = trimmed.slice(closeBracket + 2, -1).trim();
  if (!rawInside || rawInside.includes(')')) return null;

  const rawUrl = rawInside.split(/\s+/)[0] ?? '';
  return { alt, url: sanitizeImageUrl(rawUrl) };
}

/** 이스케이프된 파이프(\|)를 보존하면서 GFM 표 한 행을 셀 문자열 배열로 분리합니다. */
export function splitTableCells(line: string): readonly string[] {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return [];

  const stripStart = trimmed.startsWith('|') ? 1 : 0;
  const stripEnd =
    trimmed.endsWith('|') && !trimmed.endsWith('\\|') ? trimmed.length - 1 : trimmed.length;
  const body = trimmed.slice(stripStart, stripEnd);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === '\\' && body.charAt(i + 1) === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      if (cells.length >= MAX_TABLE_COLUMNS) break;
      continue;
    }
    current += ch;
  }
  if (cells.length < MAX_TABLE_COLUMNS) {
    cells.push(current.trim());
  }
  return cells;
}

/** GFM 표 정렬 구분행(| --- | :---: | ---: |)을 파싱합니다. */
export function parseTableDelimiterRow(line: string): readonly TableAlignment[] | null {
  if (!line.includes('|') || !line.includes('-')) return null;
  const cells = splitTableCells(line);
  if (cells.length === 0) return null;

  const alignments: TableAlignment[] = [];
  for (const cell of cells) {
    if (!/^:?-+:?$/.test(cell)) return null;
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) alignments.push('center');
    else if (right) alignments.push('right');
    else alignments.push('left');
  }
  return alignments;
}

/** 순서 있는 목록(1. / 1)) 또는 순서 없는 목록(- / * / +) 행을 판별합니다. */
export function matchListItemLine(line: string): ListLineMatch | null {
  if (isThematicBreak(line)) return null;
  const { indent, trimmed } = measureIndent(line);
  if (!trimmed) return null;

  const bulletMatch = /^([-*+])[ \t]+(.*)$/.exec(trimmed);
  if (bulletMatch) {
    return {
      indent,
      ordered: false,
      start: 1,
      content: applyTaskListPrefix(bulletMatch[2] ?? ''),
    };
  }

  const orderedMatch = /^(\d{1,9})[.)][ \t]+(.*)$/.exec(trimmed);
  if (orderedMatch) {
    const parsedStart = Number.parseInt(orderedMatch[1] ?? '1', 10);
    return {
      indent,
      ordered: true,
      start: Number.isFinite(parsedStart) && parsedStart >= 0 ? parsedStart : 1,
      content: applyTaskListPrefix(orderedMatch[2] ?? ''),
    };
  }

  return null;
}

/** GFM 체크리스트(- [ ] / - [x]) 접두어를 읽기 쉬운 기호로 변환합니다. */
function applyTaskListPrefix(content: string): string {
  if (/^\[ \][ \t]+/.test(content)) {
    return `☐ ${content.slice(3).trimStart()}`;
  }
  if (/^\[[xX]\][ \t]+/.test(content)) {
    return `☑ ${content.slice(3).trimStart()}`;
  }
  return content;
}

/** 위험 원시 HTML 블록(<script>, <style>, <iframe> 등)의 여는 줄인지 판별합니다. */
export function matchDangerousHtmlBlockStart(line: string): string | null {
  const trimmed = line.trimStart().toLowerCase();
  if (trimmed.startsWith('<!--')) return '-->';
  const match = /^<(script|style|iframe|object|embed|svg|math|applet)(?:[\s/>]|$)/.exec(trimmed);
  if (!match || !match[1]) return null;
  return `</${match[1]}`;
}
