/** 모바일 토큰의 난수 크기·용도 분리·정규 인코딩·해시 비가역 경계를 검증합니다. */
import { describe, expect, it } from "vitest";
import { generateMobileToken, hashMobileToken, isMobileToken } from "@/features/auth/mobile-session/tokens";

describe("모바일 토큰", () => {
  it.each(["access", "refresh"] as const)("%s 토큰은 32바이트 난수이며 같은 용도에서만 허용한다", kind => {
    // Given: 서로 독립적으로 생성한 토큰 두 개
    const first = generateMobileToken(kind);
    const second = generateMobileToken(kind);
    // When: 인코딩된 난수와 용도 검사를 실행
    const bytes = Buffer.from(first.slice(7), "base64url");
    // Then: 고정 엔트로피·비중복·용도 분리가 유지됨
    expect(bytes.byteLength).toBe(32);
    expect(first).not.toBe(second);
    expect(isMobileToken(first, kind)).toBe(true);
    expect(isMobileToken(first, kind === "access" ? "refresh" : "access")).toBe(false);
  });

  it.each(["", "hra_at_" + "a".repeat(42), "hra_at_" + "a".repeat(44), "hra_at_" + "a".repeat(42) + "B", "hra_at_" + "/".repeat(43), "hra_at_" + "A".repeat(43) + "\n"])("정규 형식이 아닌 입력을 거부한다 (%#)", raw => {
    // Given: 비정규 원문
    // When: 접근 토큰 형식을 검사
    const accepted = isMobileToken(raw, "access");
    // Then: 해시·DB 진입 전에 거부
    expect(accepted).toBe(false);
  });

  it("SHA-256의 알려진 벡터를 소문자 hex로 반환한다", () => {
    // Given: 공개된 해시 시험 벡터
    const input = "abc";
    // When: 해시 계산
    const digest = hashMobileToken(input);
    // Then: 독립 표준 벡터와 일치
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
