/**
 * 서버 오류 경계를 정규화합니다. 서버의 자유 형식 메시지를 표시하거나 기록하지 않고
 * 코드·요청 식별자·재시도 대기시간만 보존하여 모든 화면에서 같은 한국어 안내를 사용합니다.
 */
import { ko } from '../i18n/ko';

export type ApiErrorCode = Exclude<keyof typeof ko.errors, 'credentials'>;
export type ApiErrorDetails = {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId?: string | undefined;
  readonly retryAfterSeconds?: number | undefined;
};

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId: string | undefined;
  readonly retryAfterSeconds: number | undefined;
  constructor(details: ApiErrorDetails) {
    super(details.code);
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}

// 응답 JSON은 신뢰 경계에서 필요한 속성만 읽으며 임의 문자열을 코드로 단언하지 않습니다.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && value !== 'credentials' && Object.hasOwn(ko.errors, value);
}

export async function parseApiError(response: Response): Promise<ApiError> {
  let envelope: unknown;
  try { envelope = await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    envelope = null;
  }
  const body = isRecord(envelope) && isRecord(envelope.error) ? envelope.error : {};
  const headerSeconds = Number(response.headers.get('Retry-After'));
  const seconds = typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : headerSeconds;
  return new ApiError({
    status: response.status,
    code: isCode(body.code) ? body.code : response.status === 401 ? 'UNAUTHENTICATED' : 'UNAVAILABLE',
    requestId: typeof body.requestId === 'string' ? body.requestId : response.headers.get('X-Request-Id') ?? undefined,
    retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined,
  });
}

export function toKoreanMessage(error: unknown, context: 'login' | 'default' = 'default'): string {
  if (!(error instanceof ApiError)) return ko.errors.UNAVAILABLE;
  if (error.code === 'UNAUTHENTICATED' && context === 'login') return ko.errors.credentials;
  if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds) {
    return error.retryAfterSeconds < 60 ? ko.waitSeconds(error.retryAfterSeconds) : ko.waitMinutes(Math.ceil(error.retryAfterSeconds / 60));
  }
  return ko.errors[error.code];
}
