/**
 * 역할: 안전한 마크다운 파서와 React Native 렌더러 사이의 불변 AST 타입 및 안전 상한 상수 정의
 * 사용 위치: src/features/markdown/ 하위 파서·렌더러 모듈 및 단위 테스트
 * 주요 기능:
 * - 인라인 노드(텍스트, 굵게, 기울임, 취소선, 인라인 코드, 줄바꿈, 링크, 이미지) 판별 합집합 정의
 * - 블록 노드(제목 1~6, 문단, 코드 블록, 인용문, 중첩 목록, 구분선, GFM 표, 이미지) 판별 합집합 정의
 * - 악성 대용량·과도한 중첩 입력에 대한 상한(bounded work) 상수 선언
 */

/** 악성 초대형 마크다운 입력으로 인한 UI 스레드 차단을 막는 최대 입력 글자 수입니다. */
export const MAX_MARKDOWN_LENGTH = 100_000 as const;

/** 파서가 한 번에 처리할 최대 줄 수입니다. */
export const MAX_MARKDOWN_LINES = 5_000 as const;

/** 파서가 생성할 최대 최상위/하위 블록 노드 수입니다. */
export const MAX_MARKDOWN_BLOCKS = 1_500 as const;

/** 인용문 및 중첩 목록의 최대 허용 중첩 깊이입니다. 초과 중첩은 평탄화합니다. */
export const MAX_MARKDOWN_DEPTH = 8 as const;

/** 인라인 강조/링크의 최대 허용 중첩 깊이입니다. */
export const MAX_INLINE_DEPTH = 8 as const;

/** 단일 블록 안에서 생성할 수 있는 최대 인라인 노드 수입니다. */
export const MAX_INLINE_NODES = 1_000 as const;

/** GFM 표 한 행에서 허용하는 최대 열 개수입니다. */
export const MAX_TABLE_COLUMNS = 32 as const;

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type TableAlignment = 'left' | 'center' | 'right';

export type MarkdownInlineNode =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly children: readonly MarkdownInlineNode[] }
  | { readonly kind: 'emphasis'; readonly children: readonly MarkdownInlineNode[] }
  | { readonly kind: 'strikethrough'; readonly children: readonly MarkdownInlineNode[] }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'break' }
  | {
      readonly kind: 'link';
      readonly url: string;
      readonly children: readonly MarkdownInlineNode[];
    }
  | {
      readonly kind: 'image';
      readonly alt: string;
      /** https 스킴 검증을 통과한 안전한 URL만 담기며, 허용되지 않은 스킴은 null입니다. */
      readonly url: string | null;
    };

export interface MarkdownListItem {
  readonly blocks: readonly MarkdownBlockNode[];
}

export type MarkdownBlockNode =
  | {
      readonly kind: 'heading';
      readonly level: HeadingLevel;
      readonly children: readonly MarkdownInlineNode[];
    }
  | {
      readonly kind: 'paragraph';
      readonly children: readonly MarkdownInlineNode[];
    }
  | {
      readonly kind: 'codeBlock';
      readonly language: string;
      readonly code: string;
    }
  | {
      readonly kind: 'blockquote';
      readonly blocks: readonly MarkdownBlockNode[];
    }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly MarkdownListItem[];
    }
  | {
      readonly kind: 'thematicBreak';
    }
  | {
      readonly kind: 'image';
      readonly alt: string;
      /** https 스킴 검증을 통과한 안전한 URL만 담기며, 허용되지 않은 스킴은 null입니다. */
      readonly url: string | null;
    }
  | {
      readonly kind: 'table';
      readonly alignments: readonly TableAlignment[];
      readonly headers: readonly (readonly MarkdownInlineNode[])[];
      readonly rows: readonly (readonly (readonly MarkdownInlineNode[])[])[];
    };
