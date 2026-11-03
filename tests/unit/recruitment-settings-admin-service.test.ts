/** 모든 관리자 모집 설정 서비스 진입점의 재인가와 저장소 미접근을 검증합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSettings: vi.fn(), findPosterImageUrl: vi.fn(), listCohorts: vi.fn(),
  upsertSettings: vi.fn(), upsertInfo: vi.fn(), upsertPoster: vi.fn(), upsertDetails: vi.fn(),
}));
vi.mock("@/features/recruitment-settings/admin/repository", () => mocks);
import * as service from "@/features/recruitment-settings/admin/service";
import type { RecruitmentSettingsActor } from "@/features/recruitment-settings/admin/service";

const entries = [
  ["getSettings", (actor: RecruitmentSettingsActor) => service.getSettings(actor)],
  ["getPosterImageUrl", (actor: RecruitmentSettingsActor) => service.getPosterImageUrl(actor)],
  ["getCohortOptions", (actor: RecruitmentSettingsActor) => service.getCohortOptions(actor)],
  ["saveSettings", (actor: RecruitmentSettingsActor) => service.saveSettings(actor, { posterImageUrl: null, posterLayout: "right" })],
  ["saveInfo", (actor: RecruitmentSettingsActor) => service.saveInfo(actor, {})],
  ["savePoster", (actor: RecruitmentSettingsActor) => service.savePoster(actor, { posterImageUrl: null, posterLayout: "right" })],
  ["saveDetails", (actor: RecruitmentSettingsActor) => service.saveDetails(actor, {})],
] as const;
beforeEach(() => vi.resetAllMocks());

describe.each(entries)("%s 재인가", (_name, run) => {
  it.each([
    { userId: "member-1", role: "MEMBER" },
    { userId: "faculty-1", role: "FACULTY" },
    { userId: "pending-1", role: "PENDING" },
    { userId: "", role: "ADMIN" },
    { userId: "", role: "" },
  ])("$role / $userId 주체를 저장소 접근 전에 거부한다", async actor => {
    // 준비: 모든 저장소 함수를 독립적으로 관찰합니다.
    const repositories = Object.values(mocks);
    // 실행
    const pending = run(actor);
    // 확인
    await expect(pending).rejects.toThrow("RECRUITMENT_SETTINGS_ADMIN_REQUIRED");
    for (const repository of repositories) expect(repository).not.toHaveBeenCalled();
  });
});
