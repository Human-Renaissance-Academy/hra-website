/**
 * 갤러리 목록 페이지
 *
 * 역할:
 * - 공개 사이트에서 갤러리 앨범 목록을 보여줍니다.
 * - 각 앨범의 커버 이미지와 이미지 개수를 함께 표시합니다.
 * - 앨범 상세 경로를 slug 대신 DB의 UUID 기반으로 연결합니다.
 * - 조회·사진 수 계산은 갤러리 Application Service/Repository에 맡깁니다.
 */

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPublicGalleryAlbums } from "@/features/gallery/public-list/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "갤러리",
  description: "HRA의 강의, 워크숍, 행사 현장의 생생한 모습을 사진으로 만나보세요.",
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/gallery" },
};

export default async function GalleryPage() {
  const albums = await listPublicGalleryAlbums();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
  
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
            갤러리
          </h1>
        </div>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          수업, 행사, 기수별 사진 모음을 만나보세요.
        </p>
      </section>

      {albums.length === 0 ? (
        <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
          <CardContent className="text-center text-base text-[#666666]">
            갤러리가 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {albums.map((album) => {
            const imageCount = album.imageCount;

            return (
              <Link key={album.id} href={`/gallery/${album.id}`} className="group block h-full">
                <Card className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)] transition-all duration-200 hover:border-blue-400 hover:shadow-md">
                  {album.coverImageUrl && imageCount > 0 ? (
                    <Image
                      src={album.coverImageUrl}
                      alt={album.title}
                      width={400}
                      height={208}
                      className="h-52 w-full object-cover"
                    />
                  ) : (
                    <div className="relative h-52 overflow-hidden bg-gradient-to-br from-emerald-50 via-blue-50 to-gray-100">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_82%_72%,rgba(34,211,238,0.14),transparent_30%)]" />
                      <div className="absolute inset-0 flex items-center justify-center text-[#666666]">
                        <ImageIcon className="size-10" />
                      </div>
                    </div>
                  )}
                  <CardHeader className="px-6 pb-1 pt-5 text-center">
                    <CardTitle className="line-clamp-1 text-center text-lg font-semibold text-[#1a1a1a] group-hover:text-blue-600">
                      {album.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-6 pb-5 text-center text-sm text-[#666666]">
                    이미지 {imageCount}장 · 조회 {album.viewCount}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
