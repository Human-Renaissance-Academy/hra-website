/**
 * 역할: 마크다운 렌더러(MarkdownView)에서 사용하는 한국어 안내 문구 정의
 * 사용 위치: src/features/markdown/markdown-view.tsx
 * 주요 기능:
 * - 외부 링크 열기 확인 대화상자 제목 및 안내 문구 제공
 * - 이미지 대체 텍스트 폴백, 코드 블록 및 표 접근성 레이블 제공
 */
export const markdownStrings = {
  /** 외부 링크 열기 확인 대화상자 제목 (요구사항: "외부 링크를 엽니다") */
  openExternalLinkTitle: '외부 링크를 엽니다',
  /** 이미지 대체 텍스트가 비어 있을 때의 기본 접근성 레이블 */
  defaultImageAlt: '공지 본문 이미지',
  /** 표 가로 스크롤 영역 접근성 레이블 */
  tableScrollA11yLabel: '표 내용 가로 스크롤 영역',
  /** 코드 블록 영역 접근성 레이블 */
  codeBlockA11yLabel: '코드 블록',
  /** 인용문 영역 접근성 레이블 */
  blockquoteA11yLabel: '인용문',
} as const;
