/**
 * API v1 전용 모바일 요청 주체(Principal) 해석과 요청 범위 override 입니다.
 *
 * 역할:
 * - `Authorization: Bearer` 헤더를 3가지 상태(NO_BEARER / VALID / INVALID_BEARER)로 해석합니다.
 * - 검증된 모바일 주체를 AsyncLocalStorage 에 담아, 같은 요청 안에서 실행되는 기존 서비스의 인가 헬퍼가
 *   Auth.js 쿠키 세션 대신 이 주체를 사용할 수 있게 합니다(어댑터 전용 다리, #273).
 *
 * 사용 규칙(보안 경계):
 * - `runWithMobilePrincipal` 은 `src/app/api/v1/**` 라우트 어댑터에서만 호출합니다. 페이지·Server Action·관리자·
 *   기존 `/api/*` 라우트는 이 모듈을 import 하지 않으므로 Bearer 를 받아들이지 않습니다.
 * - 반드시 `AsyncLocalStorage.run()` 만 사용합니다. `enterWith()` 나 모듈 전역 변수에 주체를 저장하지 않습니다.
 * - Bearer 헤더가 있으면(형식 오류·미지원 스킴 포함) 쿠키로 되돌아가지 않습니다. INVALID_BEARER 는 항상 401 입니다.
 * - 쿠키 요청에는 override 를 설정하지 않습니다(기존 `auth()` 경로를 그대로 사용).
 * - 이 컨텍스트는 요청 처리 중에만 유효합니다. 분리된 작업·응답 이후의 스트림 처리에서 새 인가 판단으로
 *   간주하지 않습니다.
 */
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "@hra/contracts/identity";
import { authenticateAccessToken, validateMobileSession } from "@/features/auth/mobile-session/service";
import { isUserRole, isValidUuid } from "@/lib/auth-session";

/** 모바일 Bearer 로 인증된 요청 주체입니다. 역할은 매 요청 DB 에서 다시 읽은 현재 값입니다. */
export type MobileApiPrincipal = {
  readonly userId: string;
  readonly role: UserRole;
  readonly sessionVersion: number;
  readonly sessionId: string;
  readonly transport: "mobile";
};

/** Authorization 헤더 해석 결과. INVALID_BEARER 는 쿠키로 대체 인증하지 않고 401 로 끝내야 합니다. */
export type BearerResolution =
  | { readonly kind: "NO_BEARER" }
  | { readonly kind: "VALID"; readonly principal: MobileApiPrincipal }
  | { readonly kind: "INVALID_BEARER" };

// RFC 6750 의 b64token 문자 집합을 따르며 길이를 제한합니다. 스킴은 대소문자를 구분하지 않습니다.
const BEARER_HEADER = /^Bearer +([A-Za-z0-9._~+/=-]{1,256})$/i;

/**
 * 요청의 Authorization 헤더를 해석합니다.
 * - 헤더 없음 → NO_BEARER (호출자가 쿠키 경로를 사용)
 * - 헤더가 있으나 형식 오류·다른 스킴(Basic 등) → INVALID_BEARER (fail closed)
 * - 유효한 Bearer 형식이지만 토큰이 없거나 만료·회수·버전 불일치 → INVALID_BEARER
 * 저장소 장애는 `MobileSessionStorageError` 로 그대로 전파되며 호출자가 503 으로 변환합니다.
 */
export async function resolveBearer(request: Request): Promise<BearerResolution> {
  const header = request.headers.get("authorization");
  if (header === null) return { kind: "NO_BEARER" };
  const match = BEARER_HEADER.exec(header);
  if (!match) return { kind: "INVALID_BEARER" };
  const principal = await authenticateAccessToken(match[1]);
  if (!principal) return { kind: "INVALID_BEARER" };
  return { kind: "VALID", principal: { ...principal, transport: "mobile" } };
}

// 요청별 격리를 위해 모듈 전역 가변 값 대신 AsyncLocalStorage 의 run() 범위만 사용합니다.
const storage = new AsyncLocalStorage<MobileApiPrincipal>();

/** 검증된 모바일 주체를 handler 실행 동안(비동기 연쇄 포함)만 노출합니다. 주체는 얕게 복사해 동결합니다. */
export function runWithMobilePrincipal<T>(principal: MobileApiPrincipal, handler: () => Promise<T>): Promise<T> {
  return storage.run(Object.freeze({ ...principal }), handler);
}

/** 현재 요청 범위의 모바일 주체. 없으면 undefined 이며 호출자는 기존 Auth.js 쿠키 경로를 사용합니다. */
export function getMobilePrincipalOverride(): MobileApiPrincipal | undefined {
  return storage.getStore();
}

/** 기존 프레임워크 값을 지우지 않고 인증 전송에 의존하는 응답의 캐시 경계를 병합합니다. */
export function mergePrincipalVary(response: Response): Response {
  const tokens = (response.headers.get("Vary") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const token of ["Cookie", "Authorization"]) {
    if (!tokens.some((value) => value.toLowerCase() === token.toLowerCase())) tokens.push(token);
  }
  response.headers.set("Vary", tokens.join(", "));
  return response;
}

/** 인증 실패만 어댑터의 고유 오류 봉투로 변환하고, 쿠키 경로의 기존 검사 순서는 보존합니다. */
export async function withApiV1Principal(
  request: Request,
  handler: () => Promise<Response>,
  failure: (code: "UNAUTHENTICATED" | "UNAVAILABLE") => Response,
): Promise<Response> {
  let resolution: BearerResolution;
  try { resolution = await resolveBearer(request); }
  catch { return mergePrincipalVary(failure("UNAVAILABLE")); }
  switch (resolution.kind) {
    case "NO_BEARER": return mergePrincipalVary(await handler());
    case "INVALID_BEARER": return mergePrincipalVary(failure("UNAUTHENTICATED"));
    case "VALID": return mergePrincipalVary(await runWithMobilePrincipal(resolution.principal, handler));
    default: return assertNeverResolution(resolution);
  }
}

/** 새 해석 상태가 추가되면 모든 호출 경로의 처리를 컴파일 시점에 요구합니다. */
function assertNeverResolution(value: never): never { throw new TypeError(String(value)); }

/** 전체 Auth.js Session을 만들지 않고 기존 인가가 요구하는 최소 신원만 투영합니다. */
export function mobilePrincipalIdentity(): { id: string; role: UserRole } | undefined {
  const principal = getMobilePrincipalOverride();
  if (!principal) return undefined;
  if (!isValidUuid(principal.userId) || !isUserRole(principal.role)) throw new TypeError("INVALID_MOBILE_PRINCIPAL");
  return { id: principal.userId, role: principal.role };
}

/** 회수된 override는 쿠키로 fallback하지 않도록 부재와 명시적으로 구분합니다. 결과는 캐시하지 않습니다. */
export async function revalidateMobilePrincipalOverride(): Promise<
  | { readonly kind: "NO_OVERRIDE" }
  | { readonly kind: "VALID"; readonly identity: { readonly id: string; readonly role: UserRole } }
  | { readonly kind: "REVOKED" }
> {
  const principal = getMobilePrincipalOverride();
  if (!principal) return { kind: "NO_OVERRIDE" };
  const current = await validateMobileSession({ sessionId: principal.sessionId, expectedVersion: principal.sessionVersion });
  return current ? { kind: "VALID", identity: { id: current.userId, role: current.role } } : { kind: "REVOKED" };
}

/** undefined만 쿠키 경로를 허용하며 null은 재검증 실패로 인증을 종료합니다. */
export async function freshMobilePrincipalIdentity() {
  const result = await revalidateMobilePrincipalOverride();
  switch (result.kind) {
    case "NO_OVERRIDE": return undefined;
    case "VALID": return result.identity;
    case "REVOKED": return null;
    default: return assertNeverResolution(result);
  }
}
