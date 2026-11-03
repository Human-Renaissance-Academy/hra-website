/**
 * 갤러리 업로드 후 서버 목록 갱신과 이미지 그리드 재설정을 검증합니다 (#119).
 * 같은 수의 이미지가 다른 ID로 바뀌어도 이전 정렬 상태를 재사용하지 않아야 합니다.
 */
import { createElement, isValidElement, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findFirst: vi.fn(),
  routerRefresh: vi.fn(),
  prepareGalleryUploads: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: { query: { galleries: { findFirst: mocks.findFirst } } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.routerRefresh }) }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => createElement("span", { "data-image-alt": alt }) }));
vi.mock("@/lib/gallery-upload-client", () => ({ prepareGalleryUploads: mocks.prepareGalleryUploads }));
vi.mock("@/features/gallery/actions", () => ({
  addGalleryImages: vi.fn(),
  updateGallery: vi.fn(),
  deleteGalleryImage: vi.fn(),
  reorderGalleryImages: vi.fn(),
}));

import EditGalleryPage from "@/app/(admin)/admin/gallery/[id]/edit/page";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/_components/gallery-image-form";
import { GalleryImageSortableGrid } from "@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid";
import { reorderGalleryImages } from "@/features/gallery/actions";

const galleryId = "11111111-1111-4111-8111-111111111111";
const firstId = "22222222-2222-4222-8222-222222222222";
const secondId = "33333333-3333-4333-8333-333333333333";

function findGridKey(node: ReactNode): string | null {
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (node.type === GalleryImageSortableGrid) return node.key;
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  for (const child of children) {
    const key = findGridKey(child);
    if (key !== null) return key;
  }
  return null;
}

describe("갤러리 업로드 후 이미지 목록", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: galleryId, role: "ADMIN" } });
    mocks.prepareGalleryUploads.mockImplementation(async (formData: FormData) => ({ formData }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("같은 수의 이미지라도 ID가 바뀌면 그리드를 재마운트한다", async () => {
    const gallery = (imageId: string) => ({
      id: galleryId,
      title: "사진첩",
      description: null,
      coverImageUrl: null,
      images: [{ id: imageId, url: "https://example.com/image.png", alt: null, order: 0 }],
    });
    mocks.findFirst.mockResolvedValueOnce(gallery(firstId)).mockResolvedValueOnce(gallery(secondId));

    const before = await EditGalleryPage({ params: Promise.resolve({ id: galleryId }) });
    const after = await EditGalleryPage({ params: Promise.resolve({ id: galleryId }) });

    expect(findGridKey(before)).not.toBeNull();
    expect(findGridKey(after)).not.toBe(findGridKey(before));
  });

  it("업로드가 성공하면 페이지 데이터를 다시 요청한다", async () => {
    // jsdom 에 없는 DataTransfer 를 빈 파일 목록만 반환하는 형태로 제공합니다.
    const emptyFiles = document.createElement("input").files;
    vi.stubGlobal("DataTransfer", class {
      items = { add: vi.fn() };
      files = emptyFiles;
    });
    const action = vi.fn().mockResolvedValue({ success: true, message: "업로드 완료" });
    const view = render(createElement(GalleryImageForm, { action, galleryId, userId: galleryId }));
    const form = view.container.querySelector("form");
    if (!form) throw new Error("업로드 폼을 찾지 못했습니다.");

    await act(async () => fireEvent.submit(form));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
  });

  it("새 이미지가 표시된 직후 모든 이미지 ID로 순서를 저장한다", async () => {
    vi.mocked(reorderGalleryImages).mockResolvedValue({ success: true, message: "저장 완료" });
    const image = (id: string, order: number) => ({ id, url: `https://example.com/${id}.png`, alt: id, order });
    const base = { galleryId, coverImageUrl: null };
    const view = render(createElement(GalleryImageSortableGrid, {
      ...base,
      key: "",
      initialImages: [],
    }));
    expect(view.container.textContent).toContain("아직 등록된 이미지가 없습니다.");

    view.rerender(createElement(GalleryImageSortableGrid, {
      ...base,
      key: `${firstId},${secondId}`,
      initialImages: [image(firstId, 0), image(secondId, 1)],
    }));
    const cards = view.container.querySelectorAll("[draggable=true]");
    expect(cards).toHaveLength(2);

    fireEvent.dragStart(cards[1], { dataTransfer: { effectAllowed: "" } });
    fireEvent.drop(cards[0]);

    await waitFor(() => expect(reorderGalleryImages).toHaveBeenCalledWith(galleryId, [secondId, firstId]));
  });
});
