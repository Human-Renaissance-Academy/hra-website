/**
 * 역할: 마크다운 순수 AST 파서(parseMarkdown, parseInline) 및 URL/HTML 정화기(sanitizeLinkUrl, sanitizeImageUrl) 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 제목 1~6, 문단, 강조/취소선/인라인 코드, 펜스 코드, 인용문, 중첩 목록, 구분선, GFM 표, 줄바꿈 파싱 검증
 * - 악성 입력(script/iframe/onerror, javascript:/data:/http: 이미지, 과도한 중첩, 닫히지 않은 마크업, 대용량 입력) 방어 검증
 */
import {
  MAX_MARKDOWN_DEPTH,
  MAX_MARKDOWN_LENGTH,
  parseInline,
  parseMarkdown,
  sanitizeImageUrl,
  sanitizeLinkUrl,
} from '../src/features/markdown';

describe('sanitizeLinkUrl & sanitizeImageUrl 보안 매트릭스', () => {
  test.each([
    ['https://hra-website-theta.vercel.app/notices/1', 'https://hra-website-theta.vercel.app/notices/1'],
    ['http://example.com/guide?page=1', 'http://example.com/guide?page=1'],
    ['mailto:support@hra.kr', 'mailto:support@hra.kr'],
    ['tel:02-1234-5678', 'tel:02-1234-5678'],
    ['  https://example.com/trimmed  ', 'https://example.com/trimmed'],
  ] as const)('허용된 링크 스킴(%s)은 정규화된 URL을 반환한다', (input, expected) => {
    // Given / When
    const actual = sanitizeLinkUrl(input);
    // Then
    expect(actual).toBe(expected);
  });

  test.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(document.cookie)'],
    ['java\nscript:alert(1)'],
    ['\u0000javascript:alert(1)'],
    ['vbscript:msgbox("xss")'],
    ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['file:///etc/passwd'],
    ['intent://scan/#Intent;scheme=zxing;end'],
    ['//evil.example.com/phish'],
    ['/\\evil.example.com/phish'],
    ['https://user:password@example.com/secret'],
    ['mailto:not-an-email'],
    ['tel:abc-no-digits'],
    [''],
  ] as const)('위험하거나 허용되지 않은 링크 URL(%s)은 null로 차단한다', (hostileUrl) => {
    // Given / When
    const actual = sanitizeLinkUrl(hostileUrl);
    // Then
    expect(actual).toBeNull();
  });

  test.each([
    ['https://example.com/poster.png', 'https://example.com/poster.png'],
    ['http://example.com/insecure.png', null],
    ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', null],
    ['javascript:alert(1)', null],
    ['file:///local/image.png', null],
    ['/relative/image.png', null],
    ['//cdn.example.com/image.png', null],
    ['https://user:pass@example.com/image.png', null],
  ] as const)('이미지 URL(%s)은 오직 자격증명 없는 https 스킴만 허용한다', (input, expected) => {
    // Given / When
    const actual = sanitizeImageUrl(input);
    // Then
    expect(actual).toBe(expected);
  });
});

describe('parseMarkdown 문법 지원 및 적대적 입력 방어', () => {
  test('제목 1~6, 강조/굵게/취소선/인라인 코드, 강제 줄바꿈, 구분선, 인용문을 파싱한다', () => {
    // Given
    const source = [
      '# 제목 1',
      '## 제목 2 ##',
      '###### 제목 6',
      '',
      '첫 줄  ',
      '둘째 줄\\',
      '셋째 줄<br>넷째 줄 **굵게** *기울임* ~~취소선~~ `코드`',
      '',
      '---',
      '',
      '> 인용문 첫 줄',
      '> > 중첩 인용문',
    ].join('\n');

    // When
    const blocks = parseMarkdown(source);

    // Then
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      children: [{ kind: 'text', text: '제목 1' }],
    });
    expect(blocks[1]).toEqual({
      kind: 'heading',
      level: 2,
      children: [{ kind: 'text', text: '제목 2' }],
    });
    expect(blocks[2]).toEqual({
      kind: 'heading',
      level: 6,
      children: [{ kind: 'text', text: '제목 6' }],
    });
    expect(blocks[3]).toEqual({
      kind: 'paragraph',
      children: [
        { kind: 'text', text: '첫 줄' },
        { kind: 'break' },
        { kind: 'text', text: '둘째 줄' },
        { kind: 'break' },
        { kind: 'text', text: '셋째 줄' },
        { kind: 'break' },
        { kind: 'text', text: '넷째 줄 ' },
        { kind: 'strong', children: [{ kind: 'text', text: '굵게' }] },
        { kind: 'text', text: ' ' },
        { kind: 'emphasis', children: [{ kind: 'text', text: '기울임' }] },
        { kind: 'text', text: ' ' },
        { kind: 'strikethrough', children: [{ kind: 'text', text: '취소선' }] },
        { kind: 'text', text: ' ' },
        { kind: 'code', text: '코드' },
      ],
    });
    expect(blocks[4]).toEqual({ kind: 'thematicBreak' });
    expect(blocks[5]?.kind).toBe('blockquote');
  });

  test('중첩된 순서/비순서 목록과 GFM 표(이스케이프 파이프 포함), 펜스 코드 블록을 파싱한다', () => {
    // Given
    const source = [
      '- 항목 A',
      '  - 중첩 A-1',
      '- 항목 B',
      '',
      '3. 번호 셋',
      '4. 번호 넷',
      '',
      '| 구분 | 설명 | 정렬 |',
      '| :--- | :---: | ---: |',
      '| `코드` | 파이프 \\| 포함 | **강조** |',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    // When
    const blocks = parseMarkdown(source);

    // Then
    const unordered = blocks[0];
    expect(unordered?.kind).toBe('list');
    if (unordered?.kind === 'list') {
      expect(unordered.ordered).toBe(false);
      expect(unordered.items).toHaveLength(2);
      expect(unordered.items[0]?.blocks[1]?.kind).toBe('list');
    }

    const ordered = blocks[1];
    expect(ordered).toMatchObject({ kind: 'list', ordered: true, start: 3 });

    const table = blocks[2];
    expect(table?.kind).toBe('table');
    if (table?.kind === 'table') {
      expect(table.alignments).toEqual(['left', 'center', 'right']);
      expect(table.rows[0]?.[1]).toEqual([{ kind: 'text', text: '파이프 | 포함' }]);
    }

    expect(blocks[3]).toEqual({
      kind: 'codeBlock',
      language: 'ts',
      code: 'const x = 1;',
    });
  });

  test.each([
    ['<script>alert("xss")</script>안전한 공지', '안전한 공지'],
    ['<SCRIPT src="https://evil.com/x.js"></SCRIPT>본문', '본문'],
    ['<style>body { display: none; }</style>표시 텍스트', '표시 텍스트'],
    ['<iframe src="https://evil.com">악성 프레임</iframe>정상 문장', '정상 문장'],
    ['<img src="x" onerror="alert(1)">이미지 태그 제거', '이미지 태그 제거'],
    ['<div onclick="steal()">인라인 이벤트 제거</div>', '인라인 이벤트 제거'],
    ['<!-- 숨겨진 주석 -->주석 뒤 본문', '주석 뒤 본문'],
  ] as const)('원시 HTML 공격 입력(%s)에서 위험 태그와 스크립트 본문을 제거한다', (raw, expectedText) => {
    // Given / When
    const blocks = parseMarkdown(raw);
    // Then
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        children: [{ kind: 'text', text: expectedText }],
      },
    ]);
  });

  test('javascript: 링크는 링크 노드로 만들지 않고 평문으로 강등하며, 과도한 중첩과 미닫힘 마크업을 상한 내에 처리한다', () => {
    // Given
    const hostileInline = parseInline('[클릭 유도](javascript:alert(1)) **미닫힘 강조 `미닫힘 코드');
    const deepQuotes = `${'> '.repeat(80)}깊은 인용문`;
    const hugeSource = '가나다라마바사아자차카타파하 '.repeat(10_000);

    // When
    const startedAt = Date.now();
    const quoteBlocks = parseMarkdown(deepQuotes);
    const hugeBlocks = parseMarkdown(hugeSource);
    const elapsedMs = Date.now() - startedAt;

    // Then
    expect(hostileInline.some((node) => node.kind === 'link')).toBe(false);
    expect(hostileInline[0]).toEqual({ kind: 'text', text: '클릭 유도 **미닫힘 강조 `미닫힘 코드' });

    let depth = 0;
    let cursor = quoteBlocks[0];
    while (cursor?.kind === 'blockquote') {
      depth += 1;
      cursor = cursor.blocks[0];
    }
    expect(depth).toBeLessThanOrEqual(MAX_MARKDOWN_DEPTH);
    expect(cursor).toEqual({
      kind: 'paragraph',
      children: [{ kind: 'text', text: '깊은 인용문' }],
    });
    expect(hugeSource.length).toBeGreaterThan(MAX_MARKDOWN_LENGTH);
    expect(hugeBlocks.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(500);
  });
});
