/**
 * 운영 상태 점검의 런타임 정보 노출 경계를 검증합니다.
 * 정상·장애 응답에서 인증된 요청만 Node 메이저를 확인할 수 있어야 합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { execute: mock.execute } }));
vi.mock("@/lib/errors", () => ({ logServerError: mock.logError }));

import { GET } from "@/app/api/health/route";

const health = (secret?: string) =>
  GET(
    new Request("https://hra.example/api/health", {
      headers: secret ? { "x-health-check-secret": secret } : {},
    }),
  );

describe("운영 health의 Node 런타임 정보 최소 노출 (#294)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://synthetic.invalid/db");
    vi.stubEnv("HEALTH_CHECK_SECRET", "synthetic-health-only-secret");
    mock.execute.mockResolvedValue([{ value: 1 }]);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("익명 health 응답은 Node/DB/time 등의 내부 정보를 절대 노출하지 않는다", async () => {
    const result = await health();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: "ok" });
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["invalid", "synthetic-health-only-secreX", "synthetic-health-only-secret-", ""])(
    "잘못된 health secret은 내부 런타임을 볼 수 없다 (%s)",
    async (secret) => {
      const result = await health(secret);
      expect(await result.json()).toEqual({ status: "ok" });
    },
  );

  it("secret을 서버에서 미설정한 경우에는 제출한 secret이 무엇이든 상세 응답을 거부한다", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "");
    const result = await health("synthetic-health-only-secret");
    expect(await result.json()).toEqual({ status: "ok" });
  });

  it("올바른 secret이면 실제 Node major만 공개하고 full 버전·토큰은 응답에 포함하지 않는다", async () => {
    const result = await health("synthetic-health-only-secret");
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.nodeMajor).toBe(Number(process.versions.node.split(".")[0]));
    expect(Number.isInteger(body.nodeMajor)).toBe(true);
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("nodeVersion");
    expect(JSON.stringify(body)).not.toContain("synthetic-health-only-secret");
  });

  it("DB 미설정이나 장애에서도 익명/인증 응답 경계는 유지된다", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const anonymous = await health();
    expect(anonymous.status).toBe(503);
    expect(await anonymous.json()).toEqual({ status: "error" });
    const details = await health("synthetic-health-only-secret");
    expect(details.status).toBe(503);
    const body = await details.json();
    expect(body).toMatchObject({
      status: "error",
      database: "unavailable",
      nodeMajor: Number(process.versions.node.split(".")[0]),
    });
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it("DB 조회 장애에서도 익명 응답은 상태만 반환한다", async () => {
    mock.execute.mockRejectedValueOnce(new Error("synthetic-private-error"));
    const result = await health();
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ status: "error" });
    expect(mock.logError).toHaveBeenCalledTimes(1);
  });

  it("DB query 실패 시 오류 원문·URI가 응답에 나오지 않는다", async () => {
    mock.execute.mockRejectedValueOnce(new Error("synthetic-private-connection-string"));
    const res = await health("synthetic-health-only-secret");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.database).toBe("unavailable");
    expect(body.nodeMajor).toBe(Number(process.versions.node.split(".")[0]));
    expect(JSON.stringify(body)).not.toContain("private-connection");
    expect(mock.logError).toHaveBeenCalledTimes(1);
  });
});
