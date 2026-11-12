/**
 * #193 기수·양식 삭제 액션이 제출 데이터를 보존하고 한국어 결과를 돌려주는지 확인합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syntheticPng } from "../support/synthetic-image";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  selectRows: [] as Array<unknown[]>,
  deleteReturning: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  revalidatePath: vi.fn(),
  logServerError: vi.fn(),
  hasGuards: vi.fn(),
  put: vi.fn(),
  recordResourceUpload: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordResourceUpload }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("@/lib/db/submission-delete-guards", () => ({ hasSubmissionDeleteGuards: mocks.hasGuards }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(mocks.selectRows.shift() ?? []) }),
        innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.selectRows.shift() ?? []) }) }),
      }),
    }),
    delete: () => ({ where: () => ({ returning: mocks.deleteReturning }) }),
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({ set: (values: unknown) => {
      mocks.updateSet(values);
      return { where: async () => [] };
    } }),
  },
}));

import { createCohort, deleteCohort, updateCohort } from "@/features/recruitment/actions";
import { deleteForm } from "@/features/applications/actions/forms";
import { projectBlobHost } from "@/lib/blob-host";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectRows.length = 0;
  mocks.requireAdmin.mockResolvedValue({ user: { id, role: "ADMIN" } });
  mocks.hasGuards.mockResolvedValue(true);
  mocks.deleteReturning.mockResolvedValue([{ id }]);
  mocks.put.mockImplementation(async (path: string) => ({ url: `https://${projectBlobHost}/${path}` }));
  mocks.insertValues.mockResolvedValue(undefined);
});

describe("지원서 보존 삭제 액션", () => {
  it("새 기수 이미지는 소유권 원장에 선예약해 이후 공유 참조 정리 대상에 넣는다", async () => {
    const form = new FormData();
    form.set("name", "1기");
    // 공통 검증을 통과하는 실제 PNG로 업로드 전 소유권 선예약을 확인합니다.
    form.set("image", new File([syntheticPng()], "photo.png", { type: "image/png" }));
    await createCohort(form);
    expect(mocks.recordResourceUpload).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(new RegExp(`^https://${projectBlobHost}/cohorts/[0-9a-f-]{36}\\.png$`)), id,
    );
    expect(mocks.recordResourceUpload.mock.invocationCallOrder[0]).toBeLessThan(mocks.put.mock.invocationCallOrder[0]);
  });

  it("기수 이미지를 제거해도 공유 참조 확인 전에는 Blob을 지우지 않는다", async () => {
    mocks.selectRows.push([{ imageUrl: "https://example.public.blob.vercel-storage.com/cohorts/old.png" }]);
    const form = new FormData();
    form.set("name", "1기");
    form.set("removeImage", "true");
    await updateCohort(id, form);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: null }));
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("DB 보호 제약이 배포되기 전에는 삭제를 막는다", async () => {
    mocks.hasGuards.mockResolvedValue(false);
    expect((await deleteCohort(id)).success).toBe(false);
    expect((await deleteForm(id)).success).toBe(false);
    expect(mocks.deleteReturning).not.toHaveBeenCalled();
  });

  it("레거시 지원서가 있는 기수를 삭제하지 않는다", async () => {
    mocks.selectRows.push([{ id }], []);
    const result = await deleteCohort(id);
    expect(result).toEqual({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
    expect(mocks.deleteReturning).not.toHaveBeenCalled();
  });

  it("신규 제출이 있는 기수를 삭제하지 않는다", async () => {
    mocks.selectRows.push([], [{ id }]);
    const result = await deleteCohort(id);
    expect(result.success).toBe(false);
    expect(mocks.deleteReturning).not.toHaveBeenCalled();
  });

  it("제출 없는 기수만 삭제하고 이미지는 즉시 지우지 않는다", async () => {
    mocks.selectRows.push([], []);
    expect(await deleteCohort(id)).toEqual({ success: true, message: "기수가 삭제되었습니다." });
    expect(mocks.deleteReturning).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("사전 검사 뒤 발생한 FK 경합을 한국어로 반환한다", async () => {
    mocks.selectRows.push([], []);
    mocks.deleteReturning.mockRejectedValue({
      cause: { code: "23503", constraint: "application_submissions_form_id_application_forms_id_fk" },
    });
    expect(await deleteCohort(id)).toEqual({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("제출이 있는 양식은 거절하고 비어 있는 양식은 삭제한다", async () => {
    mocks.selectRows.push([{ id }]);
    expect(await deleteForm(id)).toEqual({ success: false, message: "제출된 지원서가 있는 양식은 삭제할 수 없습니다." });
    expect(mocks.deleteReturning).not.toHaveBeenCalled();

    mocks.selectRows.push([]);
    expect(await deleteForm(id)).toEqual({ success: true, message: "양식이 삭제되었습니다." });
    expect(mocks.deleteReturning).toHaveBeenCalledOnce();
  });

  it("양식 삭제와 동시 제출의 FK 충돌을 사용자에게 알린다", async () => {
    mocks.selectRows.push([]);
    mocks.deleteReturning.mockRejectedValue({
      cause: { code: "23503", constraint: "application_submissions_form_id_application_forms_id_fk" },
    });
    expect(await deleteForm(id)).toEqual({ success: false, message: "제출된 지원서가 있는 양식은 삭제할 수 없습니다." });
  });
});
