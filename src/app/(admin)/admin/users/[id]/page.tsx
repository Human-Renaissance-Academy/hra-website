/** 관리자 회원 상세 Web 화면으로 UUID·누락 처리와 최소 표시 props를 담당합니다. */
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin";
import { getAdminUser, listAdminCohorts } from "@/features/users/admin/service";
import { formatKstDateTime as formatDate } from "@/lib/date-time";
import { UserRoleButton } from "../_components/user-role-button";

export const dynamic = "force-dynamic";

type AdminUserDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const session = await requireAdmin();
  const { id } = await params;

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  // 사용자 정보와 기수 목록을 병렬 조회
  const actor = { userId: session.user.id, role: session.user.role };
  const [user, cohortList] = await Promise.all([
    getAdminUser(actor, parsedId.data),
    listAdminCohorts(actor),
  ]);

  if (!user) {
    notFound();
  }

  const isOAuthUser = !user.hasPassword;
  const isSelf = session.user?.id === user.id;

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-4 text-slate-600" render={<Link href="/admin/users" />}>
          <ArrowLeft className="mr-1 size-4" />
          회원 목록
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">회원 상세</h1>
      </div>

      <div className="space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-base text-slate-900">프로필 정보</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  width={80}
                  height={80}
                  className="rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full bg-slate-100 text-2xl font-semibold text-slate-400">
                  {user.name.charAt(0)}
                </div>
              )}

              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-sm text-slate-500">이름</p>
                  <p className="text-lg font-medium text-slate-900">{user.name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">이메일</p>
                  <p className="text-slate-700">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">로그인 방식</p>
                  <p className="text-slate-700">{isOAuthUser ? "소셜 로그인 (카카오/구글)" : "이메일/비밀번호"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-base text-slate-900">역할 및 권한</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">현재 역할</p>
                <Badge
                  variant={user.role === "ADMIN" || user.role === "FACULTY" ? "default" : "secondary"}
                  className={
                    user.role === "ADMIN"
                      ? "bg-blue-100 text-blue-700"
                      : user.role === "FACULTY"
                        ? "bg-purple-100 text-purple-700"
                        : user.role === "PENDING"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700"
                  }
                >
                  {user.role === "ADMIN"
                    ? "관리자"
                    : user.role === "FACULTY"
                      ? "교수"
                      : user.role === "PENDING"
                        ? "승인 대기"
                        : "멤버"}
                </Badge>
              </div>

              {isSelf ? (
                <span className="text-sm text-slate-400">본인 계정은 변경할 수 없습니다</span>
              ) : (
                <UserRoleButton
                  userId={user.id}
                  currentRole={user.role}
                  currentCohortId={user.cohortId ?? null}
                  cohorts={cohortList}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200">
            <CardTitle className="text-base text-slate-900">계정 정보</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-slate-500">가입일</p>
                <p className="text-slate-700">{formatDate(user.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">최종 수정일</p>
                <p className="text-slate-700">{formatDate(user.updatedAt)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">회원 ID</p>
                <p className="font-mono text-xs text-slate-400">{user.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
