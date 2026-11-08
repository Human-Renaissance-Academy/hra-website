import { notFound } from "next/navigation";
import { formatKstDate as formatDate } from "@/lib/date-time";
import { z } from "zod/v4";
import { PrintView } from "./_print-view";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { getWebClassLogPrintable } from "@/features/class-logs/web/service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};


export default async function ClassLogPrintPage({ params }: Props) {
  const session = await requireSharedResourceReader();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const log = await getWebClassLogPrintable(session.user.role, parsedId.data);

  if (!log) {
    notFound();
  }

  const formattedDate = formatDate(log.classDate).replace(/\s/g, "");
  const fileTitle = `HRA수업일지_${log.title}_${formattedDate}`;

  return (
    <PrintView
      title={log.title}
      fileTitle={fileTitle}
      classDate={log.classDate}
      authorName={log.authorName}
      body={log.content}
    />
  );
}
