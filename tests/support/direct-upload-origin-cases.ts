/**
 * 직접 업로드 7곳의 기존 토큰 훅 mock을 실제 NextRequest 출처 행렬로 실행합니다.
 * 토큰 서명·외부 Blob은 호출하지 않고 훅의 반환 제한값과 원장 기록까지 검증합니다.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

type OriginCaseOptions = {
  route: string;
  issue: (request: Request) => Promise<Response>;
  recordCount: () => number;
  authCount: () => number;
};

export function directUploadOriginCases({
  route,
  issue,
  recordCount,
  authCount,
}: OriginCaseOptions) {
  const request = (url: string, origin: string | null, host: string, forwarded?: string) =>
    new NextRequest(`${url}${route}`, {
      method: "POST",
      headers: {
        Host: host,
        ...(origin ? { Origin: origin } : {}),
        ...(forwarded ? { "x-forwarded-host": forwarded } : {}),
      },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });

  /** HTTP 성공뿐 아니라 실제 토큰 훅의 제한값 반환·원장 기록을 확인합니다. */
  const expectApproved = async (input: NextRequest) => {
    const response = await issue(input);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      maximumSizeInBytes: expect.any(Number),
      allowedContentTypes: expect.any(Array),
      allowOverwrite: false,
    });
    expect(recordCount()).toBe(1);
  };

  describe("실제 NextRequest의 업로드 Origin", () => {
    it.each([
      ["localhost", "http://localhost:35151", "localhost:35151"],
      ["운영 HTTPS", "https://upload-origin.invalid", "upload-origin.invalid"],
    ])("%s 정상 Host·Origin이면 토큰 훅을 승인합니다", async (_label, origin, host) => {
      await expectApproved(request(origin, origin, host));
    });

    it("127 Host·Origin은 Next가 URL을 localhost로 바꿔도 승인합니다", async () => {
      const input = request("http://127.0.0.1:35151", "http://127.0.0.1:35151", "127.0.0.1:35151");
      expect(new URL(input.url).hostname).toBe("localhost");
      await expectApproved(input);
    });

    it.each([
      ["외부 Origin", "https://other.invalid", undefined],
      ["다른 포트", "https://upload-origin.invalid:444", undefined],
      ["forwarded Host 위조", "https://other.invalid", "other.invalid"],
    ] as const)("%s는 원장을 기록하지 않고 거부합니다", async (_label, origin, forwarded) => {
      const response = await issue(
        request("https://upload-origin.invalid", origin, "upload-origin.invalid", forwarded),
      );
      expect(response.status).toBe(400);
      expect(recordCount()).toBe(0);
      expect(authCount()).toBe(0);
    });

    it("Origin 누락은 기존 토큰 발급 허용 계약을 유지합니다", async () => {
      await expectApproved(request("https://upload-origin.invalid", null, "upload-origin.invalid"));
    });
  });
}
