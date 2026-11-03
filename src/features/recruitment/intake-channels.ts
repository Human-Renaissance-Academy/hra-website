/**
 * 모집안내 화면에 표시할 지원서 접수 채널 상태를 계산하는 순수 함수입니다.
 *
 * 역할:
 * - 홈페이지 지원서(내부 양식)와 외부 지원서(구글폼)의 현재 이용 가능 여부를 한 번에 계산합니다.
 * - 화면 문구를 이 파일에 모아 모집안내·운영 문서(`docs/recruitment-intake-policy.md`)가 같은 표현을 쓰게 합니다.
 *
 * 정책(변경 금지, #104):
 * - 홈페이지 지원서는 `application_forms.is_published`(공개 양식 수)로만 판단합니다. 모집 날짜로 막지 않습니다.
 * - 외부 지원서 버튼은 한국 날짜 기준 모집 상태가 `OPEN`이고 URL이 있을 때만 노출합니다.
 * - 두 채널은 동시에 열릴 수 있으며, 응답 데이터는 채널별로 따로 보관됩니다(병합하지 않음).
 *
 * DB·Next.js에 의존하지 않으므로 Vitest에서 상태 조합별로 검증합니다.
 */
import type { RecruitmentStatus } from "@/features/recruitment/status";

/** 홈페이지 지원서 목록 경로입니다. 공개 양식이 있을 때만 버튼으로 노출합니다. */
export const INTERNAL_APPLY_PATH = "/recruitment/apply";

/** 공통 헤더 `지원하기`가 이동하는 모집안내의 접수 채널 영역 앵커입니다. */
export const APPLY_CHANNELS_ANCHOR = "apply-channels";

/** 채널 이름은 화면·문서에서 같은 표현을 사용합니다. */
export const INTERNAL_CHANNEL_LABEL = "홈페이지 지원서";
export const EXTERNAL_CHANNEL_LABEL = "외부 지원서(구글폼)";

/**
 * 외부 지원서 상태입니다.
 * - OPEN: 모집중이고 URL이 있어 버튼을 노출
 * - UPCOMING: URL은 있으나 모집 시작 전(또는 시작일 미정)
 * - CLOSED: URL은 있으나 마감일이 지남
 * - UNAVAILABLE: URL이 없어 외부 접수를 안내하지 않음
 */
export type ExternalChannelState = "OPEN" | "UPCOMING" | "CLOSED" | "UNAVAILABLE";

/** 두 채널 조합에 따른 요약 상태입니다. */
export type IntakeSummary = "BOTH" | "INTERNAL_ONLY" | "EXTERNAL_ONLY" | "NONE";

export type IntakeChannelInput = {
  /** 한국 날짜로 계산한 모집안내 상태 */
  recruitmentStatus: RecruitmentStatus;
  /** 모집 시작일(한국 날짜 표시 문자열). 없으면 null */
  startDateLabel: string | null;
  /** 모집 마감일(한국 날짜 표시 문자열). 없으면 null(상시 접수) */
  endDateLabel: string | null;
  /** 모집 설정의 외부 구글폼 URL */
  googleFormUrl: string | null;
  /** 현재 공개된 홈페이지 지원서 양식 수 */
  publishedInternalFormCount: number;
};

export type IntakeChannelView = {
  available: boolean;
  label: string;
  /** 채널 상태 배지 문구 */
  statusLabel: string;
  /** 채널 접수·마감 기준 설명 */
  description: string;
  /** 이동 버튼 문구와 목적지. 이용할 수 없으면 null */
  action: { label: string; href: string; external: boolean } | null;
};

export type IntakeChannels = {
  summary: IntakeSummary;
  /** 채널 영역 상단 요약 문구 */
  headline: string;
  internal: IntakeChannelView;
  external: IntakeChannelView & { state: ExternalChannelState };
};

/** URL 앞뒤 공백만 있는 값은 미설정으로 봅니다. */
function normalizeUrl(url: string | null): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

/** 모집 상태와 URL 유무로 외부 지원서 상태를 결정합니다. */
export function getExternalChannelState(status: RecruitmentStatus, googleFormUrl: string | null): ExternalChannelState {
  if (!normalizeUrl(googleFormUrl)) return "UNAVAILABLE";
  return status;
}

/** 외부 지원서 상태별 배지·설명 문구를 만듭니다. */
function describeExternal(state: ExternalChannelState, startDateLabel: string | null, endDateLabel: string | null) {
  switch (state) {
    case "OPEN":
      return {
        statusLabel: "접수 중",
        // 마감일이 없으면 상시 접수(추가모집 포함)로 안내합니다.
        description: endDateLabel
          ? `모집 마감일 ${endDateLabel}(한국 시간 23:59)까지 접수합니다.`
          : "마감일 없이 상시 접수 중입니다. 접수 종료 시 이 안내에서 버튼이 사라집니다.",
      };
    case "UPCOMING":
      return {
        statusLabel: "접수 예정",
        description: startDateLabel
          ? `모집 시작일 ${startDateLabel}(한국 시간 00:00)부터 접수합니다.`
          : "접수 일정은 추후 공지합니다.",
      };
    case "CLOSED":
      return {
        statusLabel: "마감",
        description: endDateLabel
          ? `모집 마감일 ${endDateLabel}에 접수가 마감되었습니다.`
          : "접수가 마감되었습니다.",
      };
    case "UNAVAILABLE":
      return {
        statusLabel: "운영 안 함",
        description: "현재 안내 중인 외부 지원서가 없습니다.",
      };
  }
}

/** 두 채널 조합에 맞는 요약 문구입니다. */
const headlines: Record<IntakeSummary, string> = {
  BOTH: `${INTERNAL_CHANNEL_LABEL}와 ${EXTERNAL_CHANNEL_LABEL} 두 채널로 함께 접수하고 있습니다. 두 채널의 응답은 따로 접수되므로 한 곳을 선택해 제출해 주세요.`,
  INTERNAL_ONLY: `현재 ${INTERNAL_CHANNEL_LABEL}로 접수하고 있습니다.`,
  EXTERNAL_ONLY: `현재 ${EXTERNAL_CHANNEL_LABEL} 채널로 접수하고 있습니다.`,
  NONE: "현재 접수 중인 지원서가 없습니다. 새로운 모집 소식은 공지사항을 확인해 주세요.",
};

/**
 * 입력 상태로 두 접수 채널의 표시 정보를 계산합니다.
 * 내부 채널은 모집 날짜를 보지 않고, 외부 채널은 공개 양식 수를 보지 않습니다.
 */
export function deriveIntakeChannels(input: IntakeChannelInput): IntakeChannels {
  // 1) 홈페이지 지원서: 공개 양식이 하나 이상이면 날짜와 무관하게 접수 중입니다.
  const internalAvailable = input.publishedInternalFormCount > 0;
  const internal: IntakeChannelView = {
    available: internalAvailable,
    label: INTERNAL_CHANNEL_LABEL,
    statusLabel: internalAvailable ? "접수 중" : "공개된 양식 없음",
    description: internalAvailable
      ? "운영진이 양식을 공개한 동안 접수하며, 접수를 마치면 양식이 비공개로 전환됩니다."
      : "현재 공개된 홈페이지 지원서 양식이 없습니다.",
    action: internalAvailable
      ? { label: `${INTERNAL_CHANNEL_LABEL} 작성하기`, href: INTERNAL_APPLY_PATH, external: false }
      : null,
  };

  // 2) 외부 지원서: 한국 날짜 기준 모집 상태와 URL 유무로 결정합니다.
  const url = normalizeUrl(input.googleFormUrl);
  const state = getExternalChannelState(input.recruitmentStatus, url);
  const externalAvailable = state === "OPEN";
  const external = {
    state,
    available: externalAvailable,
    label: EXTERNAL_CHANNEL_LABEL,
    ...describeExternal(state, input.startDateLabel, input.endDateLabel),
    action: externalAvailable && url
      ? { label: `${EXTERNAL_CHANNEL_LABEL} 작성하기`, href: url, external: true }
      : null,
  };

  // 3) 두 채널 조합으로 요약 상태를 정합니다.
  const summary: IntakeSummary = internalAvailable && externalAvailable
    ? "BOTH"
    : internalAvailable
    ? "INTERNAL_ONLY"
    : externalAvailable
    ? "EXTERNAL_ONLY"
    : "NONE";

  return { summary, headline: headlines[summary], internal, external };
}
