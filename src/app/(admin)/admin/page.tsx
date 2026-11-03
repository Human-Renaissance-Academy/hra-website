/**
 * 관리자 대시보드
 *
 * 역할: HRA 운영 현황 요약 + 주요 관리 페이지 바로가기
 * - 주의 필요 항목(검토 대기 지원서, 승인 대기 회원)을 상단에 강조 표시
 * - 전체 콘텐츠 통계 (기수, 공지, 언론, 갤러리, 수료생이야기)
 * - 모든 관리 페이지 바로가기 링크
 */

import Link from "next/link";
import {
  Bell,
  CircleHelp,
  FileText,
  FolderOpen,
  GalleryHorizontal,
  GraduationCap,
  MessageSquare,
  Newspaper,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardCounts } from "@/features/admin-dashboard/service";
import { requireAdmin } from "@/lib/admin";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// 관리 바로가기 목록 — 사이드바 순서와 동일하게 유지
const quickLinks = [
  { href: "/admin/faculty",              label: "교수진",        icon: GraduationCap },
  { href: "/admin/recruitment",          label: "기수 관리",     icon: Users },
  { href: "/admin/application-forms",    label: "지원서 관리",   icon: FileText },
  { href: "/admin/recruitment-settings", label: "모집 설정",     icon: Settings },
  { href: "/admin/notices",              label: "공지사항",      icon: Bell },
  { href: "/admin/press",               label: "언론보도",      icon: Newspaper },
  { href: "/admin/gallery",             label: "갤러리",        icon: GalleryHorizontal },
  { href: "/admin/alumni",              label: "수료생 이야기",  icon: MessageSquare },
  { href: "/admin/faq",                 label: "FAQ",           icon: CircleHelp },
  { href: "/admin/resources",           label: "자료실",        icon: FolderOpen },
  { href: "/admin/users",               label: "회원 관리",     icon: UserCog },
];

export default async function AdminDashboardPage() {
  const session = await requireAdmin();
  let pendingSubmissions = 0;
  let totalSubmissions = 0;
  let pendingUsers = 0;
  let totalMembers = 0;
  let totalCohorts = 0;
  let totalNotices = 0;
  let totalPress = 0;
  let totalGalleries = 0;
  let totalAlumni = 0;

  try {
    // 웹 세션을 서비스 주체로 전달하며 재인가·집계 오류는 기존 catch에서 처리합니다.
    ({
      pendingSubmissions,
      totalSubmissions,
      pendingUsers,
      totalMembers,
      totalCohorts,
      totalNotices,
      totalPress,
      totalGalleries,
      totalAlumni,
    } = await getDashboardCounts({ userId: session.user.id, role: session.user.role }));
  } catch (error) {
    logServerError("admin/dashboard", error);
    return (
      <div className="space-y-4 p-2">
        <h1 className="text-xl font-semibold text-slate-900">대시보드</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-red-600">데이터베이스 연결을 확인해 주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-2">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">HRA 운영 현황을 한눈에 확인하세요.</p>
      </div>

      {/* ── 주의 필요 항목 ──────────────────────────────────────────── */}
      {(pendingSubmissions > 0 || pendingUsers > 0) && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">확인 필요</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {pendingSubmissions > 0 && (
              <Link href="/admin/application-forms">
                <Card className="border-blue-200 bg-blue-50 py-0 transition-colors hover:bg-blue-100">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-xs font-medium text-blue-600">검토 대기 지원서</p>
                      <p className="mt-1 text-3xl font-bold text-blue-700">{pendingSubmissions}건</p>
                      <p className="mt-0.5 text-xs text-blue-500">전체 {totalSubmissions}건 중</p>
                    </div>
                    <FileText className="size-8 text-blue-300" />
                  </CardContent>
                </Card>
              </Link>
            )}
            {pendingUsers > 0 && (
              <Link href="/admin/users">
                <Card className="border-amber-200 bg-amber-50 py-0 transition-colors hover:bg-amber-100">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="text-xs font-medium text-amber-600">승인 대기 회원</p>
                      <p className="mt-1 text-3xl font-bold text-amber-700">{pendingUsers}명</p>
                      <p className="mt-0.5 text-xs text-amber-500">전체 {totalMembers}명 중</p>
                    </div>
                    <UserCog className="size-8 text-amber-300" />
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── 전체 통계 ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">전체 현황</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "기수",          value: totalCohorts,    href: "/admin/recruitment" },
            { label: "회원",          value: totalMembers,    href: "/admin/users" },
            { label: "지원서",        value: totalSubmissions, href: "/admin/application-forms" },
            { label: "공지사항",      value: totalNotices,    href: "/admin/notices" },
            { label: "언론보도",      value: totalPress,      href: "/admin/press" },
            { label: "갤러리",        value: totalGalleries,  href: "/admin/gallery" },
            { label: "수료생 이야기", value: totalAlumni,     href: "/admin/alumni" },
          ].map(({ label, value, href }) => (
            <Link key={label} href={href}>
              <Card className="border-slate-200 bg-white py-0 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
                <CardContent className="px-4 py-4">
                  <p className="text-xs font-medium text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{value.toLocaleString("ko-KR")}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 관리 바로가기 ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">바로가기</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <Icon className="size-4 shrink-0 text-slate-400" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
