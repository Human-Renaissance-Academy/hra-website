/**
 * 관리자 강의자료 수정에서 화면에 없는 수업 날짜가 유지되는지 확인합니다 (#117).
 * 명시적으로 빈 날짜를 보낸 경우에는 날짜 삭제도 허용합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findFirst: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  revalidatePath: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    query: { classMaterials: { findFirst: mocks.findFirst } },
    update: () => ({ set: mocks.updateSet }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import { updateClassMaterial } from "@/features/class-materials/actions";

const id = "11111111-1111-4111-8111-111111111111";
const originalDate = new Date("2026-10-13T00:00:00.000Z");

function editForm() {
  const formData = new FormData();
  formData.set("title", "수정한 제목");
  formData.set("weekNumber", "3");
  formData.set("lectureTitle", "강의명");
  formData.set("audience", "STUDENT");
  return formData;
}

describe("관리자 강의자료 수업 날짜", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id, role: "ADMIN" } });
    mocks.findFirst.mockResolvedValue({ id, classDate: originalDate });
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
    mocks.updateReturning.mockResolvedValue([{ id }]);
  });

  it("수정 폼에 날짜 입력이 없으면 기존 날짜를 유지한다", async () => {
    const result = await updateClassMaterial(id, editForm());

    expect(result).toEqual({ success: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ classDate: originalDate }));
  });

  it("날짜를 명시적으로 비우면 기존 날짜를 지운다", async () => {
    const formData = editForm();
    formData.set("classDate", "");

    const result = await updateClassMaterial(id, formData);

    expect(result).toEqual({ success: true });
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ classDate: null }));
  });
});
