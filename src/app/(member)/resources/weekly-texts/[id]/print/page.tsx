import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { PrintView } from "./_print-view";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { getWebWeeklyTextPrintable } from "@/features/weekly-texts/web/service";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function WeeklyTextPrintPage({ params }: Props) {
  const session = await requireSharedResourceReader();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const text = await getWebWeeklyTextPrintable(session.user.role, parsedId.data);

  if (!text || !text.body) {
    notFound();
  }

  const fileTitle = `HRA주차별텍스트_${text.title}`;

  return (
    <PrintView
      title={text.title}
      fileTitle={fileTitle}
      createdAt={text.createdAt}
      cohortName={text.cohortName}
      textType={text.textType}
      body={text.body}
    />
  );
}
