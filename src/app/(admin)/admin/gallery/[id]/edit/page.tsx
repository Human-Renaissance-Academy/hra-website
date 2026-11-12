/**
 * 갤러리 편집 페이지
 *
 * 역할:
 * - 갤러리 기본 정보를 수정합니다.
 * - 갤러리에 속한 이미지 업로드/삭제를 관리합니다.
 * - 삭제 시 현재 커버 이미지 상태를 함께 보여줍니다.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod/v4";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryForm } from "@/app/(admin)/admin/gallery/_components/gallery-form";
import { GalleryImageForm } from "@/app/(admin)/admin/gallery/_components/gallery-image-form";
import { GalleryImageSortableGrid } from "@/app/(admin)/admin/gallery/_components/gallery-image-sortable-grid";
import {
  addGalleryImages,
  updateGallery,
} from "@/features/gallery/actions";
import { requireAdmin } from "@/lib/admin";
import { getAdminGallery } from "@/features/gallery/admin/service";

type EditGalleryPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function EditGalleryPage({ params }: EditGalleryPageProps) {
  const session = await requireAdmin();

  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white py-10 shadow-sm">
          <CardContent className="space-y-4 text-center">
            <p className="text-lg font-medium text-slate-900">앨범을 찾을 수 없습니다.</p>
            <Link
              href="/admin/gallery"
              className={buttonVariants({
                variant: "outline",
                className: "border-slate-200 text-slate-700",
              })}
            >
              갤러리 목록으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const gallery = await getAdminGallery({ userId: session.user.id, role: session.user.role }, parsedId.data);

  if (!gallery) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white py-10 shadow-sm">
          <CardContent className="space-y-4 text-center">
            <p className="text-lg font-medium text-slate-900">앨범을 찾을 수 없습니다.</p>
            <Link
              href="/admin/gallery"
              className={buttonVariants({
                variant: "outline",
                className: "border-slate-200 text-slate-700",
              })}
            >
              갤러리 목록으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateAction = updateGallery.bind(null, gallery.id);
  const addImageAction = addGalleryImages.bind(null, gallery.id);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">앨범 수정</h1>
          <p className="text-sm text-slate-500">기본 정보와 이미지를 관리합니다.</p>
        </div>
        <Link
          href="/admin/gallery"
          className={buttonVariants({
            variant: "outline",
            className: "border-slate-200 text-slate-700",
          })}
        >
          <ArrowLeft className="mr-1 size-4" />
          목록으로
        </Link>
      </section>

      <GalleryForm
        action={updateAction}
        submitLabel="변경사항 저장"
        defaultValues={{
          title: gallery.title,
          description: gallery.description,
        }}
      />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 py-6">
          <CardTitle className="text-xl text-slate-900">이미지 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <GalleryImageForm action={addImageAction} galleryId={gallery.id} userId={session.user.id} />

          {/* 이미지 ID 구성이 바뀌면 로컬 정렬 상태를 새 서버 목록으로 초기화합니다. */}
          <GalleryImageSortableGrid
            key={gallery.images.map((image) => image.id).join(",")}
            galleryId={gallery.id}
            coverImageUrl={gallery.coverImageUrl}
            initialImages={gallery.images.map((image) => ({
              id: image.id,
              url: image.url,
              alt: image.alt,
              order: image.order,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
