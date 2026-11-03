/**
 * 리치 텍스트 에디터 Markdown 저장 규칙 공용 헬퍼
 *
 * 역할:
 * - 에디터가 Markdown 안에 HTML(크기 지정 이미지, 열 너비가 있는 표)을 직접 써 넣을 때
 *   사용하는 문자 이스케이프 규칙을 한곳에 둡니다.
 * - 빈 단락을 `&nbsp;`로 저장하는 규칙(공개 페이지 줄 간격 보존)과, 그 값을 다시 읽을 때
 *   빈 내용으로 판단하는 규칙을 같은 파일에서 짝지어 관리합니다.
 *
 * 사용 위치:
 * - `./table.ts` (표 HTML 직렬화, 빈 셀 판별)
 * - `./image-attrs.ts` (크기 지정 이미지의 HTML 속성)
 * - `./extensions.ts` (빈 단락 직렬화)
 *
 * React·Tiptap 런타임에 의존하지 않는 순수 함수만 두어 단위 테스트로 직접 검증합니다.
 */

/** 빈 단락을 저장할 때 쓰는 값 — 공개 페이지에서도 빈 줄 간격이 유지됩니다. */
export const EMPTY_PARAGRAPH_MARKDOWN = "&nbsp;";

/** 텍스트를 HTML 본문에 넣을 수 있도록 `&`, `<`, `>`를 문자 참조로 바꿉니다. */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 큰따옴표로 감싼 HTML 속성값 안에서 따옴표만 문자 참조로 바꿉니다 (본문 이스케이프와 함께 사용). */
export function escapeHtmlAttr(str: string): string {
  return str.replace(/"/g, "&quot;");
}

/**
 * Markdown 원문 조각이 "빈 내용"인지 판별합니다.
 * 빈 단락은 `&nbsp;`로 저장되므로, 다시 열 때 이를 글자로 읽지 않도록 빈 값과 같게 취급합니다.
 */
export function isBlankMarkdownText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || trimmed === EMPTY_PARAGRAPH_MARKDOWN;
}
