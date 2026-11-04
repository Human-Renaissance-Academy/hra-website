/**
 * 취소 뒷정리 흡수 도우미의 계약을 검증합니다: 어떤 거절 값(Error·문자열·객체)도 처리되지 않은 거절을 남기지 않고,
 * 거절 값을 읽거나 노출하지 않으며, 성공하는 약속에는 아무 영향이 없습니다.
 */
import { ignoreCancellationFailure } from '../src/lib/ignore-cancellation';

describe('ignoreCancellationFailure', () => {
  const rejections: unknown[] = [];
  const record = (reason: unknown) => { rejections.push(reason); };
  beforeEach(() => { rejections.length = 0; process.on('unhandledRejection', record); });
  afterEach(() => { process.off('unhandledRejection', record); });

  test.each([
    ['Error', () => new Error('abort')],
    ['문자열', () => 'aborted'],
    ['일반 객체', () => ({ name: 'AbortError' })],
    ['undefined', () => undefined],
  ])('%s 거절을 처리되지 않은 거절 없이 흡수한다', async (_label, make) => {
    // Given: 취소 사유로 거절되는 약속
    const pending = Promise.reject(make());
    // When: 도우미가 거절을 흡수한 뒤 이벤트 루프를 한 바퀴 돌린다.
    ignoreCancellationFailure(pending);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Then: 처리되지 않은 거절이 없다.
    expect(rejections).toEqual([]);
  });

  test('이행되는 약속에도 영향이 없다', async () => {
    // Given / When
    const pending = Promise.resolve('완료');
    ignoreCancellationFailure(pending);
    // Then
    await expect(pending).resolves.toBe('완료');
  });
});
