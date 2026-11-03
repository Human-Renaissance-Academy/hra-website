/**
 * 없는 대상에 대한 관리자 수정·삭제와 삭제 경합의 오류 메시지를 확인합니다 (#130).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  findTemplate: vi.fn(),
  selectRows: [] as Array<{ id: string }[]>,
  rowCount: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/admin", () => ({ requireAdmin: async () => ({ user: { id: "22222222-2222-4222-8222-222222222222", role: "ADMIN" } }) }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/db/submission-delete-guards", () => ({ hasSubmissionDeleteGuards: async () => true }));
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    delete: () => ({ where: () => ({ returning: async () => [] }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.selectRows.shift() ?? [] }) }) }),
    execute: async () => ({ rowCount: mocks.rowCount }),
    query: { reportTemplates: { findFirst: mocks.findTemplate } },
  },
}));

import { updateForm, toggleFormPublishStatus, deleteForm } from "@/features/applications/actions/forms";
import { updateReportTemplate } from "@/features/report-templates/actions";
import { updateUserGroup, deleteUser } from "@/features/users/actions";

function formData() {
  const data = new FormData();
  data.set("title", "지원서");
  data.set("description", "");
  return data;
}

function templateData() {
  const data = new FormData();
  data.set("slug", "sample");
  data.set("title", "양식");
  data.set("category", "template");
  data.set("reportCategory", "management-book");
  data.set("body", "본문");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectRows = [];
  mocks.rowCount = 0;
});

describe("없는 관리자 대상", () => {
  it("지원서 양식 수정·공개 전환·삭제가 성공으로 응답하지 않는다", async () => {
    for (const result of [
      await updateForm(id, formData()),
      await toggleFormPublishStatus(id, true),
      await deleteForm(id),
    ]) {
      expect(result).toEqual({ success: false, message: "양식을 찾을 수 없습니다." });
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("보고서 양식 수정 대상이 없으면 저장 전에 거부한다", async () => {
    mocks.findTemplate.mockResolvedValue(undefined);
    expect(await updateReportTemplate(id, templateData()))
      .toEqual({ success: false, message: "양식을 찾을 수 없습니다." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("보고서 양식이 조회 후 삭제되어도 수정 성공으로 응답하지 않는다", async () => {
    mocks.findTemplate.mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id, slug: "old-sample" });
    expect(await updateReportTemplate(id, templateData()))
      .toEqual({ success: false, message: "양식을 찾을 수 없습니다." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("회원 변경·삭제 도중 대상이 사라지면 마지막 관리자 오류 대신 사용자 없음으로 응답한다", async () => {
    mocks.selectRows = [[{ id }], []];
    expect(await updateUserGroup(id, "FACULTY"))
      .toEqual({ success: false, message: "해당 사용자를 찾을 수 없습니다." });

    mocks.selectRows = [[{ id }], []];
    expect(await deleteUser(id))
      .toEqual({ success: false, message: "해당 사용자를 찾을 수 없습니다." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
