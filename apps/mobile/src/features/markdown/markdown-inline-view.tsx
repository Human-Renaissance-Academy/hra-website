/**
 * 역할: 마크다운 인라인 AST 노드 및 https 전용 SafeMarkdownImage를 렌더링하는 서브모듈
 * 사용 위치: src/features/markdown/markdown-view.tsx
 * 주요 기능:
 * - 텍스트, 굵게, 기울임, 취소선, 인라인 코드, 줄바꿈, 안전한 외부 링크(accessibilityRole="link") 렌더링
 * - https 이미지 URL만 로드하고 비-https 스킴이나 로드 실패 시 대체 텍스트(alt)를 표시하는 SafeMarkdownImage 제공
 */
import { useState, type ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import { AppText, Button } from '../../ui';
import { useAutomaticImage } from './image-policy';
import { markdownStyles } from './markdown-styles';
import { sanitizeImageUrl, sanitizeLinkUrl } from './sanitize-url';
import { markdownStrings } from './strings';
import type { MarkdownInlineNode } from './types';

function assertNever(value: never): never {
  throw new Error(`Unhandled inline markdown node: ${JSON.stringify(value)}`);
}

/** https 이미지 URL만 렌더링하고, 비-https 스킴이나 로드 오류 시 대체 텍스트를 표시합니다. */
export function SafeMarkdownImage({
  alt,
  url,
  identity,
}: {
  readonly alt: string;
  readonly url: string | null;
  readonly identity?: object;
}) {
  const [failed, setFailed] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const safeUrl = url ? sanitizeImageUrl(url) : null;
  const automatic = useAutomaticImage(safeUrl, identity);
  const fallbackText = alt.trim() || markdownStrings.defaultImageAlt;

  if (!safeUrl || failed || (!automatic && loadedUrl !== safeUrl)) {
    return (
      <View style={markdownStyles.imageFallbackBox} accessibilityRole="text">
        <AppText variant="bodySmall" tone="secondary" selectable>
          {fallbackText}
        </AppText>
        {safeUrl && !failed ? <Button label="이미지 불러오기" onPress={() => setLoadedUrl(safeUrl)} /> : null}
      </View>
    );
  }

  return (
    <View style={markdownStyles.imageContainer}>
      <Image
        accessible
        source={{ uri: safeUrl }}
        accessibilityRole="image"
        accessibilityLabel={fallbackText}
        resizeMode="contain"
        onError={() => setFailed(true)}
        style={markdownStyles.image}
      />
      {alt.trim() ? (
        <AppText variant="caption" tone="secondary" selectable>
          {alt}
        </AppText>
      ) : null}
    </View>
  );
}

/** 인라인 노드 트리를 재귀적으로 React Native Text 자식으로 변환합니다. */
export function renderInlineNodes(
  nodes: readonly MarkdownInlineNode[],
  onLinkPress: (url: string) => void,
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-i-${index}`;
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'break':
        return '\n';
      case 'code':
        return (
          <Text key={key} style={markdownStyles.inlineCode}>
            {node.text}
          </Text>
        );
      case 'strong':
        return (
          <Text key={key} style={markdownStyles.strong}>
            {renderInlineNodes(node.children, onLinkPress, key)}
          </Text>
        );
      case 'emphasis':
        return (
          <Text key={key} style={markdownStyles.emphasis}>
            {renderInlineNodes(node.children, onLinkPress, key)}
          </Text>
        );
      case 'strikethrough':
        return (
          <Text key={key} style={markdownStyles.strikethrough}>
            {renderInlineNodes(node.children, onLinkPress, key)}
          </Text>
        );
      case 'link': {
        const safeUrl = sanitizeLinkUrl(node.url);
        if (!safeUrl) {
          return (
            <Text key={key}>
              {renderInlineNodes(node.children, onLinkPress, key)}
            </Text>
          );
        }
        return (
          <Text
            key={key}
            accessibilityRole="link"
            style={markdownStyles.link}
            onPress={() => onLinkPress(safeUrl)}
          >
            {renderInlineNodes(node.children, onLinkPress, key)}
          </Text>
        );
      }
      case 'image':
        return (
          <Text key={key} style={markdownStyles.inlineImageAlt}>
            {node.alt.trim() || markdownStrings.defaultImageAlt}
          </Text>
        );
      default:
        return assertNever(node);
    }
  });
}

/** 문단 내에 인라인 이미지가 섞여 있을 때 텍스트 구간과 이미지 블록을 분리해 렌더링합니다. */
export function renderInlineFlow(
  nodes: readonly MarkdownInlineNode[],
  onLinkPress: (url: string) => void,
  keyPrefix: string,
): ReactNode {
  if (!nodes.some((node) => node.kind === 'image')) {
    return (
      <AppText variant="body" selectable>
        {renderInlineNodes(nodes, onLinkPress, keyPrefix)}
      </AppText>
    );
  }

  const segments: ReactNode[] = [];
  let buffer: MarkdownInlineNode[] = [];
  const flushBuffer = (idx: number) => {
    if (buffer.length === 0) return;
    const current = buffer;
    buffer = [];
    segments.push(
      <AppText key={`${keyPrefix}-seg-${idx}`} variant="body" selectable>
        {renderInlineNodes(current, onLinkPress, `${keyPrefix}-seg-${idx}`)}
      </AppText>,
    );
  };

  nodes.forEach((node, idx) => {
    if (node.kind === 'image') {
      flushBuffer(idx);
      segments.push(
        <SafeMarkdownImage key={`${keyPrefix}-img-${idx}`} alt={node.alt} url={node.url} identity={node} />,
      );
    } else {
      buffer.push(node);
    }
  });
  flushBuffer(nodes.length);

  return <View style={markdownStyles.inlineFlowContainer}>{segments}</View>;
}
