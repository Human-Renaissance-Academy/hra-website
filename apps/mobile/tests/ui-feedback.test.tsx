/**
 * 역할: 피드백·상태 컴포넌트(EmptyState, ErrorState, InlineBanner, Skeleton, confirmAction, useRefresh) 단위 테스트
 * 사용 위치: Jest 테스트 스위트 (npm test)
 * 주요 기능:
 * - 빈 상태, 오류 재시도('다시 시도'), 인라인 배너 및 세션 배너(SessionNotice) 검증
 * - AccessibilityInfo 동작 줄이기(reduced-motion) 설정에 따른 Skeleton 애니메이션 제어 검증
 * - confirmAction 한국어 확인 대화상자 및 useRefresh 중복 새로고침 방지 검증
 */
import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Alert, Animated } from 'react-native';
import { ApiError } from '../src/api/errors';
import { AuthContext } from '../src/auth/auth-context';
import { SessionNotice } from '../src/auth/session-notice';
import { ko } from '../src/i18n/ko';
import {
  Button,
  confirmAction,
  EmptyState,
  ErrorState,
  InlineBanner,
  Skeleton,
  SkeletonList,
  useRefresh,
} from '../src/ui';
import { authValue } from './screen-fixtures';

describe('EmptyState, ErrorState, InlineBanner, SessionNotice', () => {
  test('EmptyState는 기본 한국어 제목과 선택적 액션 버튼을 표시한다', async () => {
    // Given
    const onAction = jest.fn();
    const view = await render(
      <EmptyState
        description="등록된 일정이 없습니다."
        actionLabel="오늘로 이동"
        onActionPress={onAction}
      />,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: '오늘로 이동' }));
    // Then
    expect(view.getByText(ko.ui.emptyTitle)).toBeTruthy();
    expect(view.getByText('등록된 일정이 없습니다.')).toBeTruthy();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('ErrorState는 한국어 오류 문구와 다시 시도 버튼을 표시하고 클릭 시 onRetry를 호출한다', async () => {
    // Given
    const onRetry = jest.fn();
    const view = await render(
      <ErrorState message={ko.errors.NETWORK} onRetry={onRetry} />,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));
    // Then
    expect(view.getByRole('alert')).toHaveTextContent(ko.errors.NETWORK);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('InlineBanner와 SessionNotice는 경고 메시지와 재확인·로그아웃 액션을 제공한다', async () => {
    // Given
    const retry = jest.fn(async () => undefined);
    const logout = jest.fn(async () => undefined);
    const auth = authValue({
      status: 'signedIn',
      error: new ApiError({ status: 503, code: 'UNAVAILABLE' }),
      retry,
      logout,
    });
    const view = await render(
      <AuthContext.Provider value={auth}>
        <InlineBanner tone="info" title="안내" message="오프라인 모드 안내" />
        <SessionNotice />
      </AuthContext.Provider>,
    );
    // When
    await fireEvent.press(view.getByRole('button', { name: ko.auth.retry }));
    await fireEvent.press(view.getByRole('button', { name: ko.auth.logout }));
    // Then
    expect(view.getByText('안내')).toBeTruthy();
    expect(view.getByText('오프라인 모드 안내')).toBeTruthy();
    expect(view.getAllByRole('alert')[1]).toHaveTextContent(ko.errors.UNAVAILABLE);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('Skeleton & reduced-motion behaviour', () => {
  test('AccessibilityInfo 동작 줄이기가 활성화되면 애니메이션 루프를 시작하지 않는다', async () => {
    // Given
    const isReduceMotionSpy = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');

    // When
    const view = await render(<SkeletonList count={2} testID="skeleton-list" />);
    await act(async () => {
      await Promise.resolve();
    });

    // Then
    expect(view.getByLabelText(ko.ui.loading)).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ busy: true }),
    );
    expect(
      view.getByTestId('skeleton-list-line-title-0', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      view.getByTestId('skeleton-list-line-title-1', { includeHiddenElements: true }),
    ).toBeTruthy();

    loopSpy.mockClear();
    await render(<Skeleton reduceMotion testID="static-skeleton" />);
    expect(loopSpy).not.toHaveBeenCalled();

    isReduceMotionSpy.mockRestore();
    loopSpy.mockRestore();
  });

  test('동작 줄이기가 비활성화되면 Animated.loop를 시작하고 언마운트 시 정리한다', async () => {
    // Given
    const loopSpy = jest.spyOn(Animated, 'loop');

    // When
    const view = await render(<Skeleton reduceMotion={false} testID="animated-skeleton" />);

    // Then
    expect(loopSpy).toHaveBeenCalled();
    await view.unmount();
    loopSpy.mockRestore();
  });
});

describe('confirmAction & useRefresh', () => {
  test('confirmAction은 한국어 취소/확인 버튼으로 Alert.alert를 호출하고 선택 결과를 반환한다', async () => {
    // Given
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    // When: 확인 버튼 선택
    const confirmPromise = confirmAction({
      title: ko.auth.logout,
      message: '로그아웃하시겠습니까?',
      destructive: true,
      onConfirm,
      onCancel,
    });
    const buttons = alertSpy.mock.calls[0]?.[2];
    const cancelBtn = buttons?.find((b) => b.text === ko.ui.cancel);
    const confirmBtn = buttons?.find((b) => b.text === ko.ui.confirm);
    confirmBtn?.onPress?.();
    const confirmed = await confirmPromise;

    // Then
    expect(cancelBtn?.style).toBe('cancel');
    expect(confirmBtn?.style).toBe('destructive');
    expect(confirmed).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    // When: 취소 버튼 선택
    alertSpy.mockClear();
    const cancelPromise = confirmAction({
      title: ko.auth.logout,
      onConfirm,
      onCancel,
    });
    const nextButtons = alertSpy.mock.calls[0]?.[2];
    nextButtons?.find((b) => b.text === ko.ui.cancel)?.onPress?.();
    const cancelled = await cancelPromise;

    // Then
    expect(cancelled).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  test('useRefresh는 새로고침 상태를 관리하고 진행 중 중복 호출을 방지한다', async () => {
    // Given
    let resolveRefresh: (() => void) | undefined;
    const refreshFn = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    function RefreshProbe() {
      const { refreshing, onRefresh } = useRefresh(refreshFn);
      return (
        <Button
          label={refreshing ? ko.ui.refreshing : ko.ui.retry}
          onPress={() => {
            void onRefresh();
          }}
        />
      );
    }

    const view = await render(<RefreshProbe />);

    // When: 연속 두 번 호출
    await fireEvent.press(view.getByRole('button', { name: ko.ui.retry }));
    expect(view.getByText(ko.ui.refreshing)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: ko.ui.refreshing }));
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // Then: 완료 후 초기 상태 복귀
    await act(async () => {
      resolveRefresh?.();
    });
    expect(view.getByText(ko.ui.retry)).toBeTruthy();
  });
});
