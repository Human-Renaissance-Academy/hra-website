/**
 * 리치 텍스트 에디터에서 분리한 순수 변환 함수 단위 테스트 (#415)
 *
 * 검증 대상 (src/components/admin/rich-text-editor/):
 * - markdown.ts    : HTML 이스케이프, 빈 단락(&nbsp;) 판별
 * - table.ts       : 표 → HTML/GFM 직렬화, 셀 서식·줄바꿈 보존, marked 토큰 → 표 JSON (#118)
 * - image-attrs.ts : 이미지 너비 정규화, 특수문자 인코딩·복원, Markdown/HTML 직렬화 (#292)
 *
 * 마지막 묶음은 순수 함수가 실제 RichTextEditor 저장값과 같은 결과를 내는지, 그리고
 * 원본(소스 모드) → 편집 → 미리보기 왕복에서 특수문자·표 서식·이미지 너비가 유지되는지 확인한다.
 * 이 저장소의 단위 테스트는 .ts 를 주로 쓰므로 JSX 대신 createElement 를 쓴다.
 */

import { createElement } from "react";
import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { EMPTY_PARAGRAPH_MARKDOWN, escapeHtml, escapeHtmlAttr, isBlankMarkdownText } from "@/components/admin/rich-text-editor/markdown";
import {
  hasTableColWidths,
  inlineNodesToHtml,
  markedTableTokenToJson,
  pickCellBreakPlaceholder,
  renderTableAsHtml,
  renderTableKeepingBreaks,
  renderTableMarkdown,
  type TableMarkdownHelpers,
} from "@/components/admin/rich-text-editor/table";
import {
  decodeMarkdownImageValue,
  encodeMarkdownImageValue,
  markdownImageTokenToAttrs,
  normalizeImageWidth,
  parseMarkdownImageAlt,
  renderImageMarkdown,
} from "@/components/admin/rich-text-editor/image-attrs";

beforeAll(() => {
  // ProseMirror 위치 계산에 필요한데 jsdom 에 없는 브라우저 API만 보충한다.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const rectangle = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rectangle;
  document.elementFromPoint = () => null;
});
afterEach(cleanup);

// ─ 테스트용 노드 생성 헬퍼 ─────────────────────────────────────────────

// 텍스트 노드 (선택적으로 서식 mark 적용)
const text = (value: string, ...marks: NonNullable<JSONContent["marks"]>): JSONContent => ({
  type: "text",
  text: value,
  ...(marks.length > 0 ? { marks } : {}),
});
// 단락 노드
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
// 셀 노드 (colwidth 지정 시 HTML 직렬화 대상)
const cell = (type: "tableHeader" | "tableCell", blocks: JSONContent[], colwidth?: number): JSONContent => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: colwidth ? [colwidth] : null },
  content: blocks,
});
const row = (...cells: JSONContent[]): JSONContent => ({ type: "tableRow", content: cells });
const table = (...rows: JSONContent[]): JSONContent => ({ type: "table", content: rows });

// renderTableToMarkdown 이 요구하는 렌더링 헬퍼의 최소 구현 — 셀 안 텍스트만 이어 붙인다.
function plainTextHelpers(): TableMarkdownHelpers {
  const renderChildren = (nodes: JSONContent | JSONContent[]): string =>
    (Array.isArray(nodes) ? nodes : [nodes])
      .map((node) => (node.type === "text" ? node.text ?? "" : renderChildren(node.content ?? [])))
      .join("");
  return { renderChildren, wrapInBlock: (prefix, content) => prefix + content, indent: (content) => content };
}

describe("markdown.ts 공용 저장 규칙", () => {
  it("HTML 본문·속성 이스케이프는 &를 먼저 바꿔 이중 인코딩 없이 구분자를 막는다", () => {
    expect(escapeHtml('A&B <b>"인용"</b>')).toBe('A&amp;B &lt;b&gt;"인용"&lt;/b&gt;');
    expect(escapeHtmlAttr(escapeHtml('"x" & <y>'))).toBe("&quot;x&quot; &amp; &lt;y&gt;");
  });

  it("빈 단락 저장값(&nbsp;)과 공백만 있는 셀을 빈 내용으로 판별한다", () => {
    expect(EMPTY_PARAGRAPH_MARKDOWN).toBe("&nbsp;");
    expect(isBlankMarkdownText("")).toBe(true);
    expect(isBlankMarkdownText("  &nbsp; ")).toBe(true);
    expect(isBlankMarkdownText("&nbsp;글자")).toBe(false);
    expect(isBlankMarkdownText("&amp;nbsp;")).toBe(false);
  });
});

describe("table.ts 표 변환", () => {
  it("셀 인라인 서식(굵게·기울임·취소선·코드·링크·줄바꿈)과 특수문자를 HTML 로 변환한다", () => {
    const html = inlineNodesToHtml(
      paragraph(
        text("<김&이>", { type: "bold" }),
        { type: "hardBreak" },
        text("기울임", { type: "italic" }),
        text("취소", { type: "strike" }),
        text("a<b", { type: "code" }),
        text("링크", { type: "link", attrs: { href: '/a?x="1"&y=2' } }),
        { type: "image", attrs: { src: "/무시.png" } },
      ),
    );
    expect(html).toBe(
      '<strong>&lt;김&amp;이&gt;</strong><br><em>기울임</em><s>취소</s><code>a&lt;b</code><a href="/a?x=&quot;1&quot;&y=2">링크</a>',
    );
  });

  it("열 너비가 있으면 colgroup·thead·tbody 와 셀 colwidth 를 포함한 HTML 로 저장한다", () => {
    const node = table(
      row(cell("tableHeader", [paragraph(text("이름"))], 120), cell("tableHeader", [paragraph(text("비고"))], 80)),
      row(cell("tableCell", [paragraph(text("김철수")), paragraph(text("이영희"))], 120), cell("tableCell", [paragraph()], 80)),
    );
    expect(hasTableColWidths(node)).toBe(true);
    expect(renderTableAsHtml(node)).toBe(
      "<table>\n" +
        '<colgroup><col width="120"><col width="80"></colgroup>\n' +
        '<thead><tr><th colwidth="120">이름</th><th colwidth="80">비고</th></tr></thead>\n' +
        '<tbody><tr><td colwidth="120">김철수<br>이영희</td><td colwidth="80"></td></tr></tbody>\n' +
        "</table>",
    );
    expect(renderTableMarkdown(node, plainTextHelpers())).toBe(renderTableAsHtml(node));
  });

  it("헤더 행이 없거나 빈 표도 기존 HTML 구조 규칙을 유지한다", () => {
    expect(renderTableAsHtml(table())).toBe("");
    expect(renderTableAsHtml(table(row(cell("tableCell", [paragraph(text("값"))], 50))))).toBe(
      '<table>\n<colgroup><col width="50"></colgroup>\n<tbody><tr><td colwidth="50">값</td></tr></tbody>\n</table>',
    );
  });

  it("표에 이미 쓰인 사설 영역 문자를 피해 셀 줄바꿈 임시 문자를 고른다", () => {
    expect(pickCellBreakPlaceholder(table(row(cell("tableCell", [paragraph(text("값"))]))))).toBe("\uE000");
    const used = table(row(cell("tableCell", [paragraph(text("\uE000\uE001"))])));
    expect(pickCellBreakPlaceholder(used)).toBe("\uE002");
  });

  it("열 너비가 없으면 GFM 표로 저장하고 셀 안 줄바꿈·문단 구분을 <br> 로, 본문의 사설 문자는 그대로 둔다", () => {
    const node = table(
      row(cell("tableHeader", [paragraph(text("이름"))]), cell("tableHeader", [paragraph(text("메모"))])),
      row(
        cell("tableCell", [paragraph(text("김철수"), { type: "hardBreak" }, text("이영희"))]),
        cell("tableCell", [paragraph(text("첫 줄")), paragraph(text("둘째\uE000줄"))]),
      ),
    );
    expect(hasTableColWidths(node)).toBe(false);
    const markdown = renderTableKeepingBreaks(node, plainTextHelpers());
    expect(markdown).toContain("김철수<br>이영희");
    expect(markdown).toContain("첫 줄<br>둘째\uE000줄");
    // 헤더 행 바로 다음 줄이 GFM 구분선이다.
    const lines = markdown.split("\n").filter((line) => line.trim() !== "");
    expect(lines[0]).toMatch(/^\|\s*이름\s*\|\s*메모\s*\|$/);
    expect(lines[1]).toMatch(/^\|\s*-+\s*\|\s*-+\s*\|$/);
    expect(renderTableMarkdown(node, plainTextHelpers())).toBe(markdown);
  });

  it("marked 표 토큰의 셀은 인라인 토큰으로 파싱하고 빈 셀·&nbsp; 셀은 빈 문단으로 되돌린다", () => {
    const tokens: MarkdownToken[] = [{ type: "strong", text: "굵게" }];
    const parsed: MarkdownToken[][] = [];
    const json = markedTableTokenToJson(
      {
        header: [{ text: "**굵게**", tokens }, { text: " " }],
        rows: [[{ text: "&nbsp;", tokens: [{ type: "text", text: "&nbsp;" }] }, { text: "값", tokens: [] }]],
      },
      (inline) => {
        parsed.push(inline);
        return [text("굵게", { type: "bold" })];
      },
    );
    // parseInline 은 내용이 있는 셀의 인라인 토큰으로만 호출된다.
    expect(parsed).toEqual([tokens]);
    expect(json).toEqual({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [text("굵게", { type: "bold" })] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [] }] },
          ],
        },
      ],
    });
  });
});

describe("image-attrs.ts 이미지 속성 변환", () => {
  it.each([
    ["1%", "1%"],
    ["33.3%", "33.3%"],
    ["100%", "100%"],
    ["050%", "50%"],
    ["0%", null],
    ["101%", null],
    ["50px", null],
    ["auto", null],
    ["50%; color: red", null],
    [50, null],
    [null, null],
  ])("너비 %s 는 %s 로 정규화한다", (input, expected) => {
    expect(normalizeImageWidth(input)).toBe(expected);
  });

  it("Markdown 구분자·공백·따옴표를 숫자 참조로 인코딩하고 한 번만 복원한다", () => {
    const raw = '설명 [표지] (괄호) *강조* _밑줄_ `코드` ~취소~ !느낌 |파이프| \\ "큰" \'작은\' <꺾쇠> &amp;\r\n\t끝';
    const encoded = encodeMarkdownImageValue(raw);
    expect(encoded).not.toMatch(/[[\]()*_`~!|\\"'<>\s]/);
    expect(decodeMarkdownImageValue(encoded)).toBe(raw);
    // 이미 문자 그대로인 `&amp;lt;` 는 한 단계만 복원되어 `&lt;` 글자로 남는다.
    expect(decodeMarkdownImageValue("&amp;lt;")).toBe("&lt;");
    expect(decodeMarkdownImageValue("&#x41;&#66;&LT;&#0;&#xD800;")).toBe("AB<��");
  });

  it("이미지 설명 토큰은 escape·codespan 원문을 유지하고 나머지는 문자 참조만 복원한다", () => {
    expect(
      parseMarkdownImageAlt([
        { type: "text", text: "설명 &#42;" },
        { type: "escape", text: "*" },
        { type: "codespan", text: "&#42;" },
        { type: "em", tokens: [{ type: "text", text: "&amp;기울임" }] },
      ]),
    ).toBe("설명 **&#42;&기울임");
  });

  it("너비가 없으면 Markdown 이미지, 너비가 있으면 인코딩된 <img> HTML 로 저장한다", () => {
    const attrs = { src: "/images/a b.png?x=1&y=2", alt: '설명 "인용"\n둘째 줄', title: "제목 <꺾쇠>" };
    expect(renderImageMarkdown(attrs)).toBe(
      `![${encodeMarkdownImageValue(attrs.alt)}](${encodeMarkdownImageValue(attrs.src)} "${encodeMarkdownImageValue(attrs.title)}")`,
    );
    expect(renderImageMarkdown({ ...attrs, title: null })).toBe(
      `![${encodeMarkdownImageValue(attrs.alt)}](${encodeMarkdownImageValue(attrs.src)})`,
    );
    expect(renderImageMarkdown({ ...attrs, width: "50%" })).toBe(
      '<img src="/images/a b.png?x=1&amp;y=2" alt="설명 &quot;인용&quot;&#10;둘째 줄" title="제목 &lt;꺾쇠&gt;" style="width: 50%" />',
    );
    // 지원하지 않는 너비는 원본 이미지(Markdown)로 저장한다.
    expect(renderImageMarkdown({ src: "/a.png", width: "50px" })).toBe("![](/a.png)");
    expect(renderImageMarkdown(undefined)).toBe("![]()");
  });

  it("image 토큰 → 속성 변환은 renderImageMarkdown 이 인코딩한 값을 그대로 되돌린다", () => {
    const attrs = { src: "/images/(가).png?q=\"1\"", alt: "설명 [괄호] *별*", title: "제목 'x'" };
    expect(
      markdownImageTokenToAttrs({
        type: "image",
        href: encodeMarkdownImageValue(attrs.src),
        text: encodeMarkdownImageValue(attrs.alt),
        title: encodeMarkdownImageValue(attrs.title),
      }),
    ).toEqual(attrs);
    expect(markdownImageTokenToAttrs({ type: "image" })).toEqual({ src: "", alt: null, title: null });
  });
});

// ─ 실제 에디터와의 일치·왕복 회귀 ───────────────────────────────────────

/** RichTextEditor 를 열고 실제 에디터 인스턴스와 저장용 hidden input 값을 돌려준다. */
async function open(markdown: string) {
  const view = render(createElement(RichTextEditor, { name: "body", defaultValue: markdown }));
  await waitFor(() => expect(view.container.querySelector(".ProseMirror")).not.toBeNull());
  const element = view.container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
  const saved = () => view.container.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]')?.value ?? "";
  return { view, editor: element.editor, saved };
}

/** 문서 끝에 문단을 추가해 초기 문자열이 아닌 실제 직렬화 결과가 저장되게 한다. */
async function touch(editor: Editor) {
  await act(async () => {
    editor.commands.insertContentAt(editor.state.doc.content.size, paragraph(text("끝")));
  });
}

describe("분리한 함수와 RichTextEditor 저장값의 일치 및 원본 ↔ 편집 ↔ 미리보기 왕복", () => {
  const image = { src: "/images/표지(가).png?a=1&b=\"2\"", alt: "설명 *별* [괄호] <꺾쇠> &amp;", title: "제목 \"인용\"" };
  const source = [
    "특수문자 \\*별표\\* &lt;꺾쇠&gt; 100% `코드`",
    "",
    "| 이름 | 메모 |",
    "| --- | --- |",
    "| **김철수** | [링크](https://example.com/a?x=1&y=2)<br>둘째 줄 |",
    "| &nbsp; | 값 |",
    "",
    renderImageMarkdown({ ...image, width: "40%" }),
    "",
    renderImageMarkdown(image),
  ].join("\n");

  it("에디터가 저장한 이미지 문자열은 고정 기대값 및 renderImageMarkdown 결과와 같다", async () => {
    const opened = await open("");
    await act(async () => {
      opened.editor.commands.insertContent({ type: "image", attrs: { ...image, width: "50%" } });
    });
    // 함수 결과와만 비교하면 자기 참조가 되므로, 저장 형식을 손으로 적은 고정 문자열로도 확인한다.
    const expected =
      '<img src="/images/표지(가).png?a=1&amp;b=&quot;2&quot;" alt="설명 *별* [괄호] &lt;꺾쇠&gt; &amp;amp;" title="제목 &quot;인용&quot;" style="width: 50%" />';
    expect(opened.saved()).toContain(expected);
    expect(renderImageMarkdown({ ...image, width: "50%" })).toBe(expected);
  });

  it("소스 모드에서 입력한 원본이 편집·재저장·미리보기에서 특수문자·표 서식·이미지 너비를 유지한다", async () => {
    // 1) 빈 에디터에서 소스 모드로 전환해 원본 Markdown 을 입력하고 WYSIWYG 로 돌아온다.
    const first = await open("");
    fireEvent.click(first.view.getByTitle("마크다운 소스 보기로 전환"));
    const textarea = first.view.container.querySelector("textarea");
    if (!textarea) throw new Error("소스 편집 textarea 를 찾지 못했습니다.");
    fireEvent.change(textarea, { target: { value: source } });
    fireEvent.click(first.view.getByTitle("WYSIWYG 보기로 전환"));
    await waitFor(() => expect(first.view.container.querySelector(".ProseMirror")).not.toBeNull());
    await touch(first.editor);
    const saved = first.saved();
    first.view.unmount();

    // 2) 저장값에 표 셀 서식·줄바꿈과 두 이미지 형식이 그대로 남는다.
    expect(saved).toContain("**김철수**");
    expect(saved).toContain("[링크](https://example.com/a?x=1&y=2)<br>둘째 줄");
    expect(saved).toContain(renderImageMarkdown({ ...image, width: "40%" }));
    expect(saved).toContain(renderImageMarkdown(image));
    expect(saved).not.toContain("&amp;nbsp;");

    // 3) 다시 열어 저장해도 달라지지 않는다 (손상 누적 없음).
    const second = await open(saved);
    const images: JSONContent[] = [];
    second.editor.state.doc.descendants((node) => {
      if (node.type.name === "image") images.push(node.toJSON());
    });
    expect(images.map((node) => node.attrs)).toEqual([
      expect.objectContaining({ ...image, width: "40%" }),
      expect.objectContaining({ ...image, width: null }),
    ]);
    await touch(second.editor);
    const savedAgain = second.saved();
    second.view.unmount();
    expect(savedAgain).toBe(`${saved}\n\n끝`);

    // 4) 공개 미리보기에서 서식·특수문자·이미지 너비가 렌더링된다.
    const preview = render(createElement(MarkdownViewer, { body: savedAgain }));
    expect(preview.container.textContent).toContain("특수문자 *별표* <꺾쇠> 100% 코드");
    const cells = preview.container.querySelectorAll("td");
    expect(cells[0]?.querySelector("strong")?.textContent).toBe("김철수");
    expect(cells[1]?.querySelector("a")?.getAttribute("href")).toBe("https://example.com/a?x=1&y=2");
    expect(cells[1]?.querySelector("br")).not.toBeNull();
    const rendered = preview.container.querySelectorAll("img");
    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.style.width).toBe("40%");
    expect(rendered[0]?.getAttribute("alt")).toBe(image.alt);
    expect(rendered[1]?.style.width).toBe("");
    expect(rendered[1]?.getAttribute("title")).toBe(image.title);
  });
});
