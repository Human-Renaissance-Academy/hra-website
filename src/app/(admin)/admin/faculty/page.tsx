/** 교수진 관리자 목록은 서비스의 표시 DTO로 기존 분류별 화면을 구성합니다. */
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteFaculty } from "@/features/faculty/actions";
import { requireAdmin } from "@/lib/admin";
import { listAdminFaculty } from "@/features/faculty/admin/service";

export const metadata = { title: "교수진 관리" };

export const dynamic = "force-dynamic";

const categoryLabels = {
  CLASSICS: "고전읽기",
  BUSINESS: "기업실무",
  LECTURE: "특강",
} as const;

const categoryOrder = ["CLASSICS", "BUSINESS", "LECTURE"] as const;

export default async function AdminFacultyPage() {
  const session = await requireAdmin();

  // 카테고리 내에서 관리자가 지정한 순서를 먼저 적용하고 이름순으로 정렬
  const facultyMembers = await listAdminFaculty({ userId: session.user.id, role: session.user.role });

  const categorizedFacultyMembers = categoryOrder.map((category) => ({
    category,
    members: facultyMembers.filter((member) => member.category === category),
  }));

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">교수진 관리</h1>
        <Link href="/admin/faculty/new" className={buttonVariants({ className: "bg-[#1a1a1a] text-white hover:bg-[#333333]" })}>
          새 교수진 추가
        </Link>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
        <CardTitle className="text-base text-[#1a1a1a]">전체 교수진 {facultyMembers.length}명</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 py-4">
          {facultyMembers.length === 0 ? (
            <div className="py-8 text-center text-[#666666]">등록된 교수진이 없습니다.</div>
          ) : (
            categorizedFacultyMembers.map(({ category, members }) => (
              <section key={category} className="space-y-3">
                <div className="flex items-center justify-between gap-4 border-b border-[#D9D9D9] pb-2">
                  <h2 className="text-base font-semibold text-[#1a1a1a]">
                    {categoryLabels[category]} <span className="text-[#666666]">{members.length}명</span>
                  </h2>
                </div>

                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>이름</TableHead>
                        <TableHead>카테고리</TableHead>
                        <TableHead>현직</TableHead>
                        <TableHead>전직</TableHead>
                        <TableHead className="text-right">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-[#666666]">
                            등록된 교수진이 없습니다.
                          </TableCell>
                        </TableRow>
                      ) : (
                        members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium text-[#1a1a1a]">{member.name}</TableCell>
                            <TableCell className="text-[#666666]">{categoryLabels[member.category]}</TableCell>
                            <TableCell className="w-[28%] max-w-0 text-[#666666]"><span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">{member.currentPosition || "-"}</span></TableCell>
                            <TableCell className="w-[28%] max-w-0 text-[#666666]"><span className="block overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_80%,transparent_100%)]">{member.formerPosition || "-"}</span></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/admin/faculty/${member.id}`}
                                  className={buttonVariants({ variant: "outline" })}
                                >
                                  수정
                                </Link>
                                <form
                                  action={async (formData) => {
                                    "use server";

                                    const id = formData.get("id");
                                    await deleteFaculty(typeof id === "string" ? id : "");
                                  }}
                                >
                                  <input type="hidden" name="id" value={member.id} />
                                  <Button type="submit" variant="destructive">
                                    <Trash2 className="size-3.5" />
                                    삭제
                                  </Button>
                                </form>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
