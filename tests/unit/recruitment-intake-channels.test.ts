/**
 * #412 모집안내 접수 채널 상태 계산(`deriveIntakeChannels`)을 상태 조합별로 검증합니다.
 * 내부 양식은 공개 여부로만, 외부 구글폼은 한국 날짜 모집 상태와 URL로만 열리는 정책(#104)을 고정합니다.
 */
import { describe, expect, it } from "vitest";
import {
  deriveIntakeChannels,
  getExternalChannelState,
  INTERNAL_APPLY_PATH,
  type IntakeChannelInput,
} from "@/features/recruitment/intake-channels";

// 합성 입력 기본값: 모집중·URL 있음·공개 양식 1개
const base: IntakeChannelInput = {
  recruitmentStatus: "OPEN",
  startDateLabel: "2026. 10. 16.",
  endDateLabel: "2026. 10. 30.",
  googleFormUrl: "https://forms.example.invalid/apply",
  publishedInternalFormCount: 1,
};

describe("접수 채널 요약 상태", () => {
  it.each([
    ["두 채널 병행", base, "BOTH"],
    ["내부 양식만", { ...base, googleFormUrl: null }, "INTERNAL_ONLY"],
    ["외부 구글폼만", { ...base, publishedInternalFormCount: 0 }, "EXTERNAL_ONLY"],
    ["둘 다 없음", { ...base, googleFormUrl: null, publishedInternalFormCount: 0 }, "NONE"],
  ] as const)("%s", (_name, input, summary) => {
    const result = deriveIntakeChannels(input);
    expect(result.summary).toBe(summary);
    expect(result.headline.length).toBeGreaterThan(0);
  });

  it("두 채널 병행 시 응답이 따로 접수된다는 점을 안내한다", () => {
    expect(deriveIntakeChannels(base).headline).toContain("따로 접수");
  });

  it("빈 상태에서는 두 채널 모두 이동 버튼이 없다", () => {
    const result = deriveIntakeChannels({ ...base, googleFormUrl: null, publishedInternalFormCount: 0 });
    expect(result.internal.action).toBeNull();
    expect(result.external.action).toBeNull();
    expect(result.headline).toContain("현재 접수 중인 지원서가 없습니다");
  });
});

describe("홈페이지 지원서는 모집 날짜로 막지 않는다", () => {
  it.each(["UPCOMING", "OPEN", "CLOSED"] as const)("모집 상태 %s에서도 공개 양식이 있으면 접수 중", (status) => {
    const result = deriveIntakeChannels({ ...base, recruitmentStatus: status });
    expect(result.internal.available).toBe(true);
    expect(result.internal.action).toEqual({ label: "홈페이지 지원서 작성하기", href: INTERNAL_APPLY_PATH, external: false });
  });

  it("공개 양식이 없으면 모집중이어도 내부 채널은 닫혀 있다", () => {
    const result = deriveIntakeChannels({ ...base, publishedInternalFormCount: 0 });
    expect(result.internal.available).toBe(false);
    expect(result.internal.statusLabel).toBe("공개된 양식 없음");
  });

  it("마감 후 공개 양식만 남은 추가모집은 내부 채널만 안내한다", () => {
    const result = deriveIntakeChannels({ ...base, recruitmentStatus: "CLOSED" });
    expect(result.summary).toBe("INTERNAL_ONLY");
    expect(result.external.state).toBe("CLOSED");
    expect(result.external.statusLabel).toBe("마감");
  });
});

describe("외부 지원서는 한국 날짜 상태와 URL로만 열린다", () => {
  it.each([
    ["OPEN", "https://forms.example.invalid/apply", "OPEN"],
    ["UPCOMING", "https://forms.example.invalid/apply", "UPCOMING"],
    ["CLOSED", "https://forms.example.invalid/apply", "CLOSED"],
    ["OPEN", null, "UNAVAILABLE"],
    ["OPEN", "   ", "UNAVAILABLE"],
  ] as const)("모집 %s, URL %s → %s", (status, url, state) => {
    expect(getExternalChannelState(status, url)).toBe(state);
  });

  it("모집중이면 새 창 외부 링크를 노출하고 마감일을 안내한다", () => {
    const result = deriveIntakeChannels({ ...base, publishedInternalFormCount: 0 });
    expect(result.external.action).toEqual({
      label: "외부 지원서(구글폼) 작성하기",
      href: "https://forms.example.invalid/apply",
      external: true,
    });
    expect(result.external.description).toContain("2026. 10. 30.");
  });

  it("마감일이 없으면 상시 접수로 안내한다", () => {
    const result = deriveIntakeChannels({ ...base, endDateLabel: null });
    expect(result.external.available).toBe(true);
    expect(result.external.description).toContain("상시 접수");
  });

  it("시작 전에는 버튼 없이 시작일을, 시작일이 없으면 추후 공지를 안내한다", () => {
    const upcoming = deriveIntakeChannels({ ...base, recruitmentStatus: "UPCOMING" });
    expect(upcoming.external.action).toBeNull();
    expect(upcoming.external.statusLabel).toBe("접수 예정");
    expect(upcoming.external.description).toContain("2026. 10. 16.");
    const undated = deriveIntakeChannels({ ...base, recruitmentStatus: "UPCOMING", startDateLabel: null });
    expect(undated.external.description).toBe("접수 일정은 추후 공지합니다.");
  });

  it("마감 후에는 URL이 있어도 버튼을 숨긴다", () => {
    const result = deriveIntakeChannels({ ...base, recruitmentStatus: "CLOSED" });
    expect(result.external.available).toBe(false);
    expect(result.external.action).toBeNull();
  });

  it("URL 앞뒤 공백은 제거해 링크로 사용한다", () => {
    const result = deriveIntakeChannels({ ...base, googleFormUrl: "  https://forms.example.invalid/apply  " });
    expect(result.external.action?.href).toBe("https://forms.example.invalid/apply");
  });
});
