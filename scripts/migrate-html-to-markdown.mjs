/**
 * 과거 HTML 본문을 Markdown으로 바꾸던 일괄 변환의 순수 변환 규칙만 보존하고 변경 계획만 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 *
 * 배경:
 *   기존 RichTextEditor가 TipTap HTML을 DB에 저장했기 때문에 에디터를 Markdown 입출력으로 바꾸면서
 *   아래 다섯 열의 기존 HTML 본문을 Markdown으로 변환했습니다.
 *
 * 이전 동작(비활성):
 *   - 인자 없이 실행하면 `.env`의 DATABASE_URL로 접속해 다섯 열 전체 행을 조회하고, HTML로 보이는 행마다
 *     즉시 UPDATE했습니다. 대상 확인·백업·승인·전체 transaction 없이 행 단위로 반영되어 일부만 바뀔 수 있었습니다.
 *   - `--dry-run`은 같은 실제 DB 조회를 수행하고 행 id와 변환 결과 앞 200자를 콘솔에 출력했습니다(UPDATE 없음).
 *   두 경로 모두 실제 운영 본문을 읽거나 출력하므로 더 이상 제공하지 않습니다.
 *
 * 현재 동작:
 *   - 무인자: 접속 없는 고정 계획만 출력합니다.
 *   - `--confirm-apply`: 대상·복구·승인을 확인할 수 없어 접속 전에 거부합니다.
 *   - `--dry-run`: 실제 본문 조회가 필요한 미리보기이므로 접속 전에 거부합니다.
 *   - 그 밖의 인자: 원문을 반사하지 않고 거부합니다.
 *
 * 순수 export(모듈 import 시 출력·종료·DB 접속 부작용 없음):
 *   - htmlToMarkdownTargets: 과거 변환 대상 표·열 선언
 *   - looksLikeHtml(): HTML 여부 판정 휴리스틱
 *   - createHtmlToMarkdownConverter(): 기존 Turndown 설정을 그대로 사용하는 변환 함수 생성기
 */

// 과거 변환 대상 열 선언입니다. 실제 DB의 존재·내용·변환 필요 여부를 뜻하지 않습니다.
export const htmlToMarkdownTargets = Object.freeze([
  Object.freeze({ table: "notices", column: "content" }),
  Object.freeze({ table: "class_logs", column: "content" }),
  Object.freeze({ table: "weekly_texts", column: "body" }),
  Object.freeze({ table: "report_templates", column: "body" }),
  // 이름은 markdown이지만 과거에는 실제로 HTML이 저장되어 있었습니다.
  Object.freeze({ table: "recruitment_settings", column: "details_markdown" }),
]);

// HTML 여부 판단 휴리스틱
// - 알려진 HTML 태그명만 매칭 (마크다운 autolink `<https://...>`, `<user@...>` 보호)
// - 닫는 태그(</p>) 또는 self-closing(<br/>) 도 함께 인식
const HTML_TAG_NAMES = [
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "code", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "i", "iframe", "img", "ins", "kbd", "li", "mark", "nav", "ol", "p", "pre",
  "q", "s", "samp", "section", "small", "span", "strong", "sub", "summary",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
  "video", "audio", "source",
];
const HTML_TAG_REGEX = new RegExp(
  `<\\/?(?:${HTML_TAG_NAMES.join("|")})(?:\\s[^>]*)?\\/?>`,
  "i",
);

/** 알려진 HTML 태그가 하나라도 있으면 true를 반환합니다. 빈 값·NULL은 false입니다. */
export function looksLikeHtml(value) {
  if (!value) return false;
  return HTML_TAG_REGEX.test(value);
}

/**
 * 기존 일괄 변환과 같은 Turndown 설정의 HTML→Markdown 변환 함수를 만듭니다.
 * 변환 라이브러리는 이 함수를 호출할 때만 불러오므로 CLI 계획·모듈 import는 DOM 파서를 읽지 않습니다.
 * 반환 함수는 입력 문자열만 사용하고 DB·파일·네트워크에 접근하지 않습니다.
 */
export async function createHtmlToMarkdownConverter() {
  const { default: TurndownService } = await import("turndown");
  const { gfm } = await import("turndown-plugin-gfm");

  // ATX 헤딩(#), fenced 코드블록(```), 리스트는 - 사용
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
  });

  // GFM 플러그인 (테이블, 취소선, 작업목록 지원)
  turndown.use(gfm);

  // 비표준 마크다운 요소 제거: style/color/highlight/정렬은 마크다운에 매핑 불가
  turndown.remove(["style", "script"]);

  // span 의 inline style (color/background-color) 은 무시하고 텍스트만 남김
  turndown.addRule("stripInlineStyle", {
    filter: (node) => node.nodeName === "SPAN" && node.getAttribute("style"),
    replacement: (content) => content,
  });

  return (html) => turndown.turndown(html).trim();
}

/** 본문·행 id·URL·인자 원문을 출력하지 않고 선언 수와 고정 계획 또는 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log(`HTML→Markdown 변환 계획: 선언 대상 열 ${htmlToMarkdownTargets.length}개. 실제 DB 본문은 조회하지 않았으며 직접 변환·적용은 비활성입니다. 접속·변경하지 않습니다. [HTML_MARKDOWN_CONVERSION_PLAN]`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 변환을 차단합니다. [HTML_MARKDOWN_CONVERSION_TARGET_UNTRUSTED]");
    return 1;
  }
  if (args.length === 1 && args[0] === "--dry-run") {
    console.error("이전 미리보기는 실제 DB 본문을 조회·출력했으므로 더 이상 제공하지 않습니다. 인자 없이 변경 계획을 확인하세요. [HTML_MARKDOWN_CONVERSION_DRY_RUN_UNAVAILABLE]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [HTML_MARKDOWN_CONVERSION_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
