/** 개발/운영 API 주소의 실패 경계와 정규화를 실제 파서로 검증합니다. */
import { EnvironmentError, parseApiBaseUrl } from '../src/config/env';

test('개발 주소 누락 시 에뮬레이터 호스트를 사용한다', () => {
  // 준비: 주소를 지정하지 않은 개발 모드입니다.
  const result = parseApiBaseUrl(undefined, true);
  // 검증: Android 호스트 루프백 별칭만 기본값으로 사용합니다.
  expect(result).toBe('http://10.0.2.2:3000');
});
test.each([undefined, 'http://example.test', 'not-a-url', 'https://user:pass@example.test', 'https://example.test/?secret=x'])('운영에서 부적합한 주소 %s를 거부한다', (value) => {
  // 실행/검증: 운영 주소 누락, 평문, 손상된 입력 및 자격 증명 전달을 차단합니다.
  expect(() => parseApiBaseUrl(value, false)).toThrow(EnvironmentError);
});
test('명시한 HTTPS 기본 경로를 보존한다', () => {
  // 준비: 후행 슬래시가 있는 운영 주소입니다.
  const result = parseApiBaseUrl('https://example.test/mobile/', false);
  // 검증: API 경로 조합을 위해 마지막 슬래시만 제거합니다.
  expect(result).toBe('https://example.test/mobile');
});
