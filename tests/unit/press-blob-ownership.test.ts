/**
 * 언론보도 썸네일 URL은 관리자가 입력하는 참조값입니다.
 * 같은 Blob 저장소의 URL이라도 해당 기사가 파일을 소유한다는 증거는 아니므로
 * 기사 삭제가 참조된 파일을 삭제하지 않는지 검사합니다 (#88).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findFirst: vi.fn(),
  where: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/db", () => ({
  db: {
    query: { pressArticles: { findFirst: mocks.findFirst } },
    delete: () => ({ where: mocks.where }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { deletePressArticle } from "@/features/press/actions";

describe("언론보도 삭제와 Blob 소유권", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findFirst.mockResolvedValue({
      imageUrl: "https://example.public.blob.vercel-storage.com/markdown-images/shared.png",
    });
    mocks.where.mockResolvedValue([]);
  });

  it("같은 저장소의 입력 URL을 기사 삭제와 함께 삭제하지 않는다", async () => {
    await deletePressArticle("11111111-1111-4111-8111-111111111111");

    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/press");
  });
});
