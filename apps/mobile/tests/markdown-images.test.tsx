/** 원격 이미지 자동 허용·문서 예산·명시적 로드 경계를 네이티브 요청 없이 검증합니다. */
import { fireEvent, render } from '@testing-library/react-native';
import { MarkdownView } from '../src/features/markdown/markdown-view';
import { isApprovedImage, MAX_DOCUMENT_IMAGES } from '../src/features/markdown/image-policy';

test.each([
  ['https://api.fake.test/a', true],
  ['https://store.public.blob.vercel-storage.com/a', true],
  ['https://evil.public.blob.vercel-storage.com.evil.test/a', false],
  ['https://tracker.test/a', false],
  ['http://api.fake.test/a', false],
  ['https://user:pass@api.fake.test/a', false],
])('이미지 URL %s 허용 정책을 적용한다', (url, approved) => {
  // Given / When / Then
  expect(isApprovedImage(url, 'https://api.fake.test')).toBe(approved);
});

test('외부 HTTPS는 누르기 전 Image가 없고 명시적으로 누른 뒤에만 마운트한다', async () => {
  // Given
  const view = await render(<MarkdownView source="![외부 그림](https://tracker.test/image)" />);
  expect(view.queryAllByRole('image')).toHaveLength(0);
  // When
  await fireEvent.press(view.getByRole('button', { name: '이미지 불러오기' }));
  // Then
  expect(view.getByRole('image')).toHaveProp('source', { uri: 'https://tracker.test/image' });
});

test('동일한 승인 URL을 반복해도 문서 자동 로드 예산을 우회하지 못한다', async () => {
  // Given
  const source = '![그림](https://store.public.blob.vercel-storage.com/a)\n\n'.repeat(25);
  // When
  const view = await render(<MarkdownView source={source} />);
  // Then
  expect(view.queryAllByRole('image')).toHaveLength(MAX_DOCUMENT_IMAGES);
  expect(view.queryAllByRole('button', { name: '이미지 불러오기' })).toHaveLength(5);
});

test('비HTTPS·자격증명 URL은 로드 버튼도 제공하지 않는다', async () => {
  // Given / When
  const view = await render(<MarkdownView source={'![가](http://tracker.test/a)\n\n![나](https://u:p@tracker.test/a)'} />);
  // Then
  expect(view.queryAllByRole('image')).toHaveLength(0);
  expect(view.queryAllByRole('button')).toHaveLength(0);
});
