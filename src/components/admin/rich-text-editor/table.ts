/**
 * 리치 텍스트 에디터 표(GFM 테이블) 변환 함수
 *
 * 역할:
 * - Tiptap 표 노드(JSONContent)를 저장용 문자열로 바꿉니다.
 *   - 열 너비(colwidth)가 있으면 `<colgroup>`을 포함한 HTML로 저장해 공개 페이지에서 너비를 보존합니다.
 *   - 열 너비가 없으면 GFM Markdown 표로 저장하되 셀 안 줄바꿈은 `<br>`로 보존합니다 (#118).
 * - marked가 만든 "table" 토큰을 Tiptap 표 노드 JSON으로 되돌립니다.
 *   셀 내용은 인라인 토큰을 파싱해 굵게·링크 등의 서식이 글자로 이스케이프되지 않게 합니다 (#118).
 *
 * 사용 위치: `./extensions.ts`의 MarkdownTable 확장 (renderMarkdown / parseMarkdown)
 *
 * DOM·React에 의존하지 않는 순수 함수만 두어 단위 테스트로 직접 검증합니다.
 */

import { renderTableToMarkdown } from "@tiptap/extension-table";
import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { escapeHtml, escapeHtmlAttr, isBlankMarkdownText } from "./markdown";

// marked 의 표 셀 토큰. tokens 는 셀 내용을 인라인 단위(굵게·링크·줄바꿈 등)로 나눈 결과다.
export type MarkedTableCell = { text: string; tokens?: MarkdownToken[] };
// marked 의 표 토큰 — 헤더 행 하나와 본문 행 목록으로 구성된다.
export type MarkedTableToken = {
  header: MarkedTableCell[];
  rows: MarkedTableCell[][];
};

// renderTableToMarkdown 에 전달되는 Markdown 렌더링 헬퍼 타입
export type TableMarkdownHelpers = Parameters<typeof renderTableToMarkdown>[1];

// JSONContent 단락(paragraph) 노드의 인라인 자식들을 HTML 문자열로 변환
// bold / italic / strike / code / link / hardBreak 지원
// renderMarkdown 콜백은 실제로 JSONContent(plain object)를 전달하므로 배열 API 사용
export function inlineNodesToHtml(blockNode: JSONContent): string {
  let html = "";
  for (const inline of (blockNode.content ?? [])) {
    if (inline.type === "hardBreak") { html += "<br>"; continue; }
    if (inline.type !== "text") continue;
    let text = escapeHtml(inline.text ?? "");
    for (const mark of (inline.marks ?? [])) {
      if (mark.type === "code")        text = `<code>${text}</code>`;
      else if (mark.type === "bold")   text = `<strong>${text}</strong>`;
      else if (mark.type === "italic") text = `<em>${text}</em>`;
      else if (mark.type === "strike") text = `<s>${text}</s>`;
      else if (mark.type === "link") {
        const href = escapeHtmlAttr(String(mark.attrs?.href ?? ""));
        text = `<a href="${href}">${text}</a>`;
      }
    }
    html += text;
  }
  return html;
}

/** 표의 첫 행 첫 셀에 열 너비가 지정되어 있는지 확인합니다 (HTML 저장 여부 판단 기준). */
export function hasTableColWidths(tableNode: JSONContent): boolean {
  // node 는 JSONContent(plain object) — content 는 배열이므로 배열 API 사용
  const firstRowFirstCell = (tableNode.content ?? [])[0]?.content?.[0];
  return !!((firstRowFirstCell?.attrs?.colwidth as number[] | null)?.[0]);
}

/**
 * TipTap table JSONContent → HTML 문자열 직렬화 (colwidth 있을 때 사용)
 *
 * - <colgroup><col width="X%"> 로 열 너비 비율을 공개 페이지에 보존
 * - 각 셀에 colwidth="N" 속성을 포함해 에디터 재편집 시 round-trip 복원
 *   (TipTap TableCell.parseHTML 이 colwidth 속성을 읽어 colwidth: [N] 으로 복원)
 */
export function renderTableAsHtml(tableNode: JSONContent): string {
  const rows = tableNode.content ?? [];
  const firstRow = rows[0];
  if (!firstRow) return "";

  // 첫 행 기준 열 너비(px) 수집
  const colwidths: number[] = [];
  for (const cell of (firstRow.content ?? [])) {
    colwidths.push((cell.attrs?.colwidth as number[] | null)?.[0] ?? 0);
  }
  const totalWidth = colwidths.reduce((a, b) => a + b, 0);

  let html = "<table>\n";

  // colgroup — 절대 픽셀값을 그대로 사용해 공개 페이지에서 편집 시 설정한 너비 그대로 보존
  // (prose-table:w-full 을 [&_table:has(colgroup)]:w-auto 로 해제하므로 table-layout:fixed
  //  + 절대 픽셀 col 로 원본 크기가 재현됨)
  if (totalWidth > 0) {
    html += "<colgroup>";
    for (const w of colwidths) {
      html += `<col width="${w}">`;
    }
    html += "</colgroup>\n";
  }

  let bodyOpened = false;
  rows.forEach((row, rowIdx) => {
    const isHeaderRow = (row.content ?? [])[0]?.type === "tableHeader";
    if (rowIdx === 0 && isHeaderRow) {
      html += "<thead>";
    } else if (!bodyOpened) {
      html += "<tbody>";
      bodyOpened = true;
    }

    html += "<tr>";
    for (const cell of (row.content ?? [])) {
      const tag = cell.type === "tableHeader" ? "th" : "td";
      const cw = (cell.attrs?.colwidth as number[] | null)?.[0];
      const cwAttr = cw ? ` colwidth="${cw}"` : ""; // round-trip 복원용
      let cellHtml = "";
      let paragraphIdx = 0;
      for (const block of (cell.content ?? [])) {
        if (paragraphIdx > 0) cellHtml += "<br>";
        cellHtml += inlineNodesToHtml(block);
        paragraphIdx++;
      }
      html += `<${tag}${cwAttr}>${cellHtml}</${tag}>`;
    }
    html += "</tr>";

    if (rowIdx === 0 && isHeaderRow) html += "</thead>\n";
  });

  if (bodyOpened) html += "</tbody>\n";
  html += "</table>";
  return html;
}

/**
 * 표 셀 안 줄바꿈을 GFM 표로 저장할 때 잠시 대신 넣어 둘 문자를 고른다.
 * 사설 영역(U+E000~) 문자 중 이 표에 실제로 쓰이지 않은 것을 골라, 본문에 우연히 들어 있던
 * 같은 문자(HWP 에서 붙여 넣은 글 등)가 줄바꿈으로 바뀌는 일을 막는다.
 */
export function pickCellBreakPlaceholder(tableNode: JSONContent): string {
  const serialized = JSON.stringify(tableNode);
  for (let code = 0xe000; code <= 0xe0ff; code += 1) {
    const candidate = String.fromCharCode(code);
    if (!serialized.includes(candidate)) return candidate;
  }
  // 256개가 모두 쓰인 표는 현실적으로 없다. 그래도 값은 돌려준다.
  return "";
}

/**
 * 표 노드를 GFM 마크다운 표로 직렬화하되, 셀 안 줄바꿈을 `<br>` 로 보존한다 (#118).
 *
 * 라이브러리의 renderTableToMarkdown 은 셀 내용의 공백·줄바꿈을 모두 한 칸 공백으로 합친다.
 * 그대로 쓰면 "김철수<br>이영희" 가 저장 후 "김철수 이영희" 가 되어 줄바꿈이 사라진다.
 * 그래서 줄바꿈 노드를 임시 문자로 바꿔 직렬화한 뒤, 결과 문자열에서 `<br>` 로 되돌린다.
 * 한 셀에 문단이 여러 개인 경우(Enter 로 나눈 줄)도 같은 임시 문자를 구분자로 써서 `<br>` 로 잇는다.
 */
export function renderTableKeepingBreaks(tableNode: JSONContent, helpers: TableMarkdownHelpers): string {
  const placeholder = pickCellBreakPlaceholder(tableNode);

  // 셀 → 블록 → 인라인 순으로 내려가며 hardBreak 만 임시 문자 텍스트로 바꾼 복사본을 만든다.
  // 자식이 없는 블록(셀 안의 이미지 등)은 그대로 둔다. 빈 content 를 붙이면 이미지가 직렬화에서 사라진다.
  const withPlaceholders: JSONContent = {
    ...tableNode,
    content: (tableNode.content ?? []).map((row) => ({
      ...row,
      content: (row.content ?? []).map((cell) => ({
        ...cell,
        content: (cell.content ?? []).map((block) =>
          block.content
            ? {
                ...block,
                content: block.content.map((inline) =>
                  inline.type === "hardBreak" ? { type: "text", text: placeholder } : inline,
                ),
              }
            : block,
        ),
      })),
    })),
  };

  return renderTableToMarkdown(withPlaceholders, helpers, { cellLineSeparator: placeholder }).replaceAll(
    placeholder,
    "<br>",
  );
}

/**
 * 표 노드 저장 형식 선택 — colwidth 가 있으면 <colgroup> 포함 HTML 로 저장해 공개 페이지 열 너비 보존,
 * colwidth 가 없으면 GFM 마크다운 표 형식을 유지한다.
 */
export function renderTableMarkdown(tableNode: JSONContent, helpers: TableMarkdownHelpers): string {
  if (hasTableColWidths(tableNode)) return renderTableAsHtml(tableNode);
  return renderTableKeepingBreaks(tableNode, helpers);
}

/**
 * marked "table" 토큰 → TipTap 표 노드 JSON
 *
 * 셀 내용은 반드시 인라인 토큰(cell.tokens)을 parseInline 으로 파싱해서 만든다 (#118).
 * 예전에는 셀의 원본 문자열(cell.text)을 통째로 텍스트 노드에 넣었다. 그러면 `**굵게**` 나
 * 링크 문법이 "글자" 로 취급되어 다음 저장 때 `\*\*굵게\*\*` 처럼 이스케이프되고,
 * 저장할 때마다 손상이 누적되어 공개 화면에 별표와 대괄호가 그대로 보였다.
 *
 * 빈 셀은 저장할 때 `&nbsp;` 로 기록된다 (빈 문단 직렬화 규칙). 다시 열 때 이를 글자로 읽으면
 * 다음 저장에서 `&amp;nbsp;` 가 되어 공개 화면에 "&nbsp;" 가 그대로 보이므로 빈 셀로 되돌린다.
 */
export function markedTableTokenToJson(
  token: MarkedTableToken,
  parseInline: (tokens: MarkdownToken[]) => JSONContent[],
): JSONContent {
  const toCell = (cell: MarkedTableCell, cellType: "tableHeader" | "tableCell") => ({
    type: cellType,
    content: [
      {
        type: "paragraph",
        content:
          !isBlankMarkdownText(cell.text) && cell.tokens && cell.tokens.length > 0 ? parseInline(cell.tokens) : [],
      },
    ],
  });

  return {
    type: "table",
    content: [
      { type: "tableRow", content: token.header.map((cell) => toCell(cell, "tableHeader")) },
      ...token.rows.map((row) => ({
        type: "tableRow",
        content: row.map((cell) => toCell(cell, "tableCell")),
      })),
    ],
  };
}
