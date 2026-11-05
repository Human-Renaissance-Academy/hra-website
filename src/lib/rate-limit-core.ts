/**
 * Rate limiting pure helpers (#69)
 *
 * 이 모듈은 side-effect 없이 순수 함수 / 상수만 export 한다.
 * DB 통합 헬퍼 (`src/lib/rate-limit.ts`) 는 여기서 export 한 정책 상수와 pure 함수를
 * 사용해 실제 Postgres 쿼리를 실행한다.
 *
 * 분리 이유 (auth-session.ts / #68 패턴 준용):
 *   1) db mock 없이 window 계산·IP 파싱·정책 상수를 좁게 회귀 테스트할 수 있다.
 *   2) DB 를 import 하는 순간 neon-http, drizzle 초기화가 일어나 vitest 에서
 *      module resolution 이 무거워진다. pure helper 만 테스트하도록 격리한다.
 *   3) 정책 상수 (재시도 window, 최대 시도 횟수) 를 한 곳에서 관리해 코드 리뷰
 *      시 UX 균형 검토가 쉽다.
 *
 * 배경 (#69 BLOCK):
 *   - 이슈 재현 시나리오: /api/auth/callback/credentials 에 자동화 스크립트로
 *     비밀번호 사전 공격 → 잠금 없음.
 *   - Vercel Blob 무제한 업로드로 스토리지 비용 폭증.
 *   - 지원서 폼에 봇으로 무제한 제출 → PII 스토리지 및 DB 오염.
 *   - Phase 1: DB 기반 sliding window 로 최소 방어. Redis 는 Phase 2 (별도 이슈).
 */

import { isIP } from "node:net";

// ── 정책 상수 (사용처 통일) ────────────────────────────────────────────────

/**
 * 로그인 실패 rate limit 정책.
 *
 * 값 근거 (issue #69 사양 + industry norm):
 *   - windowMs = 15분: brute force 공격의 초 단위 반복을 방어하기에 충분한 시간창.
 *   - maxAttempts = 5: 일반 사용자가 15분 안에 비밀번호를 잘못 입력할 최대 횟수
 *     (모바일 자동완성 실패 + 오타 + 재확인 등) 를 넉넉히 허용.
 *   - IP+email 조합당 5회에 더해 IP·이메일 독립 상한을 적용한다.
 *
 * 실패 카운트만 잠금 대상 (성공은 카운트 리셋 아닌 별도 로우로 기록):
 *   성공한 로그인은 rate limit 판단에서 제외해 legitimate 사용자가 밤늦게
 *   로그인 실패 후 성공한 뒤에도 이후 정상 접속에 영향 없도록 한다.
 */
export const LOGIN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
} as const;

// 조합 키를 바꿔도 한 IP 또는 한 계정에 대한 대량 시도를 제한합니다 (#121).
export const LOGIN_IP_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 50 } as const;
export const LOGIN_EMAIL_RATE_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 15 } as const;

/**
 * 이미지 업로드 rate limit 정책 (/api/upload-image, /api/editor-image-uploads).
 *
 * 값 근거 (issue #69 사양):
 *   - windowMs = 60초: 짧은 스퍼트 공격 (DoS) 방어.
 *   - maxAttempts = 30: TipTap 리치 에디터가 이미지 여러 개를 병렬 업로드해도
 *     정상 회원 UX 를 침해하지 않는 상한. Vercel Blob 실비 청구를 방어하는 게 목표.
 *   - key 는 IP 기준: 이슈 #69 사양 명시. 인증된 엔드포인트지만 로그인 자체가
 *     rate limit 대상이 아니라 "짧은 window 동안의 요청 폭주"를 IP 로 걸러야
 *     Blob 스토리지 실비 폭증을 실 주체 (호스트) 레벨에서 차단할 수 있다.
 */
export const UPLOAD_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxAttempts: 30,
} as const;

/**
 * 지원서 제출 IP 시간당 rate limit 정책.
 *
 * 값 근거:
 *   - 공유 IP의 정상 지원자를 보호하기 위해 시간당 50회까지 허용한다.
 *   - IP 하루 200회와 지원자 이메일 하루 5회를 별도로 적용한다.
 */
export const APPLICATION_SUBMISSION_HOURLY_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 50,
} as const;

// 공유 네트워크의 정상 지원자를 보호하면서 장기적인 자동 제출은 제한합니다 (#121).
export const APPLICATION_SUBMISSION_DAILY_RATE_LIMIT = { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 200 } as const;
export const APPLICATION_SUBMISSION_EMAIL_DAILY_RATE_LIMIT = { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 5 } as const;

/**
 * 자료실 파일·메타데이터 조회의 인증 사용자별 빈도 제한 정책 (#444).
 *
 * 적용 경로: Web `/api/resources/[kind]/[id]/download` 와 `/api/v1/resources/*` 전체.
 * 두 경로와 Web 쿠키·모바일 Bearer 가 같은 사용자 id 키 하나의 예산을 공유한다.
 *
 * 값 근거:
 *   - 주차별 텍스트 상세 화면은 첨부 사진을 최대 100장까지 `<img>` 로 불러오고, 모든 자료 응답이
 *     `Cache-Control: private, no-store` 라 화면을 다시 열 때마다 사진·PDF 미리보기를 다시 요청한다.
 *   - 분당 300회: 사진 100장짜리 화면에 목록·상세·파일 몇 건을 더해도 한 화면이 약 110회이므로
 *     1분 안에 그런 화면을 두세 번 새로 고쳐도 막히지 않는다. 일반 화면(목록 1회 + 파일 몇 건)은 10회 안팎이다.
 *   - 시간당 2000회: 사진이 많은 주차별 텍스트 10여 개와 파일 수십 건을 한 시간 안에 훑어보는 정상 열람을 허용하면서,
 *     유효한 세션 하나로 자료실 전체를 짧은 시간에 반복해서 내려받는 자동화는 분당 약 33회 수준으로 묶는다.
 *   - 차단된 요청은 DB 함수가 기록하지 않으므로 재시도 폭주가 대기 시간을 늘리지 않는다.
 */
export const RESOURCE_READ_BURST_RATE_LIMIT = { windowMs: 60 * 1000, maxAttempts: 300 } as const;
export const RESOURCE_READ_HOURLY_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 2000 } as const;

/**
 * unknown IP 를 나타내는 sentinel 값.
 *
 * headers 전부가 비어 있을 때 (로컬 개발, unit test, misconfigured proxy 등)
 * 빈 문자열이나 null 대신 명시적인 sentinel 로 처리한다.
 * DB varchar(45) 컬럼에 저장 가능해야 하므로 짧고 안전한 값을 사용한다.
 */
export const UNKNOWN_IP = "unknown" as const;

// ── pure helpers ────────────────────────────────────────────────────────────

/**
 * request headers 에서 클라이언트 IP 를 추출한다.
 *
 * Vercel에서는 플랫폼 전용 헤더만 신뢰합니다. 로컬 개발에서는 일반 프록시
 * 헤더도 허용하지만, 첫 항목이 올바른 IP이며 45자 이하일 때만 사용합니다.
 *
 * 반환값은 항상 문자열 (UNKNOWN_IP fallback). null 반환하지 않아 caller 가
 * 매 호출마다 null 체크할 필요 없게 한다.
 *
 * 순수 함수로 구현한 이유: Next.js `headers()` 는 서버 컴포넌트에서만 호출
 * 가능하므로 caller 가 Headers 객체를 넘겨받아 이 helper 로 전달한다.
 * 이렇게 하면 unit test 에서 새 Headers() 로 mock 이 쉬워진다.
 */
export function extractClientIp(headers: Headers): string {
  // Vercel이 설정하는 전용 헤더만 프로덕션 신뢰 경계로 사용합니다.
  const names = process.env.VERCEL === "1"
    ? ["x-vercel-forwarded-for"]
    : ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
  for (const name of names) {
    const candidate = headers.get(name)?.split(",")[0]?.trim();
    if (candidate && candidate.length <= 45 && isIP(candidate) !== 0) return candidate;
  }
  return UNKNOWN_IP;
}

/**
 * 이메일 정규화 (rate limit key 용).
 *
 * 로그인 폼에서 대소문자 · 양쪽 공백 차이가 있어도 동일 계정에 대한 시도로
 * 인식되도록 통일한다. authorize() 의 계정 조회도 같은 정규화 규칙을 쓴다.
 *
 * 반환값이 빈 문자열이면 이메일이 없는 것으로 간주하고 caller 는 IP 만으로
 * rate limit 을 걸어야 한다 (그렇지 않으면 빈 문자열 email 로 통합된
 * 카운트가 legitimate 사용자에게 영향).
 */
export function normalizeEmailForRateLimit(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

/**
 * 카운트 기반 blocked 판정.
 *
 * pure 하게 분리한 이유: DB 에서 count() 를 받아 policy 와 비교하는 boolean
 * 로직이 여러 곳 (login/upload/submission) 에서 반복되므로 한 곳에서 관리한다.
 * 경계값 (count === maxAttempts) 은 5회 시도까지는 허용, 6회부터 차단 의미로
 * ">=" 를 사용한다 (첫 시도가 index 1 이므로 max=5 는 정확히 5번째 실패까지 통과).
 *
 * @param count 최근 window 내 관측된 시도 횟수 (실패만이든 전체든 caller 정의).
 * @param maxAttempts 정책 상수의 maxAttempts.
 */
export function isBlocked(count: number, maxAttempts: number): boolean {
  return count >= maxAttempts;
}

/**
 * 가장 오래된 시도 시각으로부터 window 가 지나 sliding 밖으로 나가기까지 남은 초.
 *
 * 429 응답의 Retry-After 헤더에 넣을 값 계산에 사용한다.
 * - 사용자에게 정확한 재시도 가능 시점을 알려 UX 를 개선한다.
 * - 초 단위 (RFC 7231 §7.1.3) 로 반환하며 음수는 0 으로 clamp.
 *
 * caller 가 oldest attempt timestamp 를 얻지 못했다면 `null` 을 넘긴다.
 * 이때는 정책의 windowMs 전체를 fallback 으로 사용한다 (보수적 응답).
 *
 * @param oldestAttemptAt window 내 가장 오래된 시도 시각 (null 이면 fallback).
 * @param windowMs 정책 상수의 windowMs.
 * @param now 현재 시각 (테스트 주입용, 프로덕션은 Date.now()).
 */
export function computeRetryAfterSeconds(
  oldestAttemptAt: Date | null,
  windowMs: number,
  now: number,
): number {
  if (!oldestAttemptAt) {
    return Math.ceil(windowMs / 1000);
  }
  const oldestMs = oldestAttemptAt.getTime();
  const elapsedMs = now - oldestMs;
  const remainingMs = windowMs - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

/**
 * sliding window 시작 시각 (>= 이후의 attempt 만 카운트).
 *
 * DB WHERE 절 (`attempted_at >= sinceTimestamp`) 에 사용한다.
 * `new Date(now - windowMs)` 를 여러 호출부에서 반복하지 않도록 helper 화.
 */
export function computeWindowStart(now: number, windowMs: number): Date {
  return new Date(now - windowMs);
}
