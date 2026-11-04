/**
 * 이미 취소가 확정된 스트림·요청의 뒷정리 실패를 사용자 결과에 영향 없이 흡수합니다.
 *
 * 사용 위치: 응답 스트림 `reader.cancel()`처럼 "취소 완료"를 기다리는 약속.
 * 이유:
 * - 취소 중인 스트림은 중단 사유(AbortError 등)로 거절되는 것이 정상이며, 이미 호출자의 취소 의도가 결과(ApiError)로
 *   확정된 뒤이므로 이 거절을 다시 던지면 처리되지 않은 약속 거절만 남습니다.
 * - 런타임(영역)이 다른 Node 테스트 환경의 DOMException 등은 `instanceof Error` 검사로 구분할 수 없으므로
 *   값의 종류와 무관하게 모든 거절을 동일하게 흡수합니다.
 * 보안: 거절 값(메시지·URL 등)은 읽지도 기록하지도 않습니다.
 */
export function ignoreCancellationFailure(pending: Promise<unknown>): void {
  pending.then(
    () => undefined,
    () => undefined,
  );
}
