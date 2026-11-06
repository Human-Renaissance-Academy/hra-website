/**
 * 요청 제한 어댑터가 원자적 DB 함수에 독립 제한 축을 전달하는지 검증합니다 (#121).
 * DB 함수 자체의 실제 경합 검증은 rate-limit-postgres.test.ts가 담당합니다.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  deleteWhere: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    execute: mocks.execute,
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import {
  releaseSuccessfulLogin,
  reserveApplicationSubmission,
  reserveLoginAttempt,
  reserveResourceRead,
  reserveUploadAttempt,
} from "@/lib/rate-limit";

const dialect = new PgDialect();
const reservationId = "11111111-1111-4111-8111-111111111111";

describe("요청 제한 DB 어댑터", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ rows: [{
      allowed: true,
      retry_after_sec: 0,
      reservation_id: reservationId,
    }] });
    mocks.deleteWhere.mockResolvedValue(undefined);
  });

  it("로그인은 조합·IP·이메일을 한 DB 예약에 전달하고 이메일을 정규화한다", async () => {
    const first = await reserveLoginAttempt("203.0.113.1", " User@Example.COM ");
    const firstQuery = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
    const second = await reserveLoginAttempt("203.0.113.1", "user@example.com");
    const secondQuery = dialect.sqlToQuery(mocks.execute.mock.calls[1][0]);

    expect(first).toEqual({ blocked: false, retryAfterSec: 0, reservationId });
    expect(second).toEqual(first);
    expect(firstQuery.sql).toContain("reserve_rate_limit(");
    expect(firstQuery.params).toEqual(secondQuery.params);
    expect(firstQuery.params.filter((param) => typeof param === "string" && param.startsWith("login-")))
      .toEqual(["login-ip", "login-pair", "login-email"]);
    expect(firstQuery.params).not.toContain("user@example.com");
    expect(firstQuery.params).not.toContain("203.0.113.1");
  });

  it("업로드는 IP 축, 지원서는 IP 2개·이메일 축을 각각 예약한다", async () => {
    await reserveUploadAttempt("203.0.113.2");
    await reserveApplicationSubmission("203.0.113.2", "user@example.com");
    const upload = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
    const submission = dialect.sqlToQuery(mocks.execute.mock.calls[1][0]);

    expect(upload.params).toContain("upload-ip");
    expect(submission.params).toContain("submission-ip-hour");
    expect(submission.params).toContain("submission-ip-day");
    expect(submission.params).toContain("submission-email-day");
    expect(submission.params).not.toContain("user@example.com");
  });

  it("DB가 차단하면 재시도 시간을 전달하고 오류가 나면 차단한다", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{
      allowed: false,
      retry_after_sec: 37,
      reservation_id: null,
    }] });
    expect(await reserveUploadAttempt("203.0.113.3"))
      .toEqual({ blocked: true, retryAfterSec: 37, reservationId: null });

    mocks.execute.mockRejectedValueOnce(new Error("DB unavailable"));
    expect(await reserveUploadAttempt("203.0.113.3"))
      .toEqual({ blocked: true, retryAfterSec: 60, reservationId: null });
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it("자료 조회는 사용자 id의 분·시간 두 축을 해시로만 예약한다 (#444)", async () => {
    const userId = "61000000-0000-4000-8000-000000000001";
    expect(await reserveResourceRead(userId)).toEqual({ blocked: false, retryAfterSec: 0, reservationId });
    const query = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toEqual(expect.arrayContaining([
      "resource-read-user-minute", "resource-read-user-hour", 300, 2000, 60, 3600,
    ]));
    expect(query.params).not.toContain(userId);
  });

  it("자료 조회 제한 저장소 장애는 차단하면서 503 구분용 unavailable을 표시한다 (#444)", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("DB unavailable"));
    expect(await reserveResourceRead("61000000-0000-4000-8000-000000000001"))
      .toEqual({ unavailable: true, blocked: true, retryAfterSec: 3600, reservationId: null });
    expect(mocks.logServerError).toHaveBeenCalledWith("rate-limit/reserve-resource-read", expect.any(Error));
  });

  it("성공한 로그인의 예약만 해제한다", async () => {
    await releaseSuccessfulLogin(reservationId);
    await releaseSuccessfulLogin(null);
    expect(mocks.deleteWhere).toHaveBeenCalledTimes(1);
  });
});
