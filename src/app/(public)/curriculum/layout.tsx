import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커리큘럼",
  description: "고전 읽기와 토론, 케이스 스터디 등 깊이 사고하고 넓게 실천하도록 설계된 HRA의 커리큘럼을 살펴보세요.",
  // 사이트 기준 주소(metadataBase)와 합쳐 이 페이지의 대표 주소(canonical)가 됩니다.
  alternates: { canonical: "/curriculum" },
};

export default function CurriculumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
