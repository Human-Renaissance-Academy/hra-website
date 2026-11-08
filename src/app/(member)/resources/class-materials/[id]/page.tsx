/**
 * 자료실 — 강의 자료 뷰어 페이지
 *
 * 역할: 강의 자료 파일을 사이트 내에서 열람하고 다운로드 버튼을 제공합니다.
 *   - PDF: 브라우저 기본 iframe 인라인 뷰어
 *   - PPTX/PPT/DOCX/DOC/HWP: 외부 서비스에 파일 URL을 전달하지 않고 다운로드 안내
 *
 * 접근 권한: MEMBER는 학생용, FACULTY/ADMIN은 학생용·교수용 (조회 단계에서 제어)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/member";
import { getWebClassMaterialDetail, getWebClassMaterialTitle } from "@/features/class-materials/web/service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await requireMember();
  const { id } = await params;
  const title = await getWebClassMaterialTitle(session.user, id);
  return { title: title ? `${title} — 강의 자료` : "강의 자료" };
}

export default async function ClassMaterialViewerPage({ params }: Props) {
  const session = await requireMember();
  const { id } = await params;
  const material = await getWebClassMaterialDetail(session.user, id);

  if (!material) {
    notFound();
  }

  // 파일 확장자 추출
  const ext = material.fileName.split(".").pop()?.toLowerCase() ?? "";

  const isPdf = ext === "pdf";
  const audienceLabel = material.audience === "FACULTY" ? "교수용" : "학생용";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
      {/* 상단 네비게이션 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" render={<Link href="/resources?category=강의 자료" />}>
          <ArrowLeft className="size-4" />
          목록으로
        </Button>
        <a href={`/api/resources/class-materials/${material.id}/download`} download={material.fileName}>
          <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]">
            <Download className="size-4" />
            다운로드
          </Button>
        </a>
      </div>

      {/* 제목 헤더 */}
      <header className="mb-6 border-b border-[#D9D9D9] pb-5">
        <p className="mb-1 text-xs text-[#666666]">강의 자료 · {audienceLabel}</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a]">{material.title}</h1>
        {(material.weekNumber || material.lectureTitle) && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-[#666666]">
            {material.weekNumber ? <span>{material.weekNumber}주차</span> : null}
            {material.lectureTitle ? <span>{material.lectureTitle}</span> : null}
          </div>
        )}
      </header>

      {/* 뷰어 영역 */}
      {isPdf ? (
        // PDF: 브라우저 기본 인라인 뷰어
        <div className="w-full rounded-lg border border-[#D9D9D9] overflow-hidden shadow-[var(--shadow-soft)]">
          <iframe
            src={`/api/resources/class-materials/${material.id}/download?inline=1#toolbar=1&navpanes=0`}
            className="w-full"
            style={{ height: "80vh", minHeight: "600px" }}
            title={material.title}
          />
        </div>
      ) : (
        // 문서 파일은 외부 뷰어에 URL을 전달하지 않고 인증된 다운로드로 안내합니다.
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[#D9D9D9] bg-gray-50 py-20 text-center">
          <p className="text-[#666666] text-sm">
            이 파일 형식({ext.toUpperCase()})은 브라우저에서 미리볼 수 없습니다.
          </p>
          <p className="text-[#666666] text-sm">다운로드하여 확인해 주세요.</p>
          <a href={`/api/resources/class-materials/${material.id}/download`} download={material.fileName}>
            <Button className="bg-[#2563EB] text-white hover:bg-blue-700">
              <Download className="size-4" />
              {material.fileName} 다운로드
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
