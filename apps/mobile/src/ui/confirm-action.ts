/**
 * 역할: 한국어 '취소'/'확인' 버튼과 위험 동작(destructive) 스타일을 지원하는 네이티브 확인 대화상자 유틸리티
 * 사용 위치: 내 정보 로그아웃/전체 기기 로그아웃, 외부 링크 열기 확인, 과제 제출 최종 확인
 * 주요 기능:
 * - React Native Alert.alert를 래핑해 일관된 한국어 레이블(ko.ui.cancel, ko.ui.confirm) 적용
 * - 콜백(onConfirm, onCancel)과 Promise<boolean> 반환 방식을 모두 지원
 */
import { Alert } from 'react-native';
import { ko } from '../i18n/ko';

export interface ConfirmActionOptions {
  readonly title: string;
  readonly message?: string | undefined;
  readonly confirmLabel?: string | undefined;
  readonly cancelLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
  readonly onConfirm?: (() => void | Promise<void>) | undefined;
  readonly onCancel?: (() => void) | undefined;
}

/** 사용자 확인이 필요한 동작 수행 전에 한국어 확인 창을 띄우고 선택 결과를 반환합니다. */
export function confirmAction({
  title,
  message,
  confirmLabel = ko.ui.confirm,
  cancelLabel = ko.ui.cancel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmActionOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const handleCancel = () => {
      if (settled) return;
      settled = true;
      onCancel?.();
      resolve(false);
    };
    const handleConfirm = () => {
      if (settled) return;
      settled = true;
      void onConfirm?.();
      resolve(true);
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelLabel,
          style: 'cancel',
          onPress: handleCancel,
        },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: handleConfirm,
        },
      ],
      {
        cancelable: true,
        onDismiss: handleCancel,
      },
    );
  });
}
