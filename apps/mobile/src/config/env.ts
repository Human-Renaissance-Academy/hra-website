/**
 * 공개 API 주소를 앱 경계에서 파싱합니다. 운영 주소를 묵시적으로 선택하지 않습니다.
 * __DEV__만 에뮬레이터 HTTP 기본값을 허용하며 release는 주소 누락/평문을 거부합니다.
 */
import { ko } from '../i18n/ko';

export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';
}

// 테스트에서 개발/운영 경계를 실제 입력으로 검증할 수 있도록 순수 함수로 분리합니다.
export function parseApiBaseUrl(value: string | undefined, development: boolean): string {
  const input = value?.trim() || (development ? 'http://10.0.2.2:3000' : undefined);
  if (!input) throw new EnvironmentError(ko.config.required);
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    if (error instanceof TypeError) throw new EnvironmentError(ko.config.invalid);
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new EnvironmentError(ko.config.invalid);
  }
  if (!development && url.protocol !== 'https:') throw new EnvironmentError(ko.config.https);
  return url.toString().replace(/\/$/, '');
}

// Expo의 정적 인라이닝에 필요한 점 표기법을 유지합니다. 비밀 토큰을 환경변수로 넣지 않습니다.
export function getApiBaseUrl(): string {
  return parseApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
}
