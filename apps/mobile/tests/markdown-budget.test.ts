/** 공격 형태별 결정적 작업 수와 문서 전체 AST 예산을 검증합니다. */
import { parseInline } from '../src/features/markdown/inline-parser';
import { parseMarkdown } from '../src/features/markdown/block-parser';
import { createParseBudget, MAX_DOCUMENT_NODES, MAX_PARSE_WORK } from '../src/features/markdown/parse-budget';

test.each(['[', '![', '*', '_', '`', ' ', '*a ', '_a ', '`a ', '<'])('반복 구분자 %s는 공유 작업 상한 안에서 평문으로 강등한다', (token) => {
  // Given
  const budget = createParseBudget();
  // When
  const nodes = parseInline(token.repeat(30_000), 0, budget);
  // Then
  expect(budget.work).toBeLessThanOrEqual(MAX_PARSE_WORK);
  expect(budget.nodes).toBeLessThanOrEqual(MAX_DOCUMENT_NODES);
  expect(nodes.length).toBeGreaterThan(0);
});

test.each([
  '> '.repeat(100) + '본문',
  Array.from({ length: 100 }, (_, i) => `${' '.repeat(i * 2)}- 항목`).join('\n'),
  '|a|'.repeat(32) + '\n' + '|---|'.repeat(32) + '\n' + ('|x|'.repeat(32) + '\n').repeat(1000),
  '[링크](https://fake.test) '.repeat(5000),
  '![그림](https://fake.test/image)\n\n'.repeat(5000),
])('중첩·표·대량 링크/이미지는 한 문서 예산을 공유한다', (source) => {
  // Given
  const budget = createParseBudget();
  // When
  const blocks = parseMarkdown(source, budget);
  // Then
  expect(blocks.length).toBeGreaterThan(0);
  expect(budget.work).toBeLessThanOrEqual(MAX_PARSE_WORK);
  expect(budget.nodes).toBeLessThanOrEqual(MAX_DOCUMENT_NODES);
});
