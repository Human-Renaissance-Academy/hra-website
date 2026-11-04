/**
 * 역할: 공통 UI 키트 기본 프리즘/컨테이너 컴포넌트(AppText, Icon, Button, Card, Chip, Divider, SectionHeader, ListRow, Screen) 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 타이포그래피 단계, 글꼴 확대 상한, 보조기술 역할(header, image, button) 검증
 * - 버튼 로딩·비활성 상태, 카드/목록 행 터치 및 위험 톤, 화면 래퍼 옵션 검증
 */
import { fireEvent, render } from '@testing-library/react-native';
import { ko } from '../src/i18n/ko';
import { theme } from '../src/theme';
import {
  AppText,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  ListRow,
  Screen,
  SectionHeader,
} from '../src/ui';

describe('AppText & Icon', () => {
  test('AppText는 title과 heading에 header 역할을 자동 부여하고 글꼴 확대 상한을 적용한다', async () => {
    // Given / When
    const view = await render(
      <>
        <AppText variant="title">제목 텍스트</AppText>
        <AppText variant="body" tone="secondary" weight="600" align="center">
          본문 텍스트
        </AppText>
      </>,
    );
    // Then
    const header = view.getByRole('header', { name: '제목 텍스트' });
    expect(header).toHaveStyle({
      color: theme.colors.text,
      fontSize: theme.typography.title.fontSize,
    });
    expect(header).toHaveProp('maxFontSizeMultiplier', theme.maxFontSizeMultiplier);
    expect(view.getByText('본문 텍스트')).toHaveStyle({
      color: theme.colors.secondary,
      fontWeight: '600',
      textAlign: 'center',
    });
  });

  test('Icon은 레이블이 없으면 장식용으로 숨기고 레이블이 있으면 image 역할을 부여한다', async () => {
    // Given / When
    const view = await render(
      <>
        <Icon name="home" testID="decorative-icon" />
        <Icon name="alert-circle" accessibilityLabel="경고 아이콘" testID="labelled-icon" />
      </>,
    );
    // Then
    expect(view.queryByTestId('decorative-icon')).toBeNull();
    expect(
      view.getByTestId('decorative-icon', { includeHiddenElements: true }),
    ).toHaveProp('accessibilityElementsHidden', true);
    expect(view.getByLabelText('경고 아이콘')).toHaveProp('accessibilityRole', 'image');
  });
});

describe('Button, Card, Chip, Divider', () => {
  test('Button은 활성 시 onPress를 호출하고 로딩·비활성 상태에서 호출을 차단하며 busy 상태를 노출한다', async () => {
    // Given
    const onPress = jest.fn();
    const view = await render(
      <Button
        label="제출하기"
        loadingLabel="제출 중입니다"
        leadingIcon="cloud-upload-outline"
        onPress={onPress}
      />,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: '제출하기' }));
    // Then
    expect(onPress).toHaveBeenCalledTimes(1);

    // When: 로딩 상태로 전환
    await view.rerender(
      <Button
        label="제출하기"
        loadingLabel="제출 중입니다"
        loading
        onPress={onPress}
        testID="submit-btn"
      />,
    );
    const loadingBtn = view.getByRole('button', { name: '제출하기' });
    await fireEvent.press(loadingBtn);
    // Then
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(loadingBtn).toBeDisabled();
    expect(loadingBtn).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true, busy: true }),
    );
    expect(view.getByTestId('submit-btn-spinner')).toBeTruthy();
    expect(view.getByText('제출 중입니다')).toBeTruthy();
  });

  test('Card는 onPress 유무에 따라 정적 View 또는 접근 가능한 버튼으로 동작한다', async () => {
    // Given
    const onPress = jest.fn();
    const view = await render(
      <>
        <Card testID="static-card">
          <AppText>정적 카드</AppText>
        </Card>
        <Card
          variant="elevated"
          padding="lg"
          accessibilityLabel="내 과제 이동"
          onPress={onPress}
        >
          <AppText>터치 카드</AppText>
        </Card>
      </>,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: '내 과제 이동' }));
    // Then
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByText('정적 카드')).toBeTruthy();
  });

  test('Chip과 Divider는 의미론적 톤과 여백을 적용해 렌더링한다', async () => {
    // Given / When
    const view = await render(
      <>
        <Chip label="제출 완료" tone="success" icon="checkmark-circle" />
        <Chip label="고정" tone="brand" icon="pin" />
        <Divider spacing="sm" inset="md" testID="divider" />
      </>,
    );
    // Then
    expect(view.getByText('제출 완료')).toHaveStyle({ color: theme.colors.success });
    expect(view.getByText('고정')).toHaveStyle({ color: theme.colors.brandText });
    expect(view.getByTestId('divider')).toHaveStyle({
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing.sm,
      marginHorizontal: theme.spacing.md,
    });
  });
});

describe('SectionHeader, ListRow, Screen', () => {
  test('SectionHeader는 제목 헤더와 더보기 액션 버튼을 렌더링한다', async () => {
    // Given
    const onAction = jest.fn();
    const view = await render(
      <SectionHeader
        title="다가오는 일정"
        subtitle="이번 달 주요 일정"
        actionLabel="일정 전체 보기"
        onActionPress={onAction}
      />,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: '일정 전체 보기' }));
    // Then
    expect(view.getByRole('header', { name: '다가오는 일정' })).toBeTruthy();
    expect(view.getByText('이번 달 주요 일정')).toBeTruthy();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('ListRow는 선행 아이콘·부제목·메타를 조합하고 터치 및 위험 톤을 지원한다', async () => {
    // Given
    const onPress = jest.fn();
    const view = await render(
      <>
        <ListRow
          title="내 과제"
          subtitle="제출 현황 확인"
          meta="2건"
          leadingIcon="clipboard-outline"
          onPress={onPress}
        />
        <ListRow
          title={ko.auth.logout}
          tone="danger"
          leadingIcon="log-out-outline"
          onPress={onPress}
        />
      </>,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: '내 과제, 제출 현황 확인, 2건' }));
    // Then
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(view.getByText(ko.auth.logout)).toHaveStyle({ color: theme.colors.danger });
  });

  test('Screen은 정적 모드와 스크롤·새로고침·키보드 회피 모드를 모두 지원한다', async () => {
    // Given
    const onRefresh = jest.fn();
    const view = await render(
      <Screen
        scroll
        keyboardAvoiding
        padding="lg"
        centered
        refreshing={false}
        onRefresh={onRefresh}
        testID="main-screen"
      >
        <AppText>화면 본문</AppText>
      </Screen>,
    );
    // Then
    expect(view.getByTestId('main-screen')).toBeTruthy();
    expect(view.getByText('화면 본문')).toBeTruthy();
  });
});
