/**
 * 역할: MarkdownView React Native 컴포넌트 렌더링 및 보안 상호작용(외부 링크 확인 대화상자, https 전용 이미지) 검증
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 제목 접근성 역할(header), 표/코드블록/목록/인용문 렌더링 검증
 * - 외부 링크 탭 시 "외부 링크를 엽니다" 확인 후에만 Linking.openURL 또는 onOpenLink가 호출됨을 검증
 * - 비-https 이미지(http:, data:)가 원격 요청 없이 대체 텍스트(alt)만 표시함을 검증
 */
import { fireEvent, render } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { MarkdownView } from '../src/features/markdown/markdown-view';
import { ko } from '../src/i18n/ko';

describe('MarkdownView 렌더링 및 안전 정책', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('제목 1~6(header 역할), 문단, 강조, 코드 블록, 인용문, 중첩 목록, GFM 표를 렌더링한다', async () => {
    // Given
    const markdown = [
      '# 1단계 제목',
      '## 2단계 제목',
      '',
      '일반 문단과 **굵은 글씨**, *기울임*, ~~취소선~~, `인라인코드`입니다.',
      '',
      '> 학사 공지 인용문',
      '',
      '- 상위 목록',
      '  - 하위 목록',
      '',
      '| 주차 | 주제 |',
      '| :--- | :--- |',
      '| 1주차 | 오리엔테이션 |',
      '',
      '```json',
      '{"ok": true}',
      '```',
    ].join('\n');

    // When
    const view = await render(<MarkdownView source={markdown} />);

    // Then
    expect(view.getByRole('header', { name: '1단계 제목' })).toBeTruthy();
    expect(view.getByRole('header', { name: '2단계 제목' })).toBeTruthy();
    expect(view.getByText(/일반 문단과/)).toBeTruthy();
    expect(view.getByText('학사 공지 인용문')).toBeTruthy();
    expect(view.getByText('상위 목록')).toBeTruthy();
    expect(view.getByText('하위 목록')).toBeTruthy();
    expect(view.getByText('1주차')).toBeTruthy();
    expect(view.getByText('오리엔테이션')).toBeTruthy();
    expect(view.getByText('{"ok": true}')).toBeTruthy();
  });

  test('안전한 외부 링크 탭 시 "외부 링크를 엽니다" 확인 대화상자를 띄우고 확인 시에만 열기를 수행한다', async () => {
    // Given
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onOpenLink = jest.fn();

    const view = await render(
      <MarkdownView
        source="[HRA 안내](https://hra-website-theta.vercel.app/notices) 및 [공격](javascript:alert(1))"
        onOpenLink={onOpenLink}
      />,
    );

    // When: 안전한 링크 탭 후 취소 선택
    const linkNode = view.getByRole('link', { name: 'HRA 안내' });
    await fireEvent.press(linkNode);

    // Then: 확인 대화상자가 표시되고 취소 시 열리지 않음
    expect(alertSpy).toHaveBeenCalledWith(
      '외부 링크를 엽니다',
      'https://hra-website-theta.vercel.app/notices',
      expect.any(Array),
      expect.any(Object),
    );
    const cancelButtons = alertSpy.mock.calls[0]?.[2];
    cancelButtons?.find((btn) => btn.text === ko.ui.cancel)?.onPress?.();
    expect(onOpenLink).not.toHaveBeenCalled();
    expect(openUrlSpy).not.toHaveBeenCalled();

    // When: 다시 탭한 뒤 확인 선택
    alertSpy.mockClear();
    await fireEvent.press(linkNode);
    const confirmButtons = alertSpy.mock.calls[0]?.[2];
    confirmButtons?.find((btn) => btn.text === ko.ui.confirm)?.onPress?.();

    // Then: 확인 후에만 onOpenLink가 호출됨
    expect(onOpenLink).toHaveBeenCalledWith('https://hra-website-theta.vercel.app/notices');
  });

  test('onOpenLink prop이 생략되면 확인 대화상자 승인 후 Linking.openURL을 호출한다', async () => {
    // Given
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    const view = await render(
      <MarkdownView source="[이메일 문의](mailto:admin@hra.kr)" />,
    );

    // When
    await fireEvent.press(view.getByRole('link', { name: '이메일 문의' }));
    const buttons = alertSpy.mock.calls[0]?.[2];
    buttons?.find((btn) => btn.text === ko.ui.confirm)?.onPress?.();

    // Then
    expect(openUrlSpy).toHaveBeenCalledWith('mailto:admin@hra.kr');
  });

  test('https 이미지만 Image 컴포넌트로 렌더링하고 http: 및 data: 이미지는 대체 텍스트(alt)만 표시한다', async () => {
    // Given
    const markdown = [
      '![안전 포스터](https://4sompt13gxwuz2x8.public.blob.vercel-storage.com/poster.png)',
      '',
      '![비보안 HTTP 이미지](http://example.com/insecure.png)',
      '',
      '![데이터 스킴 이미지](data:image/png;base64,AAAA)',
    ].join('\n');

    // When
    const view = await render(<MarkdownView source={markdown} />);
    const images = view.queryAllByRole('image');

    // Then: 오직 https 이미지 1개만 네이티브 Image로 마운트됨
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveProp('source', {
      uri: 'https://4sompt13gxwuz2x8.public.blob.vercel-storage.com/poster.png',
    });
    expect(view.getByRole('image', { name: '안전 포스터' })).toBeTruthy();
    expect(view.getByText('비보안 HTTP 이미지')).toBeTruthy();
    expect(view.getByText('데이터 스킴 이미지')).toBeTruthy();
  });
});
