// @vitest-environment node
/** 모바일 제한 SQL의 해시 경계와 기존 Web 제한 어댑터의 추가 장애 신호를 검증합니다. */
import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), release: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute, delete: () => ({ where: mocks.release }) } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
import { checkRefreshBudget, findRefreshSessionId, reserveRefreshBudget } from "@/features/auth/mobile-login/repository";
import { MOBILE_REFRESH_IP_POLICY } from "@/features/auth/mobile-login/policy";
import { releaseSuccessfulLogin, reserveLoginAttempt } from "@/lib/rate-limit";
const dialect = new PgDialect();
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => vi.resetAllMocks());
it("세션 예산 소진은 예외 대신 발급 허용 여부를 반환한다", async () => {
  // Given
  mocks.execute.mockResolvedValue({ rows: [{ allowed: false, retry_after_sec: 28 }] });
  // When / Then
  await expect(checkRefreshBudget(MOBILE_REFRESH_IP_POLICY, "synthetic-session")).resolves.toEqual({ allowed: false, retryAfterSeconds: 28 });
});
it("IP 원문 대신 도메인 분리 해시로 기존 원자 예약 함수를 호출한다", async () => {
  // Given
  mocks.execute.mockResolvedValue({ rows: [{ allowed: true, retry_after_sec: 0 }] });
  // When
  await reserveRefreshBudget(MOBILE_REFRESH_IP_POLICY, "203.0.113.1");
  // Then
  const query = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
  expect(query.sql).toContain("reserve_rate_limit(");
  expect(query.params).toEqual(["mobile-refresh-ip", expect.stringMatching(/^[0-9a-f]{64}$/), 120, 900]);
});
it("DB 제한 결과를 계약 범위의 재시도 시간으로 전달한다", async () => {
  // Given
  mocks.execute.mockResolvedValue({ rows: [{ allowed: false, retry_after_sec: 28 }] });
  // When / Then
  await expect(reserveRefreshBudget(MOBILE_REFRESH_IP_POLICY, "unknown")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 28 });
});
it("로그인 제한 저장소 장애를 별도 신호로 전달한다", async () => {
  // Given
  mocks.execute.mockRejectedValue(new Error("synthetic database failure"));
  // When
  const result = await reserveLoginAttempt("unknown", "person@example.invalid");
  // Then
  expect(result).toMatchObject({ blocked: true, unavailable: true });
});
it("모바일 예약 해제 장애는 조용히 성공하지 않는다", async () => {
  // Given
  mocks.release.mockRejectedValue(new Error("synthetic database failure"));
  // When / Then
  await expect(releaseSuccessfulLogin(id, true)).rejects.toThrow("LOGIN_RESERVATION_RELEASE_UNAVAILABLE");
});
it("기존 Web 예약 해제는 장애 시에도 이전 최선 노력 동작을 유지한다", async () => {
  // Given
  mocks.release.mockRejectedValue(new Error("synthetic database failure"));
  // When / Then
  await expect(releaseSuccessfulLogin(id)).resolves.toBeUndefined();
});
it.each([{ rows: [] }, { rows: [{ id }] }])("토큰의 세션 식별 결과만 반환하고 토큰 해시는 외부로 돌려주지 않는다: %j", async ({ rows }) => {
  // Given
  mocks.execute.mockResolvedValue({ rows });
  // When
  const result = await findRefreshSessionId("a".repeat(64));
  // Then
  expect(result).toBe(rows.length ? id : null);
});
