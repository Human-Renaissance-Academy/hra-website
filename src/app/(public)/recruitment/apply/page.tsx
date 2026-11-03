/**
 * 공개 지원 양식 목록 Page입니다.
 * 발행 정책과 DB 조회는 Application Service에 맡기고 카드·상세 링크만 표시합니다.
 * 질문 조회와 실제 제출 인가는 별도의 상세 Page·Server Action에서 처리합니다.
 * 이 목록은 홈페이지 지원서(공개 양식)만 다루므로, 외부 지원서(구글폼) 안내는
 * 모집안내의 접수 채널 영역으로 연결합니다(#412).
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, FileText } from "lucide-react";
import { listPublishedApplicationForms } from "@/features/applications/public-list/service";
import { APPLY_CHANNELS_ANCHOR } from "@/features/recruitment/intake-channels";

// 외부 지원서 접수 여부를 확인할 수 있는 모집안내 접수 채널 영역 경로
const channelsHref = `/recruitment#${APPLY_CHANNELS_ANCHOR}`;

export const dynamic = "force-dynamic";

export default async function RecruitmentApplyPage() {
  // 서비스가 발행된 양식의 표시 필드만 작성일 역순으로 반환합니다.
  const publishedForms = await listPublishedApplicationForms();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20 md:py-32">
      <section className="mb-12 space-y-4 text-center sm:text-left">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 px-3 py-1 font-bold">
          모집 지원
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          홈페이지 지원서 작성
        </h1>
        <p className="max-w-2xl text-lg text-slate-500 leading-relaxed">
          현재 공개된 홈페이지 지원서 양식 목록입니다. 지원을 원하시는 항목을 선택해주세요.
        </p>
        <p className="max-w-2xl text-sm text-slate-500">
          외부 지원서(구글폼) 접수 여부와 모집 일정은{" "}
          <Link href={channelsHref} className="font-medium text-blue-700 underline underline-offset-2">
            모집안내의 지원서 접수 채널
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>

      {publishedForms.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 bg-white py-0 shadow-sm">
          <CardContent className="py-20 text-center text-slate-500">
            <p className="text-lg">현재 공개된 홈페이지 지원서 양식이 없습니다.</p>
            <p className="mt-1 text-sm">
              외부 지원서(구글폼) 채널로 접수 중일 수 있으니{" "}
              <Link href={channelsHref} className="font-medium text-blue-700 underline underline-offset-2">
                모집안내
              </Link>
              를 확인해주세요. 새로운 모집 소식은 홈페이지 공지사항을 확인해주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {publishedForms.map((form) => (
            <Card key={form.id} className="rounded-2xl border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="size-5 text-blue-600" />
                  {form.title}
                </CardTitle>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700">접수 중</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 mb-6">{form.description}</p>
                <Link
                  href={`/recruitment/apply/${form.id}`}
                  className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors w-full sm:w-auto"
                >
                  홈페이지 지원서 작성하기
                  <ChevronRight className="ml-2 size-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
