/**
 * 역할: 마크다운 AST를 React Native 디자인 토큰 컴포넌트로 안전하게 렌더링하는 뷰어 컴포넌트
 * 사용 위치: 공지 상세 화면(app/(app)/notices/[id].tsx), 과제 상세 안내문 등
 * 주요 기능:
 * - 제목(1~6), 문단, 강조/굵게/취소선, 인라인·펜스 코드, 인용문, 중첩 목록, 구분선, 링크, 이미지, GFM 표 렌더링
 * - 원시 HTML 미실행, 외부 링크(http/https/mailto/tel) 확인 대화상자("외부 링크를 엽니다") 후 열기
 * - https 이미지 URL만 로드하고 그 외 스킴이나 로드 실패 시 대체 텍스트(alt) 표시
 */
import { useMemo, type ReactNode } from 'react';
import { Linking, ScrollView, View, type TextStyle } from 'react-native';
import type { TypographyVariant } from '../../theme';
import { AppText, confirmAction, Divider } from '../../ui';
import { parseMarkdown } from './block-parser';
import { renderInlineFlow, renderInlineNodes, SafeMarkdownImage } from './markdown-inline-view';
import { markdownStyles } from './markdown-styles';
import { sanitizeLinkUrl } from './sanitize-url';
import { markdownStrings } from './strings';
import type { HeadingLevel, MarkdownBlockNode, TableAlignment } from './types';
import { getApiBaseUrl } from '../../config/env';
import { isApprovedImage, MarkdownImagePolicy, MAX_DOCUMENT_IMAGES } from './image-policy';
import { collectDocumentImages } from './document-images';

export interface MarkdownViewProps {
  readonly source: string;
  readonly onOpenLink?: ((url: string) => void) | undefined;
}

const HEADING_VARIANT_MAP: Readonly<Record<HeadingLevel, TypographyVariant>> = {
  1: 'title',
  2: 'heading',
  3: 'subheading',
  4: 'body',
  5: 'bodySmall',
  6: 'caption',
};

const BULLET_MARKERS = ['•', '◦', '▪'] as const;

function assertNever(value: never): never {
  throw new Error(`Unhandled markdown block: ${JSON.stringify(value)}`);
}

function resolveTextAlign(alignment: TableAlignment | undefined): TextStyle['textAlign'] {
  if (alignment === 'center' || alignment === 'right') return alignment;
  return 'left';
}

/** 블록 AST 노드 배열을 재귀적으로 렌더링합니다. */
function renderBlocks(
  blocks: readonly MarkdownBlockNode[],
  onLinkPress: (url: string) => void,
  listDepth: number,
): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `b-${listDepth}-${index}`;
    switch (block.kind) {
      case 'heading':
        return (
          <View
            key={key}
            style={block.level === 2 ? markdownStyles.headingLevel2Box : markdownStyles.headingBox}
          >
            <AppText
              variant={HEADING_VARIANT_MAP[block.level]}
              weight={block.level >= 4 ? '600' : undefined}
              accessibilityRole="header"
              selectable
            >
              {renderInlineNodes(block.children, onLinkPress, key)}
            </AppText>
          </View>
        );
      case 'paragraph':
        return <View key={key}>{renderInlineFlow(block.children, onLinkPress, key)}</View>;
      case 'codeBlock':
        return (
          <View
            key={key}
            accessibilityLabel={markdownStrings.codeBlockA11yLabel}
            style={markdownStyles.codeBlockContainer}
          >
            {block.language ? (
              <AppText variant="caption" tone="secondary" weight="600">
                {block.language}
              </AppText>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <AppText variant="bodySmall" selectable style={markdownStyles.codeBlockText}>
                {block.code}
              </AppText>
            </ScrollView>
          </View>
        );
      case 'blockquote':
        return (
          <View
            key={key}
            accessibilityLabel={markdownStrings.blockquoteA11yLabel}
            style={markdownStyles.blockquote}
          >
            {renderBlocks(block.blocks, onLinkPress, listDepth)}
          </View>
        );
      case 'list': {
        const bullet = BULLET_MARKERS[listDepth % BULLET_MARKERS.length] ?? '•';
        return (
          <View key={key} style={markdownStyles.listContainer}>
            {block.items.map((item, itemIdx) => (
              <View key={`${key}-item-${itemIdx}`} style={markdownStyles.listItemRow}>
                <AppText variant="body" tone="secondary" style={markdownStyles.listMarker}>
                  {block.ordered ? `${block.start + itemIdx}.` : bullet}
                </AppText>
                <View style={markdownStyles.listItemContent}>
                  {renderBlocks(item.blocks, onLinkPress, listDepth + 1)}
                </View>
              </View>
            ))}
          </View>
        );
      }
      case 'thematicBreak':
        return <Divider key={key} spacing="sm" />;
      case 'image':
        return <SafeMarkdownImage key={key} alt={block.alt} url={block.url} identity={block} />;
      case 'table':
        return (
          <ScrollView
            key={key}
            horizontal
            showsHorizontalScrollIndicator
            accessibilityLabel={markdownStrings.tableScrollA11yLabel}
          >
            <View style={markdownStyles.table}>
              <View style={[markdownStyles.tableRow, markdownStyles.tableHeaderRow]}>
                {block.headers.map((headerCells, colIdx) => (
                  <View
                    key={`${key}-th-${colIdx}`}
                    style={[
                      markdownStyles.tableCell,
                      colIdx === block.headers.length - 1 ? markdownStyles.tableCellLast : null,
                    ]}
                  >
                    <AppText
                      variant="bodySmall"
                      weight="700"
                      align={resolveTextAlign(block.alignments[colIdx])}
                      selectable
                    >
                      {renderInlineNodes(headerCells, onLinkPress, `${key}-th-${colIdx}`)}
                    </AppText>
                  </View>
                ))}
              </View>
              {block.rows.map((row, rowIdx) => (
                <View
                  key={`${key}-tr-${rowIdx}`}
                  style={[
                    markdownStyles.tableRow,
                    rowIdx === block.rows.length - 1 ? markdownStyles.tableRowLast : null,
                  ]}
                >
                  {row.map((cellNodes, colIdx) => (
                    <View
                      key={`${key}-td-${rowIdx}-${colIdx}`}
                      style={[
                        markdownStyles.tableCell,
                        colIdx === row.length - 1 ? markdownStyles.tableCellLast : null,
                      ]}
                    >
                      <AppText
                        variant="bodySmall"
                        align={resolveTextAlign(block.alignments[colIdx])}
                        selectable
                      >
                        {renderInlineNodes(cellNodes, onLinkPress, `${key}-td-${rowIdx}-${colIdx}`)}
                      </AppText>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        );
      default:
        return assertNever(block);
    }
  });
}

/**
 * 마크다운 문자열을 안전하게 렌더링하는 공통 뷰어 컴포넌트입니다.
 */
export function MarkdownView(props: MarkdownViewProps) {
  const { source, onOpenLink } = props;
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  const automaticImages = useMemo(() => {
    try {
      let origin = 'https://invalid.invalid';
      try { origin = getApiBaseUrl(); } catch (error) { if (!(error instanceof Error)) throw error; }
      return new Set(collectDocumentImages(blocks).filter((node) => node.url && isApprovedImage(node.url, origin)).slice(0, MAX_DOCUMENT_IMAGES));
    } catch (error) { if (!(error instanceof Error)) throw error; return new Set<object>(); }
  }, [blocks]);

  const handleLinkPress = (rawUrl: string) => {
    const safeUrl = sanitizeLinkUrl(rawUrl);
    if (!safeUrl) return;
    void confirmAction({
      title: markdownStrings.openExternalLinkTitle,
      message: safeUrl,
      onConfirm: () => {
        if (onOpenLink) {
          onOpenLink(safeUrl);
          return;
        }
        // 링크를 처리할 외부 앱이 없거나 사용자가 시스템 선택 창을 닫으면 openURL이 거부됩니다.
        // 이미 확인 대화상자를 거친 이동 시도일 뿐 화면·세션 상태는 바뀌지 않으므로,
        // 처리되지 않은 Promise 거부가 앱 오류로 보고되지 않게 의도적으로 무시합니다.
        void Linking.openURL(safeUrl).catch(() => undefined);
      },
    });
  };

  if (blocks.length === 0) {
    return null;
  }

  return (
    <MarkdownImagePolicy.Provider value={automaticImages}><View style={markdownStyles.container}>
      {renderBlocks(blocks, handleLinkPress, 0)}
    </View></MarkdownImagePolicy.Provider>
  );
}
